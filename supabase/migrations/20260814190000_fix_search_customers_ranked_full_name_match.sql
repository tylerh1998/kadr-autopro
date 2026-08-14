-- Fixes search_customers_ranked never matching "First Last" full-name searches.
-- Root cause: the match_rank CASE expression already had full-name tiers (rank 3
-- exact, rank 9 partial), but the WHERE clause never checked the concatenated
-- full name, so those tiers were unreachable dead code. Adds one OR condition
-- matching the same normalization already used by the CASE tiers.
-- Pre_go-live_plan.md P1. Dev-verified 2026-08-14 before promotion to production.
CREATE OR REPLACE FUNCTION public.search_customers_ranked(p_search_term text, p_include_inactive boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id text, created_date timestamp with time zone, updated_date timestamp with time zone, created_by text, org_name text, first_name text, last_name text, phone text, secondary_phone text, email text, address text, city text, state text, zip_code text, notes text, default_taxable boolean, is_active boolean, cusid text, match_rank integer, total_count bigint)
 LANGUAGE sql
AS $function$
with filtered as (
    select
        c.id::text as id,
        c.created_date,
        c.updated_date,
        c.created_by,
        c.org_name,
        c.first_name,
        c.last_name,
        c.phone,
        c.secondary_phone,
        c.email,
        c.address,
        c.city,
        c.state,
        c.zip_code,
        c.notes,
        case
            when c.default_taxable::text in ('true', '1', 't', 'y', 'yes') then true
            when c.default_taxable::text in ('false', '0', 'f', 'n', 'no') then false
            else false
        end as default_taxable,
        case
            when c.is_active::text in ('false', '0', 'f', 'n', 'no') then false
            else true
        end as is_active,
        c.cusid,
        case
            when lower(coalesce(c.org_name, '')) = lower(p_search_term) then 1
            when lower(coalesce(c.org_name, '')) like lower(p_search_term) || '%' then 2
            when lower(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) = lower(p_search_term) then 3
            when lower(coalesce(c.last_name, '')) = lower(p_search_term) or lower(coalesce(c.first_name, '')) = lower(p_search_term) then 4
            when lower(coalesce(c.last_name, '')) like lower(p_search_term) || '%' or lower(coalesce(c.first_name, '')) like lower(p_search_term) || '%' then 5
            when lower(coalesce(c.email, '')) = lower(p_search_term) then 6
            when regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = regexp_replace(p_search_term, '\D', '', 'g') and regexp_replace(p_search_term, '\D', '', 'g') <> '' then 7
            when regexp_replace(coalesce(c.secondary_phone, ''), '\D', '', 'g') = regexp_replace(p_search_term, '\D', '', 'g') and regexp_replace(p_search_term, '\D', '', 'g') <> '' then 7
            when lower(coalesce(c.org_name, '')) like '%' || lower(p_search_term) || '%' then 8
            when lower(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like '%' || lower(p_search_term) || '%' then 9
            when lower(coalesce(c.email, '')) like lower(p_search_term) || '%' then 10
            when lower(coalesce(c.email, '')) like '%' || lower(p_search_term) || '%' then 11
            when regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_search_term, '\D', '', 'g') || '%' and regexp_replace(p_search_term, '\D', '', 'g') <> '' then 12
            when regexp_replace(coalesce(c.secondary_phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_search_term, '\D', '', 'g') || '%' and regexp_replace(p_search_term, '\D', '', 'g') <> '' then 12
            else 999
        end as match_rank
    from public."Customer" c
    where (p_include_inactive = true or case when c.is_active::text in ('false', '0', 'f', 'n', 'no') then false else true end = true)
      and (
        lower(coalesce(c.org_name, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(c.first_name, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(c.last_name, '')) like '%' || lower(p_search_term) || '%'
        or lower(coalesce(c.email, '')) like '%' || lower(p_search_term) || '%'
        or lower(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like '%' || lower(p_search_term) || '%'
        or (regexp_replace(p_search_term, '\D', '', 'g') <> '' and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_search_term, '\D', '', 'g') || '%')
        or (regexp_replace(p_search_term, '\D', '', 'g') <> '' and regexp_replace(coalesce(c.secondary_phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_search_term, '\D', '', 'g') || '%')
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
    org_name,
    first_name,
    last_name,
    phone,
    secondary_phone,
    email,
    address,
    city,
    state,
    zip_code,
    notes,
    default_taxable,
    is_active,
    cusid,
    match_rank,
    total_count
from counted
order by
    match_rank asc,
    coalesce(org_name, btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$function$
;
