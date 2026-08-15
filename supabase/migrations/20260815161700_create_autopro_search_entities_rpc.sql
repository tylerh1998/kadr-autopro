-- autopro_search_entities is called from src/components/admin/DatabaseQueryTool.jsx
-- (the admin cross-table "OmniSearch" tool) but was never created in the database.
create or replace function public.autopro_search_entities(
  query_text text default null,
  tables_filter text[] default array['Customer','Vehicle','InventoryItem','WorkOrder','Supplier'],
  date_from timestamptz default null,
  date_to timestamptz default null,
  customer_id_lock text default null,
  vehicle_id_lock text default null
)
returns table (
  table_name text,
  row_id text,
  display_title text,
  showcase_data jsonb,
  full_row jsonb,
  created_date timestamptz
)
language sql
stable
as $function$
  with q as (
    select nullif(btrim(coalesce(query_text, '')), '') as term
  ),
  customer_rows as (
    select
      'Customer'::text as table_name,
      c.id as row_id,
      coalesce(nullif(c.org_name, ''), btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) as display_title,
      jsonb_build_object(
        'ID/CusID', coalesce(c.cusid, c.id),
        'Name', coalesce(nullif(c.org_name, ''), btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))),
        'Phone', c.phone
      ) as showcase_data,
      to_jsonb(c) as full_row,
      c.created_date
    from public."Customer" c, q
    where 'Customer' = any(tables_filter)
      and ((customer_id_lock is null and vehicle_id_lock is null) or (customer_id_lock is not null and c.id = customer_id_lock))
      and (date_from is null or c.created_date >= date_from)
      and (date_to is null or c.created_date <= date_to)
      and (
        q.term is null
        or c.org_name ilike '%' || q.term || '%'
        or c.first_name ilike '%' || q.term || '%'
        or c.last_name ilike '%' || q.term || '%'
        or c.phone ilike '%' || q.term || '%'
        or c.secondary_phone ilike '%' || q.term || '%'
        or c.email ilike '%' || q.term || '%'
        or c.cusid ilike '%' || q.term || '%'
        or c.address ilike '%' || q.term || '%'
        or c.city ilike '%' || q.term || '%'
        or c.notes ilike '%' || q.term || '%'
      )
  ),
  vehicle_rows as (
    select
      'Vehicle'::text as table_name,
      v.id as row_id,
      btrim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) as display_title,
      jsonb_build_object(
        'Plate', v.license_plate,
        'VIN', v.vin,
        'Make/Model', btrim(coalesce(v.make, '') || ' ' || coalesce(v.model, ''))
      ) as showcase_data,
      to_jsonb(v) as full_row,
      v.created_date
    from public."Vehicle" v, q
    where 'Vehicle' = any(tables_filter)
      and (customer_id_lock is null or v.customer_id = customer_id_lock)
      and (vehicle_id_lock is null or v.id = vehicle_id_lock)
      and (date_from is null or v.created_date >= date_from)
      and (date_to is null or v.created_date <= date_to)
      and (
        q.term is null
        or v.make ilike '%' || q.term || '%'
        or v.model ilike '%' || q.term || '%'
        or v.vin ilike '%' || q.term || '%'
        or v.license_plate ilike '%' || q.term || '%'
        or v.unit_number ilike '%' || q.term || '%'
        or v.notes ilike '%' || q.term || '%'
        or v.color ilike '%' || q.term || '%'
        or v.trim ilike '%' || q.term || '%'
      )
  ),
  workorder_rows as (
    select
      'WorkOrder'::text as table_name,
      wo.id as row_id,
      'WO #' || coalesce(nullif(wo.wo_number, ''), wo.ro_number) as display_title,
      jsonb_build_object(
        'RO/WO #', wo.ro_number,
        'Stage', wo.stage,
        'Status', wo.status
      ) as showcase_data,
      to_jsonb(wo) as full_row,
      wo.created_date
    from public."WorkOrder" wo, q
    where 'WorkOrder' = any(tables_filter)
      and (customer_id_lock is null or wo.customer_id = customer_id_lock)
      and (vehicle_id_lock is null or wo.vehicle_id = vehicle_id_lock)
      and (date_from is null or wo.created_date >= date_from)
      and (date_to is null or wo.created_date <= date_to)
      and (
        q.term is null
        or wo.ro_number ilike '%' || q.term || '%'
        or wo.wo_number ilike '%' || q.term || '%'
        or wo.est_number ilike '%' || q.term || '%'
        or wo.inv_number ilike '%' || q.term || '%'
        or wo.crinv_number ilike '%' || q.term || '%'
        or wo.description ilike '%' || q.term || '%'
        or wo.internal_notes ilike '%' || q.term || '%'
        or wo.notes_to_customer ilike '%' || q.term || '%'
        or wo.po_number ilike '%' || q.term || '%'
      )
  ),
  inventory_rows as (
    select
      'InventoryItem'::text as table_name,
      i.id as row_id,
      coalesce(nullif(i.part_number, ''), i.id) || case when coalesce(i.description, '') <> '' then ' - ' || i.description else '' end as display_title,
      jsonb_build_object(
        'Part #', i.part_number,
        'Category', i.category,
        'QOH', i.quantity_on_hand
      ) as showcase_data,
      to_jsonb(i) as full_row,
      i.created_date
    from public."InventoryItem" i, q
    where 'InventoryItem' = any(tables_filter)
      and customer_id_lock is null
      and vehicle_id_lock is null
      and (date_from is null or i.created_date >= date_from)
      and (date_to is null or i.created_date <= date_to)
      and (
        q.term is null
        or i.part_number ilike '%' || q.term || '%'
        or i.description ilike '%' || q.term || '%'
        or i.manufacturer ilike '%' || q.term || '%'
        or i.vendor ilike '%' || q.term || '%'
        or i.category ilike '%' || q.term || '%'
        or i.location ilike '%' || q.term || '%'
      )
  ),
  supplier_rows as (
    select
      'Supplier'::text as table_name,
      s.id as row_id,
      coalesce(nullif(s.name, ''), s.id) as display_title,
      jsonb_build_object(
        'Account #', s.account_number,
        'Contact', s.contact_person,
        'Phone', s.phone
      ) as showcase_data,
      to_jsonb(s) as full_row,
      s.created_date
    from public."Supplier" s, q
    where 'Supplier' = any(tables_filter)
      and customer_id_lock is null
      and vehicle_id_lock is null
      and (date_from is null or s.created_date >= date_from)
      and (date_to is null or s.created_date <= date_to)
      and (
        q.term is null
        or s.name ilike '%' || q.term || '%'
        or s.account_number ilike '%' || q.term || '%'
        or s.contact_person ilike '%' || q.term || '%'
        or s.phone ilike '%' || q.term || '%'
        or s.email ilike '%' || q.term || '%'
        or s.notes ilike '%' || q.term || '%'
        or s.town ilike '%' || q.term || '%'
      )
  )
  select * from customer_rows
  union all
  select * from vehicle_rows
  union all
  select * from workorder_rows
  union all
  select * from inventory_rows
  union all
  select * from supplier_rows
  order by created_date desc nulls last
  limit 300;
$function$;

grant execute on function public.autopro_search_entities(text, text[], timestamptz, timestamptz, text, text) to anon, authenticated, service_role;
