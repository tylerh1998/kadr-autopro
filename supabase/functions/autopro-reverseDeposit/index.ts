import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function checkFiscalPeriodStatus(supabase, dateString) {
  const dateToCheck = new Date(dateString);
  const { data: fiscalPeriods, error } = await supabase.from('FiscalPeriod').select('*');
  if (error) throw new Error(error.message);

  const period = (fiscalPeriods || []).find((fp) => {
    const startDate = new Date(fp.start_date);
    const endDate = new Date(fp.end_date);
    return dateToCheck >= startDate && dateToCheck <= endDate;
  });

  if (!period) {
    return 'none';
  }

  return period.is_closed ? 'closed' : 'open';
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    let auditUser = 'Unknown User';
    let auditUserId = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        auditUser = user.email || user.id || 'Unknown User';
        auditUserId = user.id;
      }
    }

    const getAuditFields = () => ({
      created_by: auditUser,
      created_by_id: auditUserId,
      updated_by: auditUser
    });

    const { bankTransactionId } = await req.json();

    if (!bankTransactionId) {
      return new Response(JSON.stringify({ error: 'bankTransactionId is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: bankTransactionRows, error: bankTransactionError } = await supabase
      .from('BankTransaction')
      .select('*')
      .eq('id', bankTransactionId);

    if (bankTransactionError) {
      throw new Error(bankTransactionError.message);
    }

    const bankTransaction = Array.isArray(bankTransactionRows) ? bankTransactionRows[0] : null;

    if (!bankTransaction) {
      return new Response(JSON.stringify({ error: 'Bank transaction not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (bankTransaction.source_type !== 'deposit') {
      return new Response(JSON.stringify({ error: 'Only deposit transactions can be reversed' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (bankTransaction.cleared) {
      return new Response(JSON.stringify({ error: 'Cannot reverse a cleared bank transaction' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (bankTransaction.reconciled) {
      return new Response(JSON.stringify({ error: 'Cannot reverse a reconciled bank transaction' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const periodStatus = await checkFiscalPeriodStatus(supabase, bankTransaction.transaction_date);
    if (periodStatus === 'closed') {
      return new Response(JSON.stringify({ error: 'Cannot reverse deposit. The fiscal period for this date is closed.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (periodStatus === 'none') {
      return new Response(JSON.stringify({ error: 'Cannot reverse deposit. No fiscal period exists for the deposit date.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const depositBatchId = bankTransaction.source_id || bankTransaction.reference;
    const transactionDate = bankTransaction.transaction_date;
    const bankAccountId = bankTransaction.bank_account_id;

    const { data: bankAccountRows, error: bankAccountError } = await supabase
      .from('BankAccount')
      .select('*')
      .eq('id', bankAccountId);

    if (bankAccountError) {
      throw new Error(bankAccountError.message);
    }

    const bankAccount = Array.isArray(bankAccountRows) ? bankAccountRows[0] : null;

    if (!bankAccount) {
      return new Response(JSON.stringify({ error: 'Associated bank account not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: originalGLs, error: glFilterError } = await supabase
      .from('GLTransaction')
      .select('*')
      .eq('reference', depositBatchId)
      .eq('source_type', 'deposit');

    if (glFilterError) {
      throw new Error(glFilterError.message);
    }

    if (!originalGLs || originalGLs.length === 0) {
      throw new Error(`No GL transactions found for deposit batch ID: ${depositBatchId}. Cannot reverse an unbalanced deposit.`);
    } else {
      const glsToInsert = originalGLs.map((originalGL) => ({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        account_number: originalGL.account_number,
        transaction_date: transactionDate,
        description: `REVERSAL: ${originalGL.description}`,
        reference: `${depositBatchId}-REVERSAL`,
        debit_amount: originalGL.credit_amount,
        credit_amount: originalGL.debit_amount,
        source_type: 'deposit_reversal',
        source_id: originalGL.id,
        ...getAuditFields()
      }));

      const { error: glInsertError } = await supabase
        .from('GLTransaction')
        .insert(glsToInsert);

      if (glInsertError) {
        throw new Error(glInsertError.message);
      }
    }

    const { data: customerPayments, error: paymentsFilterError } = await supabase
      .from('CustomerPayments')
      .select('*')
      .eq('deposit_batch_id', depositBatchId);

    if (paymentsFilterError) {
      throw new Error(paymentsFilterError.message);
    }

    const { data: cashDrawerAdjustments, error: adjustmentsFilterError } = await supabase
      .from('CashDrawerAdjustment')
      .select('*')
      .eq('deposit_batch_id', depositBatchId);

    if (adjustmentsFilterError) {
      throw new Error(adjustmentsFilterError.message);
    }

    for (const payment of (customerPayments || [])) {
      const { error: paymentUpdateError } = await supabase
        .from('CustomerPayments')
        .update({
          deposited: false,
          deposit_date: null,
          deposit_batch_id: null
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        throw new Error(paymentUpdateError.message);
      }
    }

    for (const adjustment of (cashDrawerAdjustments || [])) {
      const { error: adjustmentUpdateError } = await supabase
        .from('CashDrawerAdjustment')
        .update({
          deposited: false,
          deposit_date: null,
          deposit_batch_id: null,
          status: 'pending'
        })
        .eq('id', adjustment.id);

      if (adjustmentUpdateError) {
        throw new Error(adjustmentUpdateError.message);
      }
    }

    const { error: deleteBankTransactionError } = await supabase
      .from('BankTransaction')
      .delete()
      .eq('id', bankTransactionId);

    if (deleteBankTransactionError) {
      throw new Error(deleteBankTransactionError.message);
    }

    await supabase.functions.invoke('autopro-calculateBankBalances', {
      body: JSON.stringify({ bankAccountId }),
      headers: { 'Content-Type': 'application/json' }
    });

    return new Response(JSON.stringify({ success: true, message: 'Deposit reversed successfully' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error reversing deposit:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to reverse deposit' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
