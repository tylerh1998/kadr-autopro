create or replace function public.apply_supplier_invoice_line_paid_updates(
  p_updates jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_updated_count integer := 0;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_updates)
  loop
    if nullif(v_item->>'id', '') is null then
      raise exception 'Each update must include id';
    end if;

    update public."SupplierInvoiceLine"
    set
      paid_amount = coalesce((v_item->>'paid_amount')::numeric, 0),
      updated_date = coalesce((v_item->>'updated_date')::timestamptz, now())
    where id = v_item->>'id';

    if not found then
      raise exception 'SupplierInvoiceLine not found for id %', v_item->>'id';
    end if;

    v_updated_count := v_updated_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
end;
$$;