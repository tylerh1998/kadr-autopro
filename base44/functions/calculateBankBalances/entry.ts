import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bankAccountId } = await req.json();

    if (!bankAccountId) {
      return Response.json({ success: false, error: 'bankAccountId is required' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseKey = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ success: false, error: 'Supabase configuration is missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: transactions, error: transactionsError } = await supabase
      .from('BankTransaction')
      .select('id, credit_amount, debit_amount, is_reversed')
      .eq('bank_account_id', bankAccountId)
      .order('transaction_date', { ascending: true });

    if (transactionsError) {
      throw new Error(transactionsError.message);
    }

    const balanceTransactions = (transactions || []).filter((transaction) => transaction.is_reversed !== true);

    let runningBalance = 0;
    for (const transaction of balanceTransactions) {
      const credit = Number(transaction.credit_amount) || 0;
      const debit = Number(transaction.debit_amount) || 0;
      runningBalance += credit - debit;
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('BankAccount')
      .update({
        current_balance: runningBalance,
        last_recalculated_date: now,
      })
      .eq('id', bankAccountId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log(`Balance recalculated for bank account ${bankAccountId}: ${runningBalance}`);

    return Response.json({
      success: true,
      bankAccountId,
      finalBalance: runningBalance,
      last_recalculated_date: now,
      transactionCount: balanceTransactions.length,
    });
  } catch (error) {
    console.error('Error in calculateBankBalances:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});