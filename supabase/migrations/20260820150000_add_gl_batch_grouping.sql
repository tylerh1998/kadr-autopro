-- GL batch grouping: adds a single batch_id column to GLTransaction so related debit/credit
-- rows can be displayed and audited as one logical transaction, without a Header/Line rewrite.
-- Supplier invoices are a flat table with no invoice-level primary key, so a persisted
-- conceptual_invoice_id on SupplierInvoiceLine gives them a stable grouping key that survives
-- a user editing invoice_number/supplier_id later (see resolve_supplier_invoice_conceptual_ids
-- below, used by autopro-saveSupplierInvoiceTransactions and autopro-processInventoryReceipt).

alter table public."GLTransaction"
  add column if not exists batch_id text;

create index if not exists idx_gltransaction_batch_id
  on public."GLTransaction" (batch_id);

alter table public."SupplierInvoiceLine"
  add column if not exists conceptual_invoice_id uuid;

create index if not exists idx_supplierinvoiceline_supplier_invoice_number
  on public."SupplierInvoiceLine" (supplier_id, invoice_number);

create index if not exists idx_supplierinvoiceline_conceptual_invoice_id
  on public."SupplierInvoiceLine" (conceptual_invoice_id);

-- Backfill: group existing lines by (supplier_id, invoice_number). Rows missing either field
-- can't be grouped meaningfully, so each gets its own singleton id rather than being lumped
-- together under one supplier's "blank invoice number" bucket.
with groups as (
  select supplier_id, invoice_number, gen_random_uuid() as gid
  from public."SupplierInvoiceLine"
  where supplier_id is not null and nullif(invoice_number, '') is not null
  group by supplier_id, invoice_number
)
update public."SupplierInvoiceLine" sil
set conceptual_invoice_id = g.gid
from groups g
where sil.supplier_id = g.supplier_id
  and sil.invoice_number = g.invoice_number
  and sil.conceptual_invoice_id is null;

update public."SupplierInvoiceLine"
set conceptual_invoice_id = gen_random_uuid()
where conceptual_invoice_id is null;

-- Left nullable deliberately (not NOT NULL): there is more than one code path that inserts
-- SupplierInvoiceLine rows (autopro-saveSupplierInvoiceTransactions,
-- autopro-processInventoryReceipt, and possibly others not yet audited). A hard constraint
-- here would turn a missed call site into a hard insert failure on a live financial flow.
-- Both known writers are updated to always populate it; treat a null here as "ungrouped
-- legacy/edge-case row" rather than an error.

-- Backfill GLTransaction.batch_id per source_type. supplier_invoice rows store the *line*
-- id in source_id (confirmed live: 12,013 rows / 3,034 distinct source_ids), so join through
-- to the line's newly-backfilled conceptual_invoice_id to get the correct invoice-level group.
update public."GLTransaction" gl
set batch_id = 'SI_' || sil.conceptual_invoice_id
from public."SupplierInvoiceLine" sil
where gl.source_type = 'supplier_invoice'
  and gl.source_id = sil.id
  and gl.batch_id is null;

update public."GLTransaction"
set batch_id = 'WO_' || source_id
where source_type = 'work_order' and source_id is not null and batch_id is null;

update public."GLTransaction"
set batch_id = source_id -- already a meaningful pairing id, e.g. 'JE-1755600000000'
where source_type = 'manual' and source_id is not null and batch_id is null;

update public."GLTransaction"
set batch_id = case source_type
    when 'supplier_payment'             then 'SP_'   || source_id
    when 'payment'                       then 'PMT_'  || source_id
    when 'payment_made'                  then 'PM_'   || source_id
    when 'adjustment'                    then 'ADJ_'  || source_id
    when 'customer_payment'              then 'CP_'   || source_id
    when 'customer_ar_adjustment'        then 'CARA_' || source_id
    when 'credit_invoice'                then 'CI_'   || source_id
    when 'transfer'                       then 'XFER_' || source_id
    when 'inventory_return_credit'       then 'IRC_'  || source_id
    when 'inventory_return_adjustment'   then 'IRA_'  || source_id
    when 'deposit_reversal'              then 'DEPR_' || source_id
  end
where source_type in (
    'supplier_payment', 'payment', 'payment_made', 'adjustment', 'customer_payment',
    'customer_ar_adjustment', 'credit_invoice', 'transfer',
    'inventory_return_credit', 'inventory_return_adjustment', 'deposit_reversal'
  )
  and source_id is not null
  and batch_id is null;

-- 'deposit' rows intentionally NOT backfilled: ~600 historical rows have a null source_id
-- (pre-existing data gap, not introduced here), and even when present it points at a
-- BankTransaction id, not a dedicated batch key. Left null rather than guessed; fix at the
-- source going forward by having the deposit-creation flow stamp batch_id = 'DEP_' ||
-- deposit_batch_id directly, since it already has that value in scope when inserting.

-- Resolves (or mints) a conceptual_invoice_id per distinct (supplier_id, invoice_number) key
-- in one call, so multiple lines changing to the same new key in the same request land in
-- the same group. Mirrors apply_supplier_invoice_line_paid_updates's jsonb-array-in style.
-- p_keys: [{ supplier_id, invoice_number, exclude_id }] - exclude_id lets a line being
-- regrouped skip finding itself when it still carries its own (about-to-be-replaced) id.
create or replace function public.resolve_supplier_invoice_conceptual_ids(
  p_keys jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_key jsonb;
  v_supplier_id text;
  v_invoice_number text;
  v_exclude_id text;
  v_existing_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_map_key text;
begin
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' then
    raise exception 'p_keys must be a JSON array';
  end if;

  for v_key in select value from jsonb_array_elements(p_keys)
  loop
    v_supplier_id := v_key->>'supplier_id';
    v_invoice_number := v_key->>'invoice_number';
    v_exclude_id := v_key->>'exclude_id';
    v_map_key := coalesce(v_supplier_id, '') || '::' || coalesce(v_invoice_number, '');

    if v_result ? v_map_key then
      continue; -- already resolved earlier in this same call
    end if;

    if nullif(v_supplier_id, '') is null or nullif(v_invoice_number, '') is null then
      v_result := v_result || jsonb_build_object(v_map_key, gen_random_uuid());
      continue;
    end if;

    select conceptual_invoice_id into v_existing_id
    from public."SupplierInvoiceLine"
    where supplier_id = v_supplier_id
      and invoice_number = v_invoice_number
      and (v_exclude_id is null or id <> v_exclude_id)
      and conceptual_invoice_id is not null
    order by created_date asc nulls last
    limit 1
    for key share;

    v_result := v_result || jsonb_build_object(v_map_key, coalesce(v_existing_id, gen_random_uuid()));
  end loop;

  return v_result;
end;
$$;
