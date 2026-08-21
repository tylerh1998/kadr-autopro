-- Fixes customer showing as "Unknown" in Find Part search when the matched
-- Customer row has org_name = '' (empty string) rather than NULL — e.g. RAY TOEWS
-- on RO51645. coalesce(c.org_name, ...) only falls through on NULL, so an empty
-- string short-circuits it and the frontend (FindPartModal.jsx: item.customer_name
-- || 'Unknown') then renders "Unknown" for a falsy empty string.
-- Same bug class as 20260820140000_fix_search_work_order_parts_scalar_regression.sql
-- (a byproduct of the same 20260815161600 rewrite) and the same nullif() pattern
-- already used correctly elsewhere, e.g. 20260813190000 and 20260815161700.
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
    coalesce(nullif(c.org_name, ''), nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')) as customer_name,
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
