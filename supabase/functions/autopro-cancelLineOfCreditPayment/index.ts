import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabaseRecordId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

function safeParseJsonArray(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function checkFiscalPeriodStatus(supabase: any, dateString: string) {
  const { data: fiscalPeriods, error } = await supabase.from('FiscalPeriod').select('*');
  if (error) {
    return { isValid: false, message: 'Error checking fiscal period. Please try again.' };
  }
  if (!fiscalPeriods || fiscalPeriods.length === 0) {
    return { isValid: false, message: 'No fiscal periods have been configured.' };
  }

  const datePart = String(dateString || '').split('T')[0];
  const checkDate = new Date(`${datePart}T00:00:00Z`);
  if (isNaN(checkDate.getTime())) {
    return { isValid: false, message: 'Invalid transaction date.' };
  }

  for (const period of fiscalPeriods) {
    const startDate = new Date(`${period.start_date}T00:00:00Z`);
    const endDate = new Date(`${period.end_date}T00:00:00Z`);
    if (checkDate >= startDate && checkDate <= endDate) {
      if (period.is_closed) {
        return { isValid: false, message: 'Date is in a closed fiscal period. No changes can be made.' };
      }
      return { isValid: true, message: 'Date is in an open fiscal period.' };
    }
  }

  return { isValid: false, message: 'No valid fiscal period found for this date.' };
}

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase configuration is missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const auditUser = user.user_metadata?.full_name || user.email || user.id;
    const getGLAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user.id,
      updated_by: auditUser
    });

    const { transactionId } = await req.json();

    if (!transactionId) {
      return res({ success: false, error: 'transactionId is required' });
    }

    const { data: originalPayment, error: originalPaymentError } = await supabase
      .from('LinesOfCreditTransaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (originalPaymentError || !originalPayment) {
      return res({ success: false, error: 'Payment transaction not found' });
    }

    if (originalPayment.source_type !== 'payment_made' || !(originalPayment.payment_amount > 0)) {
      return res({ success: false, error: 'Only LOC payment records can be cancelled' });
    }

    if (originalPayment.is_reversed === true) {
      return res({ success: false, error: 'This payment has already been cancelled' });
    }

    const fiscalCheck = await checkFiscalPeriodStatus(supabase, originalPayment.transaction_date);
    if (!fiscalCheck.isValid) {
      return res({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message });
    }

    const paymentAmount = Number(originalPayment.payment_amount || 0);
    const paymentDate = originalPayment.transaction_date;

    const { data: targetLoc, error: targetLocError } = await supabase
      .from('LinesOfCredit')
      .select('*')
      .eq('id', originalPayment.line_of_credit_id)
      .single();

    if (targetLocError || !targetLoc) {
      return res({ success: false, error: 'Target line of credit account not found' });
    }

    if (!targetLoc.gl_account) {
      return res({ success: false, error: 'Target line of credit account is missing a GL account' });
    }

    let sourceAccount: any = null;
    let sourceGLAccount: any = null;
    let sourceType: string | null = null;

    const { data: relatedBankTransactions, error: relatedBankTransactionsError } = await supabase
      .from('BankTransaction')
      .select('*')
      .eq('source_id', originalPayment.id)
      .eq('source_type', 'payment_made');

    if (relatedBankTransactionsError) {
      throw new Error(relatedBankTransactionsError.message);
    }

    if ((relatedBankTransactions || []).length > 0) {
      sourceType = 'bank_account';
      const { data: sourceBankAccount, error: sourceBankAccountError } = await supabase
        .from('BankAccount')
        .select('*')
        .eq('id', relatedBankTransactions[0].bank_account_id)
        .single();

      if (sourceBankAccountError || !sourceBankAccount) {
        throw new Error('Source bank account not found');
      }

      sourceAccount = sourceBankAccount;
      sourceGLAccount = sourceAccount?.gl_account || null;
    } else {
      const { data: relatedLocTransactions } = await supabase
        .from('LinesOfCreditTransaction')
        .select('*')
        .eq('source_id', originalPayment.line_of_credit_id)
        .eq('source_type', 'payment_made');

      const sourceLocTx = (relatedLocTransactions || []).find((tx: any) => tx.line_of_credit_id === originalPayment.source_id && tx.charge_amount > 0 && tx.is_reversed !== true);

      if (sourceLocTx) {
        sourceType = 'other_line_of_credit';
        const { data: sourceLocAccount } = await supabase
          .from('LinesOfCredit')
          .select('*')
          .eq('id', sourceLocTx.line_of_credit_id)
          .single();
        sourceAccount = sourceLocAccount;
        sourceGLAccount = sourceAccount?.gl_account || null;
      }
    }

    if (!sourceAccount || !sourceGLAccount) {
      return res({ success: false, error: 'Unable to find the original source account for this payment' });
    }

    const appliedData = safeParseJsonArray(originalPayment.payment_applied_data);
    for (const item of appliedData) {
      if (!item?.id || !item?.amount) continue;
      const { data: appliedTx } = await supabase
        .from('LinesOfCreditTransaction')
        .select('*')
        .eq('id', item.id)
        .single();
      if (!appliedTx) continue;

      const currentPaymentAmount = Number(appliedTx.payment_amount || 0);
      const newPaymentAmount = Math.max(0, currentPaymentAmount - Number(item.amount || 0));
      await supabase
        .from('LinesOfCreditTransaction')
        .update({
          payment_amount: newPaymentAmount,
          updated_date: new Date().toISOString()
        })
        .eq('id', appliedTx.id);
    }

    const reversalDescription = `REVERSAL: ${originalPayment.description || `${targetLoc.name} Payment`}`;
    const nowIso = new Date().toISOString();

    const { data: reversalLocTransaction, error: reversalInsertError } = await supabase
      .from('LinesOfCreditTransaction')
      .insert({
        id: createSupabaseRecordId(),
        line_of_credit_id: originalPayment.line_of_credit_id,
        transaction_date: paymentDate,
        description: reversalDescription,
        reference: originalPayment.id,
        charge_amount: paymentAmount,
        credit_amount: 0,
        payment_amount: 0,
        source_type: 'manual',
        source_id: originalPayment.id,
        is_reversed: true,
        reversed_by_id: originalPayment.id,
        created_date: nowIso,
        updated_date: nowIso,
        created_by: auditUser,
        created_by_id: user.id
      })
      .select()
      .single();

    if (reversalInsertError) throw new Error(reversalInsertError.message);

    const { error: originalPaymentUpdateError } = await supabase
      .from('LinesOfCreditTransaction')
      .update({
        is_reversed: true,
        reversed_by_id: reversalLocTransaction.id,
        payment_applied_data: originalPayment.payment_applied_data || '[]',
        updated_date: new Date().toISOString()
      })
      .eq('id', originalPayment.id);

    if (originalPaymentUpdateError) throw new Error(originalPaymentUpdateError.message);

    if (sourceType === 'bank_account') {
      const bankTx = relatedBankTransactions[0];
      const bankTransactionTimestamp = new Date().toISOString();

      const { error: reversalBankTransactionError } = await supabase
        .from('BankTransaction')
        .insert({
          id: createSupabaseRecordId(),
          bank_account_id: bankTx.bank_account_id,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          debit_amount: 0,
          credit_amount: paymentAmount,
          source_type: 'payment_made',
          source_id: originalPayment.id,
          gl_account: targetLoc.gl_account,
          banktx: false,
          is_reversed: true,
          reversed_by_id: bankTx.id,
          created_date: bankTransactionTimestamp,
          updated_date: bankTransactionTimestamp,
          created_by: user.email
        });

      if (reversalBankTransactionError) {
        throw new Error(reversalBankTransactionError.message);
      }

      const { error: updateBankTransactionError } = await supabase
        .from('BankTransaction')
        .update({
          is_reversed: true,
          reversed_by_id: reversalLocTransaction.id,
          updated_date: bankTransactionTimestamp
        })
        .eq('id', bankTx.id);

      if (updateBankTransactionError) {
        throw new Error(updateBankTransactionError.message);
      }

      await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: bankTx.bank_account_id }
      });
    }

    if (sourceType === 'other_line_of_credit') {
      const { data: sourceLocTxs } = await supabase
        .from('LinesOfCreditTransaction')
        .select('*')
        .eq('source_id', originalPayment.line_of_credit_id)
        .eq('source_type', 'payment_made');

      const sourceLocTx = (sourceLocTxs || []).find((tx: any) => tx.line_of_credit_id === originalPayment.source_id && tx.charge_amount > 0 && tx.is_reversed !== true);

      if (sourceLocTx) {
        const reversalNowIso = new Date().toISOString();
        const { data: sourceReversalTx, error: sourceReversalInsertError } = await supabase
          .from('LinesOfCreditTransaction')
          .insert({
            id: createSupabaseRecordId(),
            line_of_credit_id: sourceLocTx.line_of_credit_id,
            transaction_date: paymentDate,
            description: reversalDescription,
            reference: originalPayment.id,
            charge_amount: 0,
            credit_amount: paymentAmount,
            payment_amount: 0,
            source_type: 'manual',
            source_id: originalPayment.id,
            is_reversed: true,
            reversed_by_id: sourceLocTx.id,
            created_date: reversalNowIso,
            updated_date: reversalNowIso,
            created_by: auditUser,
            created_by_id: user.id
          })
          .select()
          .single();

        if (sourceReversalInsertError) throw new Error(sourceReversalInsertError.message);

        const { error: sourceLocTxUpdateError } = await supabase
          .from('LinesOfCreditTransaction')
          .update({
            is_reversed: true,
            reversed_by_id: sourceReversalTx.id,
            updated_date: new Date().toISOString()
          })
          .eq('id', sourceLocTx.id);

        if (sourceLocTxUpdateError) throw new Error(sourceLocTxUpdateError.message);
      }
    }

    const { data: glTransactions, error: glFetchError } = await supabase
      .from('GLTransaction')
      .select('*')
      .eq('source_id', originalPayment.id)
      .eq('source_type', 'payment_made');

    if (glFetchError) {
      throw new Error(glFetchError.message);
    }

    let glTransactionsToInsert: any[] = [];
    if (glTransactions && glTransactions.length > 0) {
      glTransactionsToInsert = glTransactions.map((tx: any) => ({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...getGLAuditFields(),
        account_number: tx.account_number,
        transaction_date: paymentDate,
        description: reversalDescription,
        reference: originalPayment.id,
        debit_amount: Number(tx.credit_amount || 0),
        credit_amount: Number(tx.debit_amount || 0),
        source_type: 'manual',
        source_id: originalPayment.id
      }));
    } else {
      glTransactionsToInsert = [
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: sourceGLAccount,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          debit_amount: paymentAmount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: originalPayment.id
        },
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: targetLoc.gl_account,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          debit_amount: 0,
          credit_amount: paymentAmount,
          source_type: 'manual',
          source_id: originalPayment.id
        }
      ];
    }

    const { error: glInsertError } = await supabase.from('GLTransaction').insert(glTransactionsToInsert);
    if (glInsertError) throw new Error(glInsertError.message);

    return res({
      success: true,
      message: 'Line of credit payment cancelled successfully',
      cancelled_transaction_id: originalPayment.id,
      reversal_transaction_id: reversalLocTransaction.id
    });
  } catch (error: any) {
    console.error('Error cancelling LOC payment:', error);
    return res({ success: false, error: error.message });
  }
});
