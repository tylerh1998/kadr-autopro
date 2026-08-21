// Central place for GL batch_id prefix conventions so every edge function that posts
// GLTransaction rows uses the same scheme, and for resolving/minting the persisted
// conceptual_invoice_id that groups flat SupplierInvoiceLine rows into one logical invoice.
// See supabase/migrations/20260820150000_add_gl_batch_grouping.sql for the schema + RPC.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const BATCH_PREFIXES: Record<string, string> = {
  work_order: 'WO',
  supplier_invoice: 'SI', // key passed in is the line's conceptual_invoice_id, not the line id
  supplier_payment: 'SP',
  payment: 'PMT',
  payment_made: 'PM',
  adjustment: 'ADJ',
  customer_payment: 'CP',
  customer_ar_adjustment: 'CARA',
  credit_invoice: 'CI',
  transfer: 'XFER',
  inventory_return_credit: 'IRC',
  inventory_return_adjustment: 'IRA',
  deposit: 'DEP',
  deposit_reversal: 'DEPR',
  manual: 'JE',
};

export function buildBatchId(sourceType: string, key: string | null | undefined): string | null {
  if (!key) return null;
  if (sourceType === 'manual') return key; // pairingId is already a meaningful 'JE-<ts>' string
  const prefix = BATCH_PREFIXES[sourceType] || sourceType.toUpperCase();
  return `${prefix}_${key}`;
}

export function conceptualKey(supplierId: string | null | undefined, invoiceNumber: string | null | undefined): string {
  return `${supplierId || ''}::${invoiceNumber || ''}`;
}

export interface ConceptualIdLookupKey {
  supplier_id: string | null | undefined;
  invoice_number: string | null | undefined;
  exclude_id?: string | null;
}

// Resolves (or mints) a conceptual_invoice_id per distinct (supplier_id, invoice_number) pair.
// Call once per save request with every key you need, not once per line - two lines changing
// to the same new invoice number in the same request must land in the same new group.
export async function resolveConceptualInvoiceIds(
  supabase: SupabaseClient,
  keys: ConceptualIdLookupKey[]
): Promise<Record<string, string>> {
  if (!keys || keys.length === 0) return {};

  const uniqueKeys = new Map<string, ConceptualIdLookupKey>();
  for (const k of keys) {
    const mapKey = conceptualKey(k.supplier_id, k.invoice_number);
    if (!uniqueKeys.has(mapKey)) uniqueKeys.set(mapKey, k);
  }

  const { data, error } = await supabase.rpc('resolve_supplier_invoice_conceptual_ids', {
    p_keys: Array.from(uniqueKeys.values()).map((k) => ({
      supplier_id: k.supplier_id || null,
      invoice_number: k.invoice_number || null,
      exclude_id: k.exclude_id || null,
    })),
  });

  if (error) {
    throw new Error(`Failed to resolve conceptual invoice ids: ${error.message}`);
  }

  return (data || {}) as Record<string, string>;
}
