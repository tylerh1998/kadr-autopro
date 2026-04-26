drop function if exists public.apply_supplier_invoice_line_paid_updates(text, jsonb);
drop function if exists public.apply_supplier_invoice_line_paid_updates(jsonb);

create or replace function public.apply_supplier_invoice_line_paid_updates(
  p_supplier_id text,
  p_applied_invoices jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_applied_detail jsonb;
  v_target_line record;
  v_remaining_for_invoice numeric;
  v_due numeric;
  v_pay_amount numeric;
  v_updated_count integer := 0;
  v_updated_at timestamptz := now();
  v_found_by_id boolean := false;
begin
  if nullif(p_supplier_id, '') is null then
    raise exception 'p_supplier_id is required';
  end if;

  if p_applied_invoices is null or jsonb_typeof(p_applied_invoices) <> 'array' then
    raise exception 'p_applied_invoices must be a JSON array';
  end if;

  for v_applied_detail in
    select value from jsonb_array_elements(p_applied_invoices)
  loop
    v_found_by_id := false;

    if coalesce(v_applied_detail->>'invoice_number', '') = 'On Account' then
      continue;
    end if;

    v_remaining_for_invoice := coalesce(nullif(v_applied_detail->>'amount_applied', '')::numeric, 0);

    if abs(v_remaining_for_invoice) <= 0.005 then
      continue;
    end if;

    if nullif(v_applied_detail->>'id', '') is not null then
      select
        id,
        coalesce(purchase_amount, 0) as purchase_amount,
        coalesce(gst_amount, 0) as gst_amount,
        coalesce(paid_amount, 0) as paid_amount
      into v_target_line
      from public."SupplierInvoiceLine"
      where id::text = v_applied_detail->>'id'
        and supplier_id::text = p_supplier_id
      limit 1;

      if found then
        v_found_by_id := true;
      end if;
    end if;

    if v_found_by_id then
      update public."SupplierInvoiceLine"
      set
        paid_amount = round(paid_amount + v_remaining_for_invoice, 2),
        updated_date = v_updated_at
      where id = v_target_line.id;

      v_updated_count := v_updated_count + 1;
      continue;
    end if;

    for v_target_line in
      select
        id,
        coalesce(purchase_amount, 0) as purchase_amount,
        coalesce(gst_amount, 0) as gst_amount,
        coalesce(paid_amount, 0) as paid_amount
      from public."SupplierInvoiceLine"
      where supplier_id::text = p_supplier_id
        and coalesce(invoice_number::text, '') = coalesce(v_applied_detail->>'invoice_number', '')
      order by (
        coalesce(purchase_amount, 0)
        + coalesce(gst_amount, 0)
        - coalesce(paid_amount, 0)
      ) asc,
      invoice_date desc nulls last,
      created_date desc nulls last,
      id asc
    loop
      exit when abs(v_remaining_for_invoice) <= 0.005;

      v_due := (v_target_line.purchase_amount + v_target_line.gst_amount) - v_target_line.paid_amount;

      if v_remaining_for_invoice > 0 then
        if v_due <= 0.005 then
          continue;
        end if;
        v_pay_amount := least(v_remaining_for_invoice, v_due);
      else
        if v_due >= -0.005 then
          continue;
        end if;
        v_pay_amount := greatest(v_remaining_for_invoice, v_due);
      end if;

      update public."SupplierInvoiceLine"
      set
        paid_amount = round(
          (
            coalesce(nullif(paid_amount::text, '')::numeric, 0)
            + v_pay_amount
          )::numeric,
          2
        ),
        updated_date = v_updated_at
      where id = v_target_line.id;

      v_remaining_for_invoice := v_remaining_for_invoice - v_pay_amount;
      v_updated_count := v_updated_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'updated_at', v_updated_at
  );
end;
$$;