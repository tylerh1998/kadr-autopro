create or replace function public.search_vehicles_ranked(
    p_search_term text,
    p_include_inactive boolean default false,
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    id text,
    created_date timestamptz,
    updated_date timestamptz,
    created_by text,
    customer_id text,
    year numeric,
    make text,
    model text,
    "trim" text,
    vin text,
    license_plate text,
    unit_number text,
    color text,
    engine text,
    mileage text,
    odometer_date text,
    notes text,
    is_active boolean,
    vehid text,
    match_rank integer,
    total_count bigint
)
language sql
as $$
with filtered as (
    select
        v.id::text as id,
        v.created_date::timestamptz,
        v.updated_date::timestamptz,
        v.created_by::text,
        v.customer_id::text,
        v.year::numeric,
        v.make::text,
        v.model::text,
        v."trim"::text,
        v.vin::text,
        v.license_plate::text,
        v.unit_number::text,
        v.color::text,
        v.engine::text,
        v.mileage::text,
        v.odometer_date::text,
        v.notes::text,
        case 
            when v.is_active::text in ('false', '0', 'f', 'n', 'no') then false 
            else true 
        end as is_active,
        v.vehid::text,
        case
            when lower(coalesce(v.vin, '')) = lower(p_search_term) or lower(coalesce(v.license_plate, '')) = lower(p_search_term) then 1
            when lower(coalesce(v.vin, '')) like '%' || lower(p_search_term) || '%' or lower(coalesce(v.license_plate, '')) like '%' || lower(p_search_term) || '%' then 2
            when lower(coalesce(v.unit_number, '')) = lower(p_search_term) then 3
            when lower(coalesce(v.unit_number, '')) like '%' || lower(p_search_term) || '%' then 4
            when lower(coalesce(c.org_name, '')) like '%' || lower(p_search_term) || '%' or lower(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like '%' || lower(p_search_term) || '%' then 5
            when lower(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) like '%' || lower(p_search_term) || '%' then 6
            when lower(coalesce(v.make, '')) like '%' || lower(p_search_term) || '%' or lower(coalesce(v.model, '')) like '%' || lower(p_search_term) || '%' then 7
            when lower(coalesce(v.year::text, '')) like '%' || lower(p_search_term) || '%' then 8
            else 999
        end as match_rank
    from public."Vehicle" v
    left join public."Customer" c on v.customer_id = c.id::text
    where (p_include_inactive = true or case when v.is_active::text in ('false', '0', 'f', 'n', 'no') then false else true end = true)
      and (
        lower(coalesce(v.vin, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.license_plate, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.unit_number, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(c.org_name, '')) like '%' || lower(p_search_term) || '%'
        or lower(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.make, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.model, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(v.year::text, '')) like '%' || lower(p_search_term) || '%'
      )
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
    customer_id,
    year,
    make,
    model,
    "trim",
    vin,
    license_plate,
    unit_number,
    color,
    engine,
    mileage,
    odometer_date,
    notes,
    is_active,
    vehid,
    match_rank,
    total_count
from counted
order by
    match_rank asc,
    year desc, make asc, model asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$$;