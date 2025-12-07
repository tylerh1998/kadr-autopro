import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return Response.json({ 
        error: 'Start date and end date are required' 
      }, { status: 400 });
    }

    console.log('Fetching P&L data for date range:', startDate, 'to', endDate);

    // Fetch all Revenue and Expense accounts
    const allAccounts = await base44.entities.ChartOfAccount.list();
    const revenueAccounts = allAccounts.filter(acc => acc.account_type === 'Revenue' && acc.is_active);
    const expenseAccounts = allAccounts.filter(acc => acc.account_type === 'Expense' && acc.is_active);

    console.log('Found accounts - Revenue:', revenueAccounts.length, 'Expense:', expenseAccounts.length);

    // Fetch all GL transactions in date range
    const allTransactions = await base44.entities.GLTransaction.list();
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.transaction_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return txDate >= start && txDate <= end;
    });

    console.log('Found', filteredTransactions.length, 'transactions in date range');

    // Helper function to calculate account balance
    const calculateAccountBalance = (accountNumber, transactions) => {
      const accountTransactions = transactions.filter(tx => tx.account_number === accountNumber);
      
      let totalCredits = 0;
      let totalDebits = 0;
      
      accountTransactions.forEach(tx => {
        totalCredits += parseFloat(tx.credit_amount) || 0;
        totalDebits += parseFloat(tx.debit_amount) || 0;
      });
      
      return {
        credits: totalCredits,
        debits: totalDebits,
        transactionCount: accountTransactions.length
      };
    };

    // Process Revenue accounts
    const revenueData = revenueAccounts.map(account => {
      const { credits, debits, transactionCount } = calculateAccountBalance(
        account.account_number, 
        filteredTransactions
      );
      
      // For revenue: Credits increase revenue, Debits decrease revenue
      const netRevenue = credits - debits;
      
      return {
        account_number: account.account_number,
        account_name: account.account_name,
        credits: credits,
        debits: debits,
        amount: netRevenue,
        transactionCount: transactionCount
      };
    }).filter(acc => acc.amount !== 0 || acc.transactionCount > 0); // Only include accounts with activity

    // Process Expense accounts
    const expenseData = expenseAccounts.map(account => {
      const { credits, debits, transactionCount } = calculateAccountBalance(
        account.account_number, 
        filteredTransactions
      );
      
      // For expenses: Debits increase expense, Credits decrease expense
      const netExpense = debits - credits;
      
      return {
        account_number: account.account_number,
        account_name: account.account_name,
        credits: credits,
        debits: debits,
        amount: netExpense,
        transactionCount: transactionCount
      };
    }).filter(acc => acc.amount !== 0 || acc.transactionCount > 0); // Only include accounts with activity

    // Sort by account number
    revenueData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    expenseData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    // Calculate totals
    const totalRevenue = revenueData.reduce((sum, acc) => sum + acc.amount, 0);
    const totalExpenses = expenseData.reduce((sum, acc) => sum + acc.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    console.log('P&L Summary - Revenue:', totalRevenue, 'Expenses:', totalExpenses, 'Net Income:', netIncome);

    return Response.json({
      success: true,
      data: {
        revenue: revenueData,
        expenses: expenseData,
        summary: {
          totalRevenue: totalRevenue,
          totalExpenses: totalExpenses,
          netIncome: netIncome
        },
        dateRange: {
          startDate: startDate,
          endDate: endDate
        }
      }
    });

  } catch (error) {
    console.error('Error generating P&L report:', error);
    return Response.json({ 
      error: error.message || 'Failed to generate P&L report',
      details: error.stack
    }, { status: 500 });
  }
});