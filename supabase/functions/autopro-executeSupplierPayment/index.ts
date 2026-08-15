import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getMountainTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset'
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const second = parts.find((part) => part.type === 'second')?.value;
  const offsetLabel = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT-00:00';
  const offset = offsetLabel.replace('GMT', '');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
};

const buildGlEntries = ({ paymentId, supplierName, paymentAmount, sourceGlAccount }: any) => ([
  {
    account_number: '2000',
    description: `Payment to ${supplierName}`,
    debit: paymentAmount > 0 ? paymentAmount : 0,
    credit: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
    source_type: 'supplier_payment',
    source_id: paymentId,
  },
  {
    account_number: sourceGlAccount,
    description: `Payment to ${supplierName}`,
    debit: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
    credit: paymentAmount > 0 ? paymentAmount : 0,
    source_type: 'supplier_payment',
    source_id: paymentId,
  }
]);

const ensureLocMirrorTransaction = async ({ supabase, payment, supplierName }: any) => {
  if (payment.payment_method !== 'Line of Credit') {
    return;
  }

  const { data: existingTransactions } = await supabase
    .from('LinesOfCreditTransaction')
    .select('id')
    .eq('line_of_credit_id', payment.source)
    .eq('source_type', 'supplier_payment')
    .eq('source_id', payment.id);

  if ((existingTransactions || []).length > 0) {
    return;
  }

  const paymentAmount = parseFloat(payment.amount) || 0;
  const nowIso = new Date().toISOString();

  const { error: locInsertError } = await supabase.from('LinesOfCreditTransaction').insert([{
    id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
    line_of_credit_id: payment.source,
    transaction_date: payment.payment_date,
    description: `Payment to ${supplierName}`,
    charge_amount: paymentAmount > 0 ? paymentAmount : 0,
    credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
    payment_amount: 0,
    source_type: 'supplier_payment',
    source_id: payment.id,
    created_date: nowIso,
    updated_date: nowIso
  }]);

  if (locInsertError) {
    throw locInsertError;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  let paymentId: string | null = null;
  let supabase: any = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      throw new Error('Supabase credentials not configured');
    }

    supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const payload = await req.json().catch(() => ({}));
    paymentId = payload.paymentId;

    if (!paymentId) {
      return res({ success: false, error: 'No paymentId provided' });
    }

    const startedAt = Date.now();

    const { data: payment, error: paymentError } = await supabase
      .from('SupplierPayment')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error('Supplier payment not found');
    }

    if (payment.status === 'completed') {
      return res({ success: true, skipped: true });
    }

    await supabase
      .from('SupplierPayment')
      .update({
        status: 'processing',
        error_message: null,
        updated_date: getMountainTimestamp()
      })
      .eq('id', paymentId);

    const supplierFetchStartedAt = Date.now();
    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    if (supplierError || !supplier) {
      throw new Error('Supplier not found');
    }

    console.info('[executeSupplierPayment] supplier_fetch_ms:', Date.now() - supplierFetchStartedAt);

    const paymentAmount = parseFloat(payment.amount) || 0;
    const paymentMethod = payment.payment_method;
    const fromAccountId = payment.source;
    const chequeNumber = payment.cheque_number;

    let sourceGlAccount = null;
    let transactionPayload = null;
    let selectedBank: any = null;

    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const { data: selectedBankRows, error: selectedBankError } = await supabase
        .from('BankAccount')
        .select('*')
        .eq('id', fromAccountId);

      if (selectedBankError) {
        throw new Error(`Failed to load bank account: ${selectedBankError.message}`);
      }

      selectedBank = Array.isArray(selectedBankRows) ? selectedBankRows[0] : null;

      if (!selectedBank?.gl_account) {
        throw new Error('Selected bank account is missing a GL account');
      }

      sourceGlAccount = selectedBank.gl_account;
      transactionPayload = {
        bank_account_id: selectedBank.id,
        transaction_date: payment.payment_date,
        description: `Payment to ${supplier.name}${chequeNumber ? ` - Cheque #${chequeNumber}` : ''}`,
        debit: paymentAmount > 0 ? paymentAmount : 0,
        credit: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        source_type: 'supplier_payment',
        source_id: payment.id,
      };
    } else if (paymentMethod === 'Line of Credit') {
      const { data: selectedLOC, error: selectedLOCError } = await supabase
        .from('LinesOfCredit')
        .select('*')
        .eq('id', fromAccountId)
        .single();

      if (selectedLOCError || !selectedLOC) {
        throw new Error('Selected line of credit not found');
      }

      if (!selectedLOC?.gl_account) {
        throw new Error('Selected line of credit is missing a GL account');
      }

      sourceGlAccount = selectedLOC.gl_account;
      transactionPayload = {
        line_of_credit_id: selectedLOC.id,
        transaction_date: payment.payment_date,
        description: `Payment to ${supplier.name}`,
        charge_amount: paymentAmount > 0 ? paymentAmount : 0,
        credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        payment_amount: 0,
        source_type: 'supplier_payment',
        source_id: payment.id,
      };
    } else {
      throw new Error(`Unsupported payment method: ${paymentMethod}`);
    }

    const bankGlStartedAt = Date.now();
    const glEntries = buildGlEntries({
      paymentId: payment.id,
      supplierName: supplier.name,
      paymentAmount,
      sourceGlAccount,
    });

    const { error: rpcError } = await supabase.rpc('process_payment_atomic', {
      p_payment_id: payment.id,
      p_gl_entries: glEntries,
      p_bank_tx: transactionPayload,
    });

    if (rpcError) {
      throw new Error(`Failed to process payment atomically: ${rpcError.message}`);
    }

    console.info('[executeSupplierPayment] bank_gl_ms:', Date.now() - bankGlStartedAt);

    if (paymentMethod === 'Line of Credit') {
      try {
        await ensureLocMirrorTransaction({
          supabase,
          payment,
          supplierName: supplier.name,
        });
      } catch (mirrorError) {
        console.error('Failed to create LOC mirror transaction:', mirrorError);
      }
    }

    if (paymentMethod === 'Cheque' && selectedBank && chequeNumber) {
      const nextChequeNumber = parseInt(chequeNumber, 10);

      if (!Number.isNaN(nextChequeNumber)) {
        try {
          const { error: updateBankError } = await supabase
            .from('BankAccount')
            .update({
              next_cheque_number: nextChequeNumber + 1
            })
            .eq('id', selectedBank.id);

          if (updateBankError) {
            console.error('Failed to update next cheque number:', updateBankError);
          }
        } catch (updateError) {
          console.error('Failed to update next cheque number:', updateError);
        }
      }
    }

    console.info('[executeSupplierPayment] total_ms:', Date.now() - startedAt);

    return res({ success: true });
  } catch (error: any) {
    console.error('Error in executeSupplierPayment:', error);

    if (paymentId && supabase) {
      try {
        await supabase
          .from('SupplierPayment')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error during background processing',
            updated_date: getMountainTimestamp()
          })
          .eq('id', paymentId);
      } catch (statusError) {
        console.error('Failed to update payment status to failed:', statusError);
      }
    }

    return res({ success: false, error: error.message });
  }
});
