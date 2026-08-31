import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabaseRecordId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

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

    const payload = await req.json();
    const {
      line_of_credit_id,
      payment_date,
      payment_amount,
      payment_method,
      from_account_id,
      description,
      applied_charges
    } = payload;

    if (!line_of_credit_id) {
      return res({ success: false, error: 'Line of credit ID is required' });
    }

    if (!payment_date) {
      return res({ success: false, error: 'Payment date is required' });
    }

    if (!payment_amount || parseFloat(payment_amount) <= 0) {
      return res({ success: false, error: 'Payment amount must be greater than 0' });
    }

    if (!payment_method) {
      return res({ success: false, error: 'Payment method is required' });
    }

    if (!from_account_id) {
      return res({ success: false, error: 'Source account ID is required' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(payment_date)) {
      return res({ success: false, error: 'Invalid date format. Must be YYYY-MM-DD' });
    }

    const fiscalCheck = await checkFiscalPeriodStatus(supabase, payment_date);
    if (!fiscalCheck.isValid) {
      return res({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message });
    }

    const amountValue = parseFloat(payment_amount);

    const { data: locAccount, error: locAccountError } = await supabase
      .from('LinesOfCredit')
      .select('*')
      .eq('id', line_of_credit_id)
      .single();

    if (locAccountError || !locAccount) {
      return res({ success: false, error: 'Line of credit account not found' });
    }

    if (!locAccount.gl_account) {
      return res({ success: false, error: 'Line of credit account does not have a GL account configured' });
    }

    let sourceAccount: any;
    let sourceGLAccount: any;

    if (payment_method === 'other_line_of_credit') {
      const { data: sourceLoc, error: sourceLocError } = await supabase
        .from('LinesOfCredit')
        .select('*')
        .eq('id', from_account_id)
        .single();

      if (sourceLocError || !sourceLoc) {
        return res({ success: false, error: 'Source line of credit account not found' });
      }

      sourceAccount = sourceLoc;
      sourceGLAccount = sourceAccount.gl_account;

      if (!sourceGLAccount) {
        return res({ success: false, error: 'Source line of credit account does not have a GL account configured' });
      }
    } else {
      const { data: sourceBankAccount, error: sourceBankAccountError } = await supabase
        .from('BankAccount')
        .select('*')
        .eq('id', from_account_id)
        .single();

      if (sourceBankAccountError || !sourceBankAccount) {
        return res({ success: false, error: 'Source bank account not found' });
      }

      sourceAccount = sourceBankAccount;
      sourceGLAccount = sourceAccount.gl_account;

      if (!sourceGLAccount) {
        return res({ success: false, error: 'Source bank account does not have a GL account configured' });
      }
    }

    const paymentAppliedData: any[] = [];

    if (applied_charges && Array.isArray(applied_charges) && applied_charges.length > 0) {
      for (const charge of applied_charges) {
        if (charge.id && charge.amount !== 0) {
          try {
            paymentAppliedData.push({
              id: charge.id,
              amount: charge.amount
            });

            const { data: chargeTx } = await supabase
              .from('LinesOfCreditTransaction')
              .select('*')
              .eq('id', charge.id)
              .single();

            if (chargeTx) {
              const currentPayment = chargeTx.payment_amount || 0;
              await supabase
                .from('LinesOfCreditTransaction')
                .update({
                  payment_amount: currentPayment + charge.amount,
                  pending_cash_flow_entry_id: null,
                  updated_date: new Date().toISOString()
                })
                .eq('id', charge.id);
            }
          } catch (err) {
            console.error(`Failed to update charge ${charge.id} with payment:`, err);
          }
        }
      }
    }

    const paymentDescription = description || `${locAccount.name} Payment`;
    const nowIso = new Date().toISOString();
    const { data: locTransaction, error: locTxInsertError } = await supabase
      .from('LinesOfCreditTransaction')
      .insert({
        id: createSupabaseRecordId(),
        line_of_credit_id: line_of_credit_id,
        transaction_date: payment_date,
        description: paymentDescription,
        reference: '',
        charge_amount: 0,
        credit_amount: 0,
        payment_amount: amountValue,
        source_type: 'payment_made',
        source_id: from_account_id,
        payment_applied_data: JSON.stringify(paymentAppliedData),
        created_date: nowIso,
        updated_date: nowIso,
        created_by: auditUser,
        created_by_id: user.id
      })
      .select()
      .single();

    if (locTxInsertError) throw new Error(locTxInsertError.message);

    if (payment_method === 'other_line_of_credit') {
      const { error: sourceChargeInsertError } = await supabase
        .from('LinesOfCreditTransaction')
        .insert({
          id: createSupabaseRecordId(),
          line_of_credit_id: from_account_id,
          transaction_date: payment_date,
          description: `Payment to ${locAccount.name}`,
          reference: line_of_credit_id,
          charge_amount: amountValue,
          payment_amount: 0,
          source_type: 'payment_made',
          source_id: line_of_credit_id,
          created_date: nowIso,
          updated_date: nowIso,
          created_by: auditUser,
          created_by_id: user.id
        });

      if (sourceChargeInsertError) throw new Error(sourceChargeInsertError.message);

      const newSourceBalance = (sourceAccount.current_balance || 0) + amountValue;
      const { error: updateSourceLocError } = await supabase
        .from('LinesOfCredit')
        .update({
          current_balance: newSourceBalance,
          available_credit: (sourceAccount.credit_limit || 0) - newSourceBalance,
          last_recalculated_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        })
        .eq('id', from_account_id);

      if (updateSourceLocError) throw new Error(updateSourceLocError.message);
    } else {
      const bankTransactionTimestamp = new Date().toISOString();
      const { error: bankTransactionCreateError } = await supabase
        .from('BankTransaction')
        .insert({
          id: createSupabaseRecordId(),
          bank_account_id: from_account_id,
          transaction_date: payment_date,
          description: paymentDescription,
          reference: locTransaction.id,
          debit_amount: amountValue,
          credit_amount: 0,
          source_type: 'payment_made',
          source_id: locTransaction.id,
          gl_account: locAccount.gl_account,
          banktx: false,
          created_date: bankTransactionTimestamp,
          updated_date: bankTransactionTimestamp,
          created_by: user.email
        });

      if (bankTransactionCreateError) {
        throw new Error(bankTransactionCreateError.message);
      }

      await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: from_account_id }
      });
    }

    const glTransactions = [
      {
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...getGLAuditFields(),
        account_number: locAccount.gl_account,
        transaction_date: payment_date,
        description: paymentDescription,
        reference: locTransaction.id,
        debit_amount: amountValue,
        credit_amount: 0,
        source_type: 'payment_made',
        source_id: locTransaction.id
      },
      {
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...getGLAuditFields(),
        account_number: sourceGLAccount,
        transaction_date: payment_date,
        description: paymentDescription,
        reference: locTransaction.id,
        debit_amount: 0,
        credit_amount: amountValue,
        source_type: 'payment_made',
        source_id: locTransaction.id
      }
    ];

    const { data: createdGLTransactions, error: glInsertError } = await supabase
      .from('GLTransaction')
      .insert(glTransactions)
      .select();

    if (glInsertError) {
      throw new Error(glInsertError.message);
    }

    const { data: updatedLOC } = await supabase
      .from('LinesOfCredit')
      .select('*')
      .eq('id', line_of_credit_id)
      .single();

    return res({
      success: true,
      message: 'Payment processed successfully',
      loc_transaction_id: locTransaction.id,
      gl_transaction_ids: createdGLTransactions ? createdGLTransactions.map((tx: any) => tx.id) : glTransactions.map((tx: any) => tx.id),
      new_loc_balance: updatedLOC?.current_balance
    });
  } catch (error: any) {
    console.error('Error processing LOC payment:', error);
    return res({
      success: false,
      error: error.message || 'Internal server error',
      details: error.toString()
    });
  }
});
