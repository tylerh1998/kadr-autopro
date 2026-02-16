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
      // Fetch GL Transactions in range
      base44.asServiceRole.entities.GLTransaction.filter({
          transaction_date: { "$gte": fromDateStr, "$lte": toDateStr }
      }, '-transaction_date', 5000),
      
      base44.asServiceRole.entities.BankAccount.list(),
      
      // Fetch all transactions from fromDate to Now to reconstruct balances accurately
      base44.asServiceRole.entities.BankTransaction.filter({
         transaction_date: { "$gte": fromDateStr }
      }, '-transaction_date', 5000),
      
      base44.asServiceRole.entities.ChartOfAccount.list()
    ]);

    // Filter GL transactions by date range
    const filteredGLTransactions = glTransactions.filter(tx => {
      const txDate = tx.transaction_date;
      return txDate >= fromDateStr && txDate <= toDateStr;
    });

    // Bank Transactions are already filtered >= fromDateStr
    // But for the graph display (bars), we only want up to toDateStr
    // For balance calculation, we need everything > toDateStr to rewind from Current Balance
    
    // Sort transactions descending (newest first)
    const sortedBankTransactions = bankTransactions.sort((a, b) => 
        new Date(b.transaction_date) - new Date(a.transaction_date)
    );

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

    // --- Calculate Cash Flow & Balances Per Account ---

    // Helper to generate date range array
    const getDatesInRange = (startDate, endDate) => {
        const dates = [];
        let curr = new Date(startDate);
        const last = new Date(endDate);
        while (curr <= last) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
        }
        return dates;
    };

    const dateRangeDates = getDatesInRange(fromDateStr, toDateStr);
    const todayStr = new Date().toISOString().split('T')[0];

    // Initialize data structure for each account
    const accountsData = {};
    const allAccountsData = {}; // For "All Accounts" aggregation

    // Initialize with all dates in range
    dateRangeDates.forEach(date => {
        allAccountsData[date] = { date, inflow: 0, outflow: 0, netCashFlow: 0, balance: 0 };
    });

    bankAccounts.filter(acc => acc.is_active !== false).forEach(acc => {
        accountsData[acc.id] = {
            id: acc.id,
            name: acc.name,
            currentBalance: acc.current_balance || 0,
            dailyData: {}
        };
        // Init daily data
        dateRangeDates.forEach(date => {
            accountsData[acc.id].dailyData[date] = { date, inflow: 0, outflow: 0, netCashFlow: 0, balance: 0 };
        });
    });

    // Process transactions to fill inflow/outflow
    // We only care about transactions within the display range for inflow/outflow bars
    sortedBankTransactions.forEach(tx => {
        const date = tx.transaction_date;
        if (date >= fromDateStr && date <= toDateStr) {
            if (accountsData[tx.bank_account_id]) {
                const credit = tx.credit_amount || 0;
                const debit = tx.debit_amount || 0;
                const net = credit - debit;

                accountsData[tx.bank_account_id].dailyData[date].inflow += credit;
                accountsData[tx.bank_account_id].dailyData[date].outflow += debit;
                accountsData[tx.bank_account_id].dailyData[date].netCashFlow += net;

                allAccountsData[date].inflow += credit;
                allAccountsData[date].outflow += debit;
                allAccountsData[date].netCashFlow += net;
            }
        }
    });

    // Calculate Daily Balances by rewinding from Current Balance
    // 1. "All Accounts" Balance
    let currentTotalBalance = bankAccounts.filter(a => a.is_active !== false).reduce((sum, a) => sum + (a.current_balance || 0), 0);
    let runningTotalBalance = currentTotalBalance;

    // We walk backwards from TODAY (or latest tx date) down to fromDateStr
    // Transactions > toDateStr are just used to adjust balance
    // Transactions <= toDateStr are used to set the daily balance
    
    // We need to process ALL fetched transactions (>= fromDate) to rewind correctly
    // Since sortedBankTransactions is sorted DESC (newest first)
    
    // Pointer for iterating dates backwards from today
    // Actually, simpler: 
    // 1. Start with runningBalance = currentBalance
    // 2. Iterate transactions desc. 
    //    If tx.date > toDateStr: runningBalance -= net (rewind)
    //    If tx.date <= toDateStr: 
    //       This tx happened on tx.date. 
    //       So the balance at END of tx.date was runningBalance (before this rewind).
    //       Wait, if multiple txs on same day?
    //       Ideally:
    //       Balance(End of Day D) = Balance(End of Day D+1) - NetFlow(Day D+1)
    //       ...
    //       Balance(End of Day toDate) = CurrentBalance - Sum(NetFlow of tx > toDate)
    
    // Let's do it account by account
    Object.values(accountsData).forEach(acc => {
        let bal = acc.currentBalance;
        
        // Filter txs for this account
        const accTxs = sortedBankTransactions.filter(t => t.bank_account_id === acc.id);
        
        // 1. Rewind to End of toDateStr (exclude future txs)
        const futureTxs = accTxs.filter(t => t.transaction_date > toDateStr);
        futureTxs.forEach(t => {
            bal -= ((t.credit_amount || 0) - (t.debit_amount || 0));
        });

        // 2. Now bal is the balance at end of toDateStr
        // We need balance for each day in dateRangeDates (descending)
        const reversedDates = [...dateRangeDates].reverse();
        
        reversedDates.forEach(date => {
            // Set the balance for this day (End of Day)
            acc.dailyData[date].balance = bal;
            
            // Now rewind past this day to get ready for previous day
            const daysTxs = accTxs.filter(t => t.transaction_date === date);
            const daysNet = daysTxs.reduce((sum, t) => sum + ((t.credit_amount || 0) - (t.debit_amount || 0)), 0);
            
            bal -= daysNet;
        });
    });

    // Aggregate Balances for "All Accounts"
    dateRangeDates.forEach(date => {
        allAccountsData[date].balance = Object.values(accountsData).reduce((sum, acc) => sum + acc.dailyData[date].balance, 0);
    });

    // Convert to Arrays
    const cashFlowByAccount = Object.values(accountsData).map(acc => ({
        id: acc.id,
        name: acc.name,
        data: Object.values(acc.dailyData).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
            ...d,
            inflow: Math.round(d.inflow * 100) / 100,
            outflow: Math.round(d.outflow * 100) / 100,
            netCashFlow: Math.round(d.netCashFlow * 100) / 100,
            balance: Math.round(d.balance * 100) / 100
        }))
    }));

    // Add "All Accounts"
    cashFlowByAccount.unshift({
        id: 'all',
        name: 'All Accounts',
        data: Object.values(allAccountsData).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
            ...d,
            inflow: Math.round(d.inflow * 100) / 100,
            outflow: Math.round(d.outflow * 100) / 100,
            netCashFlow: Math.round(d.netCashFlow * 100) / 100,
            balance: Math.round(d.balance * 100) / 100
        }))
    });
    
    // For backward compatibility (or default view), use 'All Accounts' as the main chart?
    // User wants Primary-Servus default, but the main 'cashFlow' prop usually expects one array.
    // We'll return 'cashFlowByAccount' and let frontend choose.
    // We'll also return the 'All' data as 'cashFlow' to not break existing if they revert.
    const cashFlowChart = cashFlowByAccount[0].data;

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
          cashFlowByAccount, // New field
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