import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const { accountNumber, appliedStartDate, appliedEndDate } = await req.json();

    if (!accountNumber || !appliedStartDate || !appliedEndDate) {
      return Response.json({
        success: false,
        error: 'Missing required parameters: accountNumber, appliedStartDate, appliedEndDate'
      }, { status: 400 });
    }

    console.log(`Fetching transactions for account ${accountNumber}, range: ${appliedStartDate} to ${appliedEndDate}`);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const accounts = await base44.asServiceRole.entities.ChartOfAccount.filter({ account_number: accountNumber });
    if (!accounts || accounts.length === 0) {
      return Response.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    const accountType = accounts[0].account_type;
    const isDebitNormal = ['Asset', 'Expense'].includes(accountType);

    const { data: allTransactions, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('*')
      .eq('account_number', accountNumber)
      .lte('transaction_date', appliedEndDate)
      .order('transaction_date', { ascending: true })
      .order('created_date', { ascending: true });

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
    }

    console.log(`Total transactions fetched: ${(allTransactions || []).length}`);

    let openingBalance = 0;
    const transactionsInRange = [];

    (allTransactions || []).forEach((tx) => {
      if (!tx.transaction_date) return;

      const txDateStr = String(tx.transaction_date).split('T')[0];
      const dr = Number(tx.debit_amount) || 0;
      const cr = Number(tx.credit_amount) || 0;

      if (txDateStr < appliedStartDate) {
        openingBalance += isDebitNormal ? (dr - cr) : (cr - dr);
      } else if (txDateStr >= appliedStartDate && txDateStr <= appliedEndDate) {
        transactionsInRange.push(tx);
      }
    });

    console.log(`Opening balance: ${openingBalance}`);
    console.log(`Transactions in range: ${transactionsInRange.length}`);

    let runningBalance = openingBalance;
    const processedTransactions = transactionsInRange.map((tx) => {
      const dr = Number(tx.debit_amount) || 0;
      const cr = Number(tx.credit_amount) || 0;
      runningBalance += isDebitNormal ? (dr - cr) : (cr - dr);
      return {
        ...tx,
        balance: runningBalance
      };
    });

    processedTransactions.reverse();

    console.log(`Processed ${processedTransactions.length} transactions`);

    return Response.json({
      success: true,
      transactions: processedTransactions,
      openingBalance,
      totalCount: processedTransactions.length
    });
  } catch (error) {
    console.error('Error in getGLAccountTransactions:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});