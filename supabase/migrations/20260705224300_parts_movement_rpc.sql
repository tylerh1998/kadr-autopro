CREATE OR REPLACE FUNCTION get_parts_movement_v2(
    p_start_date date,
    p_end_date date,
    p_search_term text DEFAULT ''
)
RETURNS TABLE (
    inventory_item_id text,
    part_number text,
    description text,
    category text,
    list_price double precision,
    wip_qty numeric,
    wip_amount numeric,
    invoiced_qty numeric,
    invoiced_amount numeric
) AS $$
BEGIN
    RETURN QUERY
    WITH unnested_lines AS (
        SELECT 
            wo.stage,
            line->>'inventory_item_id' AS item_id,
            
            CASE 
                WHEN wo.stage = 'credit_invoice' AND COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric > 0 
                THEN -COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric
                ELSE COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric
            END AS qty,
            
            CASE
                WHEN wo.stage = 'credit_invoice' AND 
                     COALESCE(NULLIF(TRIM(line->>'tot_parts'), ''), 
                              (COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric * COALESCE(NULLIF(REPLACE(REPLACE(line->>'parts_ea', '$', ''), ',', ''), ''), '0')::numeric)::text)::numeric > 0 
                THEN -COALESCE(NULLIF(TRIM(line->>'tot_parts'), ''), 
                               (COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric * COALESCE(NULLIF(REPLACE(REPLACE(line->>'parts_ea', '$', ''), ',', ''), ''), '0')::numeric)::text)::numeric
                ELSE COALESCE(NULLIF(TRIM(line->>'tot_parts'), ''), 
                              (COALESCE(NULLIF(TRIM(line->>'qty'), ''), '0')::numeric * COALESCE(NULLIF(REPLACE(REPLACE(line->>'parts_ea', '$', ''), ',', ''), ''), '0')::numeric)::text)::numeric
            END AS amount
            
        FROM "WorkOrder" wo
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE 
                WHEN jsonb_typeof(wo.line_items) = 'string' AND TRIM(wo.line_items #>> '{}') LIKE '[%' 
                THEN (wo.line_items #>> '{}')::jsonb
                WHEN jsonb_typeof(wo.line_items) = 'array' 
                THEN wo.line_items
                ELSE '[]'::jsonb
            END
        ) AS line
        WHERE wo.stage IN ('work_order', 'invoice', 'credit_invoice')
          AND (
            (wo.stage = 'work_order' AND wo.wo_date >= p_start_date AND wo.wo_date <= p_end_date)
            OR
            (wo.stage IN ('invoice', 'credit_invoice') AND wo.invoice_date >= p_start_date AND wo.invoice_date <= p_end_date)
          )
    ),
    aggregated_lines AS (
        SELECT
            u.item_id,
            SUM(CASE WHEN u.stage = 'work_order' THEN u.qty ELSE 0 END) AS wip_qty,
            SUM(CASE WHEN u.stage = 'work_order' THEN u.amount ELSE 0 END) AS wip_amount,
            SUM(CASE WHEN u.stage IN ('invoice', 'credit_invoice') THEN u.qty ELSE 0 END) AS invoiced_qty,
            SUM(CASE WHEN u.stage IN ('invoice', 'credit_invoice') THEN u.amount ELSE 0 END) AS invoiced_amount
        FROM unnested_lines u
        WHERE u.item_id IS NOT NULL AND u.item_id != ''
        GROUP BY u.item_id
    )
    SELECT 
        a.item_id,
        i.part_number,
        i.description,
        i.category,
        i.selling_price AS list_price,
        a.wip_qty,
        a.wip_amount,
        a.invoiced_qty,
        a.invoiced_amount
    FROM aggregated_lines a
    JOIN "InventoryItem" i ON i.id = a.item_id
    WHERE (p_search_term IS NULL OR p_search_term = '' OR 
           i.part_number ILIKE '%' || p_search_term || '%' OR 
           i.description ILIKE '%' || p_search_term || '%' OR 
           i.category ILIKE '%' || p_search_term || '%')
    ORDER BY (a.invoiced_qty + a.wip_qty) DESC;
END;
$$ LANGUAGE plpgsql;
