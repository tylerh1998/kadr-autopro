import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const accounts = await base44.asServiceRole.entities.ChartOfAccount.filter({ is_active: true }, undefined, 5000);
    const { data: allTransactions, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('account_number, transaction_date, debit_amount, credit_amount')
      .lte('transaction_date', endDate);

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
    }

    const accountMap = {};
    accounts.forEach((account) => {
      accountMap[account.account_number] = {
        ...account,
        own_balance: 0,
        transactionCount: 0
      };
    });

    (allTransactions || []).forEach((tx) => {
      if (!tx.account_number || !accountMap[tx.account_number]) return;
      if (!tx.transaction_date) return;

      const txDate = String(tx.transaction_date).split('T')[0];
      const acc = accountMap[tx.account_number];
      const isDebitNormal = ['Asset', 'Expense'].includes(acc.account_type);
      const dr = Number(tx.debit_amount) || 0;
      const cr = Number(tx.credit_amount) || 0;

      acc.own_balance += isDebitNormal ? (dr - cr) : (cr - dr);

      if (txDate >= startDate) {
        acc.transactionCount++;
      }
    });

    return Response.json({
      success: true,
      accounts: Object.values(accountMap)
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});