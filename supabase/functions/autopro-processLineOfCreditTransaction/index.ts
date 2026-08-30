import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function checkFiscalPeriodStatus(supabase: any, dateString: string) {
  try {
    if (!dateString) {
      return { isValid: false, message: "No date provided for fiscal period check." };
    }

    const { data: fiscalPeriods, error } = await supabase.from('FiscalPeriod').select('*');
    if (error) {
      console.error('Error checking fiscal period status:', error);
      return { isValid: false, message: "Error checking fiscal period. Please try again." };
    }

    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return { isValid: false, message: "No fiscal periods have been configured. Please set up fiscal periods in the system." };
    }

    const datePart = dateString.split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return { isValid: false, message: "Invalid date format provided." };
    }

    const checkDate = new Date(datePart + 'T00:00:00Z');
    if (isNaN(checkDate.getTime())) {
      return { isValid: false, message: "Invalid date format provided." };
    }

    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');

      if (checkDate >= startDate && checkDate <= endDate) {
        if (period.is_closed) {
          return { isValid: false, message: "Date is in a closed fiscal period. No changes can be made." };
        } else {
          return { isValid: true, message: "Date is in an open fiscal period." };
        }
      }
    }

    return { isValid: false, message: "No valid fiscal period found for this date. No changes can be made." };
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return { isValid: false, message: "Error checking fiscal period. Please try again." };
  }
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
      return res({ success: false, error: 'Supabase credentials not configured' });
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

    const payload = await req.json();
    const {
      id,
      action,
      line_of_credit_id,
      transaction_date,
      description,
      reference,
      transaction_type,
      amount,
      offset_gl_account,
      source_type
    } = payload;

    if (action !== 'delete') {
      if (!line_of_credit_id) return res({ success: false, error: 'Line of credit ID is required' });
      if (!transaction_date) return res({ success: false, error: 'Transaction date is required' });
      if (!description) return res({ success: false, error: 'Description is required' });
      if (!transaction_type || !['charge', 'credit'].includes(transaction_type)) return res({ success: false, error: 'Transaction type must be "charge" or "credit"' });
      if (!amount || parseFloat(amount) <= 0) return res({ success: false, error: 'Amount must be greater than 0' });
      if (!offset_gl_account) return res({ success: false, error: 'Offset GL account is required' });

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(transaction_date)) return res({ success: false, error: 'Invalid date format. Must be YYYY-MM-DD' });
    }

    if (transaction_date) {
      const fiscalCheck = await checkFiscalPeriodStatus(supabase, transaction_date);
      if (!fiscalCheck.isValid) return res({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message });
    }

    if (id) {
      const { data: existingTx, error: existingTxError } = await supabase.from('LinesOfCreditTransaction').select('*').eq('id', id).single();
      if (existingTxError || !existingTx) return res({ success: false, error: 'Transaction not found' });

      if ((existingTx.payment_amount || 0) !== 0) {
        return res({ success: false, error: 'This transaction already has a payment applied and cannot be edited or deleted.' });
      }

      if (existingTx.pending_cash_flow_entry_id) {
        return res({ success: false, error: 'This transaction is queued for payment on the cash flow sheet and cannot be edited or deleted. Remove it from the cash flow sheet first.' });
      }

      const originalFiscalCheck = await checkFiscalPeriodStatus(supabase, existingTx.transaction_date);
      if (!originalFiscalCheck.isValid) return res({ success: false, error: 'Original transaction date is in a closed fiscal period', message: originalFiscalCheck.message });

      const { data: locAccount, error: locAccountError } = await supabase.from('LinesOfCredit').select('*').eq('id', existingTx.line_of_credit_id).single();
      if (locAccountError || !locAccount) return res({ success: false, error: 'Line of credit account not found' });

      const { error: glDeleteError } = await supabase.from('GLTransaction').delete().eq('source_id', id);
      if (glDeleteError) throw new Error(glDeleteError.message);

      let currentBalance = locAccount.current_balance || 0;
      currentBalance = currentBalance - (existingTx.charge_amount || 0) + (existingTx.credit_amount || 0);

      if (action === 'delete') {
        const { error: deleteTxError } = await supabase.from('LinesOfCreditTransaction').delete().eq('id', id);
        if (deleteTxError) throw new Error(deleteTxError.message);

        const { error: updateLocError } = await supabase.from('LinesOfCredit').update({
          current_balance: currentBalance,
          available_credit: (locAccount.credit_limit || 0) - currentBalance,
          updated_date: new Date().toISOString()
        }).eq('id', locAccount.id);
        if (updateLocError) throw new Error(updateLocError.message);

        return res({ success: true, message: 'Transaction deleted successfully' });
      } else {
        const amountValue = parseFloat(amount);
        const charge_amount = transaction_type === 'charge' ? amountValue : 0;
        const credit_amount = transaction_type === 'credit' ? amountValue : 0;
        const payment_amount = 0;

        currentBalance = currentBalance + charge_amount - credit_amount;

        const { error: updateTxError } = await supabase.from('LinesOfCreditTransaction').update({
          transaction_date,
          description,
          reference: reference || '',
          charge_amount,
          credit_amount,
          payment_amount,
          balance: currentBalance,
          source_type: source_type || existingTx.source_type,
          updated_date: new Date().toISOString()
        }).eq('id', id);
        if (updateTxError) throw new Error(updateTxError.message);

        const { error: updateLocError } = await supabase.from('LinesOfCredit').update({
          current_balance: currentBalance,
          available_credit: (locAccount.credit_limit || 0) - currentBalance,
          updated_date: new Date().toISOString()
        }).eq('id', locAccount.id);
        if (updateLocError) throw new Error(updateLocError.message);

        const glTransactions: any[] = [];
        if (transaction_type === 'charge') {
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...getGLAuditFields(),
            account_number: offset_gl_account,
            transaction_date: transaction_date,
            description: `LOC Draw: ${description}`,
            reference: reference || id,
            debit_amount: amountValue,
            credit_amount: 0,
            source_type: 'manual',
            source_id: id
          });
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...getGLAuditFields(),
            account_number: locAccount.gl_account,
            transaction_date: transaction_date,
            description: `LOC Draw: ${description}`,
            reference: reference || id,
            debit_amount: 0,
            credit_amount: amountValue,
            source_type: 'manual',
            source_id: id
          });
        } else {
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...getGLAuditFields(),
            account_number: locAccount.gl_account,
            transaction_date: transaction_date,
            description: `LOC Credit: ${description}`,
            reference: reference || id,
            debit_amount: amountValue,
            credit_amount: 0,
            source_type: 'manual',
            source_id: id
          });
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...getGLAuditFields(),
            account_number: offset_gl_account,
            transaction_date: transaction_date,
            description: `LOC Credit: ${description}`,
            reference: reference || id,
            debit_amount: 0,
            credit_amount: amountValue,
            source_type: 'manual',
            source_id: id
          });
        }

        const { error: glInsertError } = await supabase.from('GLTransaction').insert(glTransactions);
        if (glInsertError) throw new Error(glInsertError.message);

        return res({ success: true, message: 'Transaction updated successfully' });
      }
    } else {
      const { data: locAccount, error: locAccountError } = await supabase.from('LinesOfCredit').select('*').eq('id', line_of_credit_id).single();
      if (locAccountError || !locAccount) return res({ success: false, error: 'Line of credit account not found' });
      if (!locAccount.gl_account) return res({ success: false, error: 'Line of credit account does not have a GL account configured' });

      const amountValue = parseFloat(amount);
      const charge_amount = transaction_type === 'charge' ? amountValue : 0;
      const credit_amount = transaction_type === 'credit' ? amountValue : 0;
      const payment_amount = 0;

      const currentBalance = locAccount.current_balance || 0;
      const newBalance = currentBalance + charge_amount - credit_amount;

      const nowIso = new Date().toISOString();
      const { data: locTransaction, error: locTxInsertError } = await supabase.from('LinesOfCreditTransaction').insert({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        line_of_credit_id: line_of_credit_id,
        transaction_date: transaction_date,
        description: description,
        reference: reference || '',
        charge_amount: charge_amount,
        credit_amount: credit_amount,
        payment_amount: payment_amount,
        balance: newBalance,
        source_type: source_type || 'manual',
        source_id: '',
        created_date: nowIso,
        updated_date: nowIso,
        created_by: auditUser,
        created_by_id: user.id
      }).select().single();
      if (locTxInsertError) throw new Error(locTxInsertError.message);

      const { error: updateLocError } = await supabase.from('LinesOfCredit').update({
        current_balance: newBalance,
        available_credit: (locAccount.credit_limit || 0) - newBalance,
        updated_date: nowIso
      }).eq('id', line_of_credit_id);
      if (updateLocError) throw new Error(updateLocError.message);

      const glTransactions: any[] = [];
      if (transaction_type === 'charge') {
        glTransactions.push({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: offset_gl_account,
          transaction_date: transaction_date,
          description: `LOC Draw: ${description}`,
          reference: reference || locTransaction.id,
          debit_amount: amountValue,
          credit_amount: 0,
          source_type: 'manual',
          source_id: locTransaction.id
        });
        glTransactions.push({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: locAccount.gl_account,
          transaction_date: transaction_date,
          description: `LOC Draw: ${description}`,
          reference: reference || locTransaction.id,
          debit_amount: 0,
          credit_amount: amountValue,
          source_type: 'manual',
          source_id: locTransaction.id
        });
      } else {
        glTransactions.push({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: locAccount.gl_account,
          transaction_date: transaction_date,
          description: `LOC Credit: ${description}`,
          reference: reference || locTransaction.id,
          debit_amount: amountValue,
          credit_amount: 0,
          source_type: 'manual',
          source_id: locTransaction.id
        });
        glTransactions.push({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...getGLAuditFields(),
          account_number: offset_gl_account,
          transaction_date: transaction_date,
          description: `LOC Credit: ${description}`,
          reference: reference || locTransaction.id,
          debit_amount: 0,
          credit_amount: amountValue,
          source_type: 'manual',
          source_id: locTransaction.id
        });
      }

      const { data: createdGLTransactions, error: glInsertError } = await supabase
        .from('GLTransaction')
        .insert(glTransactions)
        .select();

      if (glInsertError) throw new Error(glInsertError.message);

      return res({
        success: true,
        message: 'Transaction processed successfully',
        loc_transaction_id: locTransaction.id,
        gl_transaction_ids: createdGLTransactions ? createdGLTransactions.map((tx: any) => tx.id) : glTransactions.map((tx: any) => tx.id),
        new_balance: newBalance
      });
    }
  } catch (error: any) {
    console.error('Error processing LOC transaction:', error);
    return res({
      success: false,
      error: error.message || 'Internal server error',
      details: error.toString()
    });
  }
});
