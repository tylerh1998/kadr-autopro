-- search_work_orders is called from src/pages/WorkOrders.jsx and
-- src/components/work-orders/OpenROModal.jsx but was never created in the
-- database, so the Work Orders page and Open RO search return nothing
-- (PGRST202 "Could not find the function public.search_work_orders").
create or replace function public.search_work_orders(
  p_stages text[] default null,
  p_search_term text default null,
  p_match jsonb default null,
  p_sort text default 'number_desc',
  p_limit integer default null,
  p_offset integer default 0
)
returns setof jsonb
language sql
stable
as $function$
  with filtered as (
    select
      to_jsonb(wo) || jsonb_build_object('Customer', to_jsonb(c), 'Vehicle', to_jsonb(v)) as row_data,
      wo.total_amount,
      case
        when wo.stage = 'estimate' then wo.est_date
        when wo.stage = 'work_order' then wo.wo_date
        when wo.stage in ('invoice', 'credit_invoice') then wo.invoice_date
        else wo.completed_date
      end as relevant_date,
      coalesce(c.org_name, btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) as customer_name,
      nullif(regexp_replace(coalesce(wo.inv_number, wo.crinv_number, wo.est_number, wo.wo_number, wo.ro_number, ''), '\D', '', 'g'), '')::numeric as number_key
    from public."WorkOrder" wo
    left join public."Customer" c on c.id = wo.customer_id
    left join public."Vehicle" v on v.id = wo.vehicle_id
    where
      (p_stages is null or wo.stage = any(p_stages))
      and (
        p_match is null
        or (p_match ? 'ro_number' and wo.ro_number = p_match ->> 'ro_number')
        or (p_match ? 'wo_number' and wo.wo_number = p_match ->> 'wo_number')
        or (p_match ? 'est_number' and wo.est_number = p_match ->> 'est_number')
        or (p_match ? 'inv_number' and wo.inv_number = p_match ->> 'inv_number')
        or (p_match ? 'crinv_number' and wo.crinv_number = p_match ->> 'crinv_number')
      )
      and (
        p_search_term is null or btrim(p_search_term) = ''
        or wo.ro_number ilike '%' || p_search_term || '%'
        or wo.wo_number ilike '%' || p_search_term || '%'
        or wo.inv_number ilike '%' || p_search_term || '%'
        or wo.crinv_number ilike '%' || p_search_term || '%'
        or wo.est_number ilike '%' || p_search_term || '%'
        or wo.po_number ilike '%' || p_search_term || '%'
        or c.org_name ilike '%' || p_search_term || '%'
        or c.first_name ilike '%' || p_search_term || '%'
        or c.last_name ilike '%' || p_search_term || '%'
        or v.make ilike '%' || p_search_term || '%'
        or v.model ilike '%' || p_search_term || '%'
        or v.vin ilike '%' || p_search_term || '%'
        or v.license_plate ilike '%' || p_search_term || '%'
      )
  ),
  counted as (
    select *, count(*) over() as total_count
    from filtered
  )
  select row_data || jsonb_build_object('total_count', total_count)
  from counted
  order by
    case when p_sort = 'customer_az' then customer_name end asc nulls last,
    case when p_sort = 'customer_za' then customer_name end desc nulls last,
    case when p_sort = 'date_newest' then relevant_date end desc nulls last,
    case when p_sort = 'date_oldest' then relevant_date end asc nulls last,
    case when p_sort = 'amount_highest' then total_amount end desc nulls last,
    case when p_sort = 'amount_lowest' then total_amount end asc nulls last,
    case when p_sort = 'number_asc' then number_key end asc nulls last,
    case when p_sort is null or p_sort = 'number_desc' then number_key end desc nulls last,
    number_key desc nulls last
  limit coalesce(p_limit, 2147483647)
  offset coalesce(p_offset, 0);
$function$;

grant execute on function public.search_work_orders(text[], text, jsonb, text, integer, integer) to anon, authenticated, service_role;
