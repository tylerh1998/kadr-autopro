-- Fix "cannot extract elements from a scalar" in Find Part in Work Orders.
-- Root cause: WorkOrder.line_items is a genuine jsonb column, but a large share of
-- existing rows hold it as a JSON *string* (jsonb_typeof = 'string', e.g. the text
-- "[]" or "[{...}]") rather than a true jsonb array, left over from a frontend save
-- path that double-encoded it (src/components/work-orders/utils/buildWorkOrderSavePayload.js,
-- fixed separately). jsonb_array_elements() throws when given a scalar, so this
-- function failed outright for any search whenever it scanned one of those rows.
-- Same defensive CASE pattern already used by get_parts_movement_v2
-- (supabase/migrations/20260705224300_parts_movement_rpc.sql).
CREATE OR REPLACE FUNCTION public.search_work_order_parts(p_search_term text, p_search_type text, p_filter_type text)
 RETURNS TABLE(work_order_id text, ro_number text, wo_date text, customer_id text, vehicle_id text, description text, part_number text, serial_num text, line_item_id text, customer_name text)
 LANGUAGE sql
AS $function$
with items as (
  select wo.id as work_order_id, wo.ro_number, coalesce(wo.wo_date::text, wo.created_at::text) as wo_date,
         wo.customer_id, wo.vehicle_id,
         li ->> 'description' as description,
         li ->> 'part_number' as part_number,
         li ->> 'serial_num' as serial_num,
         li ->> 'id' as line_item_id,
         case p_search_type
           when 'part_number' then lower(coalesce(li ->> 'part_number', ''))
           when 'serial_number' then lower(coalesce(li ->> 'serial_num', ''))
           else ''
         end as value_to_check
  from "WorkOrder" wo, jsonb_array_elements(
    case
      when jsonb_typeof(wo.line_items) = 'string' and trim(wo.line_items #>> '{}') like '[%'
      then (wo.line_items #>> '{}')::jsonb
      when jsonb_typeof(wo.line_items) = 'array'
      then wo.line_items
      else '[]'::jsonb
    end
  ) li
  where wo.line_items is not null
),
matched as (
  select i.*
  from items i
  where btrim(coalesce(p_search_term, '')) <> ''
    and i.value_to_check <> ''
    and (
      (p_filter_type = 'contains'   and i.value_to_check like '%' || lower(p_search_term) || '%') or
      (p_filter_type = 'startsWith' and i.value_to_check like lower(p_search_term) || '%') or
      (p_filter_type = 'endsWith'   and i.value_to_check like '%' || lower(p_search_term)) or
      (p_filter_type = 'exact'      and i.value_to_check = lower(p_search_term))
    )
)
select
  m.work_order_id, m.ro_number, m.wo_date, m.customer_id, m.vehicle_id,
  m.description, m.part_number, m.serial_num, m.line_item_id,
  coalesce(nullif(c.org_name, ''), nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), 'Unknown') as customer_name
from matched m
left join "Customer" c on c.id = m.customer_id
order by m.ro_number desc
limit 2000;
$function$
;
