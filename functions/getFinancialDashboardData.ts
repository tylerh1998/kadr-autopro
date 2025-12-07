import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { dateRange } = await req.json();
    const fromDate = dateRange?.from ? new Date(dateRange.from) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = dateRange?.to ? new Date(dateRange.to) : new Date();

    // Format dates as YYYY-MM-DD
    const formatDate = (date) => date.toISOString().split('T')[0];
    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);

    // Fetch all necessary data using service role for comprehensive access
    const [
      glTransactions,
      bankAccounts,
      bankTransactions,
      chartOfAccounts
    ] = await Promise.all([
      base44.asServiceRole.entities.GLTransaction.list(),
      base44.asServiceRole.entities.BankAccount.list(),
      base44.asServiceRole.entities.BankTransaction.list(),
      base44.asServiceRole.entities.ChartOfAccount.list()
    ]);

    // Filter transactions by date range
    const filteredGLTransactions = glTransactions.filter(tx => {
      const txDate = tx.transaction_date;
      return txDate >= fromDateStr && txDate <= toDateStr;
    });

    const filteredBankTransactions = bankTransactions.filter(tx => {
      const txDate = tx.transaction_date;
      return txDate >= fromDateStr && txDate <= toDateStr;
    });

    // Calculate Revenue (4000-4999 accounts)
    let totalRevenue = 0;
    filteredGLTransactions.forEach(tx => {
      const accountNum = parseInt(tx.account_number);
      if (accountNum >= 4000 && accountNum <= 4999) {
        totalRevenue += (tx.credit_amount || 0) - (tx.debit_amount || 0);
      }
    });

    // Calculate Expenses (5000+ accounts)
    let totalExpenses = 0;
    const expensesByCategory = {};
    filteredGLTransactions.forEach(tx => {
      const accountNum = parseInt(tx.account_number);
      if (accountNum >= 5000) {
        const expenseAmount = (tx.debit_amount || 0) - (tx.credit_amount || 0);
        totalExpenses += expenseAmount;
        
        // Group by account for expense breakdown
        const account = chartOfAccounts.find(acc => acc.account_number === tx.account_number);
        const categoryName = account ? `${account.account_number} - ${account.account_name}` : tx.account_number;
        expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + expenseAmount;
      }
    });

    // Calculate Net Income
    const netIncome = totalRevenue - totalExpenses;

    // Calculate Current Cash Position (sum of all active bank accounts)
    let cashPosition = 0;
    bankAccounts
      .filter(acc => acc.is_active !== false)
      .forEach(acc => {
        cashPosition += (acc.current_balance || 0);
      });

    // Calculate Monthly Revenue vs Expenses for chart
    const monthlyData = {};
    filteredGLTransactions.forEach(tx => {
      const txDate = new Date(tx.transaction_date);
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { revenue: 0, expenses: 0 };
      }

      const accountNum = parseInt(tx.account_number);
      if (accountNum >= 4000 && accountNum <= 4999) {
        // Revenue account
        monthlyData[monthKey].revenue += (tx.credit_amount || 0) - (tx.debit_amount || 0);
      } else if (accountNum >= 5000) {
        // Expense account
        monthlyData[monthKey].expenses += (tx.debit_amount || 0) - (tx.credit_amount || 0);
      }
    });

    // Convert monthly data to array and sort by date
    const revenueVsExpensesChart = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        revenue: Math.round(data.revenue * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        netIncome: Math.round((data.revenue - data.expenses) * 100) / 100
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate Cash Flow from bank transactions by date (daily)
    const cashFlowData = {};
    filteredBankTransactions.forEach(tx => {
      const dateKey = tx.transaction_date; // Use date directly (YYYY-MM-DD format)
      
      if (!cashFlowData[dateKey]) {
        cashFlowData[dateKey] = { inflow: 0, outflow: 0 };
      }

      cashFlowData[dateKey].inflow += (tx.credit_amount || 0);
      cashFlowData[dateKey].outflow += (tx.debit_amount || 0);
    });

    // Convert cash flow data to array and sort by date
    const cashFlowChart = Object.entries(cashFlowData)
      .map(([date, data]) => ({
        date,
        inflow: Math.round(data.inflow * 100) / 100,
        outflow: Math.round(data.outflow * 100) / 100,
        netCashFlow: Math.round((data.inflow - data.outflow) * 100) / 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate Account Balances by Type (Assets, Liabilities, Equity)
    const accountBalancesByType = {
      Asset: 0,
      Liability: 0,
      Equity: 0,
      Revenue: 0,
      Expense: 0
    };

    // Get all GL transactions (not just filtered) to calculate current balances
    glTransactions.forEach(tx => {
      const account = chartOfAccounts.find(acc => acc.account_number === tx.account_number);
      if (account) {
        const amount = (tx.debit_amount || 0) - (tx.credit_amount || 0);
        if (accountBalancesByType[account.account_type] !== undefined) {
          accountBalancesByType[account.account_type] += amount;
        }
      }
    });

    // Round account balances
    Object.keys(accountBalancesByType).forEach(type => {
      accountBalancesByType[type] = Math.round(accountBalancesByType[type] * 100) / 100;
    });

    // Top Expense Categories (top 10)
    const topExpenseCategories = Object.entries(expensesByCategory)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Bank Accounts Summary
    const bankAccountsSummary = bankAccounts
      .filter(acc => acc.is_active !== false)
      .map(acc => ({
        id: acc.id,
        name: acc.name,
        bank_name: acc.bank_name,
        account_type: acc.account_type,
        current_balance: Math.round((acc.current_balance || 0) * 100) / 100
      }))
      .sort((a, b) => b.current_balance - a.current_balance);

    // Return consolidated dashboard data
    return Response.json({
      success: true,
      data: {
        dateRange: {
          from: fromDateStr,
          to: toDateStr
        },
        keyMetrics: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          netIncome: Math.round(netIncome * 100) / 100,
          cashPosition: Math.round(cashPosition * 100) / 100
        },
        charts: {
          revenueVsExpenses: revenueVsExpensesChart,
          cashFlow: cashFlowChart,
          accountBalancesByType: Object.entries(accountBalancesByType)
            .filter(([type, amount]) => amount !== 0)
            .map(([type, amount]) => ({ type, amount })),
          topExpenseCategories
        },
        bankAccountsSummary
      }
    });

  } catch (error) {
    console.error('Error generating financial dashboard data:', error);
    return Response.json(
      { 
        success: false, 
        error: error.message || 'Failed to generate financial dashboard data' 
      },
      { status: 500 }
    );
  }
});