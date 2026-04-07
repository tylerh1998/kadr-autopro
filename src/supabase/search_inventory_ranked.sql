create or replace function public.search_inventory_ranked(
    p_search_term text,
    p_filter text default 'all',
    p_sort_by text default 'part_number',
    p_sort_direction text default 'asc',
    p_limit integer default 50,
    p_offset integer default 0,
    p_location_from text default null,
    p_location_to text default null
)
returns table (
    id text,
    created_date timestamptz,
    updated_date timestamptz,
    created_by text,
    part_number text,
    description text,
    unit text,
    category text,
    supplier_id text,
    vendor text,
    manufacturer text,
    sales_class text,
    cost numeric,
    selling_price numeric,
    profit_margin numeric,
    quantity_on_hand numeric,
    quantity_on_order numeric,
    minimum_quantity numeric,
    maximum_quantity numeric,
    location text,
    core boolean,
    core_cost numeric,
    tag_along_id text,
    is_active boolean,
    stocked_item boolean,
    master_inventory_item_id text,
    duplicate_inventory_item_ids jsonb,
    match_rank integer,
    total_count bigint
)
language sql
as $$
with filtered as (
    select
        i.id::text as id,
        i.created_date,
        i.updated_date,
        i.created_by,
        i.part_number,
        i.description,
        i.unit,
        i.category,
        i.supplier_id,
        i.vendor,
        i.manufacturer,
        i.sales_class,
        i.cost::numeric as cost,
        i.selling_price::numeric as selling_price,
        i.profit_margin::numeric as profit_margin,
        i.quantity_on_hand::numeric as quantity_on_hand,
        i.quantity_on_order::numeric as quantity_on_order,
        i.minimum_quantity::numeric as minimum_quantity,
        i.maximum_quantity::numeric as maximum_quantity,
        i.location,
        i.core,
        i.core_cost::numeric as core_cost,
        i.tag_along_id,
        i.is_active,
        i.stocked_item,
        i.master_inventory_item_id,
        i.duplicate_inventory_item_ids::jsonb as duplicate_inventory_item_ids,
        case
            when lower(btrim(coalesce(i.part_number, ''))) = lower(btrim(p_search_term)) then 1
            when lower(btrim(coalesce(i.part_number, ''))) like lower(btrim(p_search_term)) || '%' then 2
            when lower(btrim(coalesce(i.part_number, ''))) like '%' || lower(btrim(p_search_term)) || '%' then 3
            when lower(btrim(coalesce(i.description, ''))) = lower(btrim(p_search_term)) then 4
            when lower(btrim(coalesce(i.description, ''))) like lower(btrim(p_search_term)) || '%' then 5
            when lower(btrim(coalesce(i.description, ''))) like '%' || lower(btrim(p_search_term)) || '%' then 6
            when lower(btrim(coalesce(i.manufacturer, ''))) like lower(btrim(p_search_term)) || '%' then 7
            when lower(btrim(coalesce(i.manufacturer, ''))) like '%' || lower(btrim(p_search_term)) || '%' then 8
            else 999
        end as match_rank
    from public."InventoryItem" i
    where i.is_active = true
      and (
        lower(btrim(coalesce(i.part_number, ''))) like '%' || lower(btrim(p_search_term)) || '%'
        or lower(btrim(coalesce(i.description, ''))) like '%' || lower(btrim(p_search_term)) || '%'
        or lower(btrim(coalesce(i.manufacturer, ''))) like '%' || lower(btrim(p_search_term)) || '%'
      )
      and (
        p_filter = 'all'
        or (p_filter = 'stocked' and coalesce(i.stocked_item, false) = true)
        or (p_filter = 'non-stocked' and coalesce(i.stocked_item, false) = false)
        or (p_filter = 'non-zero' and coalesce(i.quantity_on_hand::numeric, 0) > 0)
        or (p_filter = 'inventory-count' and i.location is not null and btrim(i.location) <> '')
        or (p_filter = 'no-location' and (i.location is null or btrim(i.location) = '') and coalesce(i.quantity_on_hand::numeric, 0) > 0)
      )
      and (p_location_from is null or p_location_from = '' or i.location >= p_location_from)
      and (p_location_to is null or p_location_to = '' or i.location <= p_location_to)
),
counted as (
    select *, count(*) over() as total_count
    from filtered
)
select
    id,
    created_date,
    updated_date,
    created_by,
    part_number,
    description,
    unit,
    category,
    supplier_id,
    vendor,
    manufacturer,
    sales_class,
    cost,
    selling_price,
    profit_margin,
    quantity_on_hand,
    quantity_on_order,
    minimum_quantity,
    maximum_quantity,
    location,
    core,
    core_cost,
    tag_along_id,
    is_active,
    stocked_item,
    master_inventory_item_id,
    duplicate_inventory_item_ids,
    match_rank,
    total_count
from counted
order by
    match_rank asc,
    case when p_sort_by = 'part_number' and p_sort_direction = 'asc' then part_number end asc,
    case when p_sort_by = 'part_number' and p_sort_direction = 'desc' then part_number end desc,
    case when p_sort_by = 'description' and p_sort_direction = 'asc' then description end asc,
    case when p_sort_by = 'description' and p_sort_direction = 'desc' then description end desc,
    case when p_sort_by = 'manufacturer' and p_sort_direction = 'asc' then manufacturer end asc,
    case when p_sort_by = 'manufacturer' and p_sort_direction = 'desc' then manufacturer end desc,
    case when p_sort_by = 'category' and p_sort_direction = 'asc' then category end asc,
    case when p_sort_by = 'category' and p_sort_direction = 'desc' then category end desc,
    case when p_sort_by = 'location' and p_sort_direction = 'asc' then location end asc,
    case when p_sort_by = 'location' and p_sort_direction = 'desc' then location end desc,
    case when p_sort_by = 'cost' and p_sort_direction = 'asc' then cost end asc,
    case when p_sort_by = 'cost' and p_sort_direction = 'desc' then cost end desc,
    case when p_sort_by = 'selling_price' and p_sort_direction = 'asc' then selling_price end asc,
    case when p_sort_by = 'selling_price' and p_sort_direction = 'desc' then selling_price end desc,
    case when p_sort_by = 'quantity_on_hand' and p_sort_direction = 'asc' then quantity_on_hand end asc,
    case when p_sort_by = 'quantity_on_hand' and p_sort_direction = 'desc' then quantity_on_hand end desc,
    case when p_sort_by = 'quantity_on_order' and p_sort_direction = 'asc' then quantity_on_order end asc,
    case when p_sort_by = 'quantity_on_order' and p_sort_direction = 'desc' then quantity_on_order end desc,
    case when p_sort_by = 'minimum_quantity' and p_sort_direction = 'asc' then minimum_quantity end asc,
    case when p_sort_by = 'minimum_quantity' and p_sort_direction = 'desc' then minimum_quantity end desc,
    case when p_sort_by = 'maximum_quantity' and p_sort_direction = 'asc' then maximum_quantity end asc,
    case when p_sort_by = 'maximum_quantity' and p_sort_direction = 'desc' then maximum_quantity end desc,
    case when p_sort_by = 'created_date' and p_sort_direction = 'asc' then created_date end asc,
    case when p_sort_by = 'created_date' and p_sort_direction = 'desc' then created_date end desc,
    case when p_sort_by = 'updated_date' and p_sort_direction = 'asc' then updated_date end asc,
    case when p_sort_by = 'updated_date' and p_sort_direction = 'desc' then updated_date end desc,
    part_number asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$$;