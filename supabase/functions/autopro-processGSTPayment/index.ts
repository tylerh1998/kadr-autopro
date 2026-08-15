import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase configuration is missing' });
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

    const auditUser = user.user_metadata?.full_name || user.email || 'Unknown User';
    const getAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user.id,
      updated_by: auditUser
    });

    const { gst_return_id, payment_date, bank_account_id } = await req.json();

    if (!gst_return_id || !payment_date || !bank_account_id) {
      return res({ error: 'Missing required fields: gst_return_id, payment_date, and bank_account_id' });
    }

    // Get the GST return record
    const { data: gstReturnRecords, error: gstReturnError } = await supabase
      .from('GSTReturn')
      .select('*')
      .eq('id', gst_return_id)
      .limit(1);

    if (gstReturnError) {
      throw new Error(`Failed to fetch GST return: ${gstReturnError.message}`);
    }

    const gstReturn = gstReturnRecords && gstReturnRecords.length > 0 ? gstReturnRecords[0] : null;

    if (!gstReturn) {
      return res({ error: 'GST return not found' });
    }

    if (gstReturn.status !== 'posted') {
      return res({ error: 'GST return must be in "posted" status to mark as paid' });
    }

    // Get system settings for GST payable/receivable account
    const { data: settingsRecords, error: settingsError } = await supabase
      .from('SystemSettings')
      .select('gst_payable_receivable_account_number')
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }

    const settings = settingsRecords && settingsRecords.length > 0 ? settingsRecords[0] : null;

    if (!settings) {
      return res({ error: 'System settings not found. Please configure GST account numbers.' });
    }

    const gstPayableReceivableAccount = String(settings.gst_payable_receivable_account_number || '2001');

    // Get bank account details
    const { data: bankAccountRecords, error: bankAccountError } = await supabase
      .from('BankAccount')
      .select('*')
      .eq('id', bank_account_id)
      .limit(1);

    if (bankAccountError) {
      throw new Error(`Failed to fetch bank account: ${bankAccountError.message}`);
    }

    const bankAccount = bankAccountRecords && bankAccountRecords.length > 0 ? bankAccountRecords[0] : null;

    if (!bankAccount || !bankAccount.gl_account) {
      return res({ error: 'Bank account not found or GL account not configured' });
    }

    const netGstDue = gstReturn.net_gst_due;
    const absAmount = Math.abs(netGstDue);

    // Create GL transactions
    const glTransactions: any[] = [];

    if (netGstDue > 0) {
      // We OWE money to the government (payment)
      // Debit GST Payable/Receivable - reduces the liability
      glTransactions.push({
        account_number: gstPayableReceivableAccount,
        transaction_date: payment_date,
        description: `GST Payment for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: absAmount,
        credit_amount: 0,
        source_type: 'payment',
        source_id: gstReturn.id
      });

      // Credit Bank Account - money leaving
      glTransactions.push({
        account_number: bankAccount.gl_account,
        transaction_date: payment_date,
        description: `GST Payment for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: 0,
        credit_amount: absAmount,
        source_type: 'payment',
        source_id: gstReturn.id
      });

    } else if (netGstDue < 0) {
      // We are OWED money (refund)
      // Debit Bank Account - money entering
      glTransactions.push({
        account_number: bankAccount.gl_account,
        transaction_date: payment_date,
        description: `GST Refund for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: absAmount,
        credit_amount: 0,
        source_type: 'payment',
        source_id: gstReturn.id
      });

      // Credit GST Payable/Receivable - reduces the receivable
      glTransactions.push({
        account_number: gstPayableReceivableAccount,
        transaction_date: payment_date,
        description: `GST Refund for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: 0,
        credit_amount: absAmount,
        source_type: 'payment',
        source_id: gstReturn.id
      });
    }

    const glTransactionsToInsert = glTransactions.map((tx) => ({
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      ...getAuditFields(),
      ...tx
    }));

    const { error: glInsertError } = await supabase.from('GLTransaction').insert(glTransactionsToInsert);
    if (glInsertError) {
      throw new Error(`Failed to insert GL transactions: ${glInsertError.message}`);
    }

    // Create Bank Transaction
    const nowIso = new Date().toISOString();
    const bankTx = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      bank_account_id: bankAccount.id,
      transaction_date: payment_date,
      created_date: nowIso,
      updated_date: nowIso,
      created_by: auditUser,
      created_by_id: user.id,
      description: netGstDue > 0
        ? `GST Payment to CRA (${gstReturn.period_start_date} - ${gstReturn.period_end_date})`
        : `GST Refund from CRA (${gstReturn.period_start_date} - ${gstReturn.period_end_date})`,
      reference: `GST-${gstReturn.id}`,
      credit_amount: netGstDue < 0 ? absAmount : 0, // Refund = Money In
      debit_amount: netGstDue > 0 ? absAmount : 0,  // Payment = Money Out
      cleared: false,
      reconciled: false,
      source_type: 'payment',
      source_id: gstReturn.id,
      gl_account: gstPayableReceivableAccount
    };

    const { error: bankTxError } = await supabase.from('BankTransaction').insert(bankTx);
    if (bankTxError) {
      throw new Error(`Failed to insert Bank transaction: ${bankTxError.message}`);
    }

    // Update the GST return to "paid" status
    const { error: updateError } = await supabase
      .from('GSTReturn')
      .update({
        status: 'paid',
        paid_date: payment_date,
        paid_by: auditUser,
        bank_account_id: bank_account_id
      })
      .eq('id', gstReturn.id);

    if (updateError) {
      throw new Error(`Failed to update GST return: ${updateError.message}`);
    }

    // Refresh the bank account's current_balance to reflect the new transaction
    await supabase.functions.invoke('autopro-calculateBankBalances', {
      body: { bankAccountId: bank_account_id }
    });

    return res({
      success: true,
      message: 'GST payment processed successfully',
      gl_transactions_created: glTransactions.length
    });

  } catch (error: any) {
    console.error('Error processing GST payment:', error);
    return res({ error: error.message || 'Failed to process GST payment' });
  }
});
