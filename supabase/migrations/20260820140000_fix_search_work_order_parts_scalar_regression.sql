-- Re-fixes "cannot extract elements from a scalar" (Postgres 22023) in Find Part in
-- Work Orders search. 20260813190000_fix_search_work_order_parts_scalar_line_items.sql
-- originally fixed this by defensively coalescing/casting WorkOrder.line_items when
-- it was stored as a double-encoded JSON string instead of a true jsonb array. But
-- 20260815161600_create_search_work_order_parts_rpc.sql later did a bare
-- `create or replace function` with a new return signature that dropped that
-- defensive handling, reintroducing the bug for any legacy row still holding a
-- string-typed line_items (confirmed live on RO51678 and RO51689). This migration
-- keeps the newer return signature (matches current FindPartModal.jsx) but restores
-- the defensive unwrap.
create or replace function public.search_work_order_parts(
  p_search_term text,
  p_search_type text default 'part_number',
  p_filter_type text default 'contains'
)
returns table (
  ro_number text,
  wo_date date,
  customer_name text,
  part_number text,
  description text,
  serial_num text
)
language plpgsql
stable
as $function$
declare
  v_pattern text;
begin
  if p_search_term is null or btrim(p_search_term) = '' then
    return;
  end if;

  v_pattern := case p_filter_type
    when 'startsWith' then lower(p_search_term) || '%'
    when 'endsWith' then '%' || lower(p_search_term)
    else '%' || lower(p_search_term) || '%'
  end;

  return query
  select
    wo.ro_number,
    wo.wo_date,
    coalesce(c.org_name, btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) as customer_name,
    li ->> 'part_number' as part_number,
    li ->> 'description' as description,
    li ->> 'serial_num' as serial_num
  from public."WorkOrder" wo
  left join public."Customer" c on c.id = wo.customer_id
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(wo.line_items) = 'string' and trim(wo.line_items #>> '{}') like '[%'
      then (wo.line_items #>> '{}')::jsonb
      when jsonb_typeof(wo.line_items) = 'array'
      then wo.line_items
      else '[]'::jsonb
    end
  ) as li
  where
    case
      when p_search_type = 'serial_number' then lower(coalesce(li ->> 'serial_num', '')) like v_pattern
      else lower(coalesce(li ->> 'part_number', '')) like v_pattern
    end
  order by wo.wo_date desc nulls last
  limit 200;
end;
$function$;

grant execute on function public.search_work_order_parts(text, text, text) to anon, authenticated, service_role;
