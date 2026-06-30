import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const isValidDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
    const getMountainDateString = (date = new Date()) => {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    };
    const parseDateOnly = (dateStr) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };
    const formatDateOnly = (date) => date.toISOString().split('T')[0];

    const todayMountain = getMountainDateString();
    const fromDateStr = isValidDateString(dateRange?.from) ? dateRange.from : `${todayMountain.slice(0, 4)}-01-01`;
    const toDateStr = isValidDateString(dateRange?.to) ? dateRange.to : todayMountain;

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    // Fetch all necessary data using service role for comprehensive access
    const [
      glTransactions,
      bankAccountsResponse,
      bankTransactionsResponse,
      chartOfAccounts,
      customerPaymentsResponse
    ] = await Promise.all([
      // Fetch GL Transactions in range
      base44.asServiceRole.entities.GLTransaction.filter({
          transaction_date: { "$gte": fromDateStr, "$lte": toDateStr }
      }, '-transaction_date', 5000),
      supabase
        .from('BankAccount')
        .select('*'),
      supabase
        .from('BankTransaction')
        .select('*')
        .gte('transaction_date', fromDateStr)
        .order('transaction_date', { ascending: false }),
      base44.asServiceRole.entities.ChartOfAccount.list(),
      supabase
        .from('CustomerPayments')
        .select('amount, payment_method, payment_date, ar_pmt')
        .gte('payment_date', fromDateStr)
        .lte('payment_date', toDateStr)
    ]);

    if (bankAccountsResponse.error) {
      throw new Error(bankAccountsResponse.error.message || 'Failed to fetch BankAccount from Supabase');
    }

    if (bankTransactionsResponse.error) {
      throw new Error(bankTransactionsResponse.error.message || 'Failed to fetch BankTransaction from Supabase');
    }

    if (customerPaymentsResponse.error) {
      throw new Error(customerPaymentsResponse.error.message || 'Failed to fetch CustomerPayments from Supabase');
    }

    const bankAccounts = bankAccountsResponse.data || [];
    const bankTransactions = bankTransactionsResponse.data || [];
    const customerPayments = customerPaymentsResponse.data || [];

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
        String(b.transaction_date || '').localeCompare(String(a.transaction_date || ''))
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
      const txDate = String(tx.transaction_date || '').split('T')[0];
      const monthKey = txDate.slice(0, 7);
      if (!monthKey) return;

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
        let curr = parseDateOnly(startDate);
        const last = parseDateOnly(endDate);
        while (curr <= last) {
            dates.push(formatDateOnly(curr));
            curr = new Date(curr.getTime() + 86400000);
        }
        return dates;
    };

    const dateRangeDates = getDatesInRange(fromDateStr, toDateStr);

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

    const normalizeDateText = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : raw;
    };

    const customerPaymentsByMethod = {};
    const customerPaymentCountsByMethod = {};
    let customerPaymentsTotalAmount = 0;
    let customerPaymentsTotalCount = 0;
    let receivedOnAccountsTotal = 0;

    customerPayments.forEach((payment) => {
      const paymentDate = normalizeDateText(payment.payment_date);
      if (!paymentDate || paymentDate < fromDateStr || paymentDate > toDateStr) {
        return;
      }

      const amount = Number(payment.amount) || 0;
      const paymentMethod = String(payment.payment_method || '').trim() || 'Unspecified';
      const isOnAccount = paymentMethod.toLowerCase() === 'on_account';

      customerPaymentsByMethod[paymentMethod] = (customerPaymentsByMethod[paymentMethod] || 0) + amount;
      customerPaymentCountsByMethod[paymentMethod] = (customerPaymentCountsByMethod[paymentMethod] || 0) + 1;

      if (!isOnAccount) {
        customerPaymentsTotalAmount += amount;
        customerPaymentsTotalCount += 1;
      }

      if (payment.ar_pmt === true) {
        receivedOnAccountsTotal += amount;
      }
    });

    const customerPaymentsBreakdownItems = Object.entries(customerPaymentsByMethod)
      .map(([paymentMethod, amount]) => {
        const isOnAccount = paymentMethod.trim().toLowerCase() === 'on_account';
        const roundedAmount = Math.round(amount * 100) / 100;
        const roundedReceivedOnAccounts = Math.round(receivedOnAccountsTotal * 100) / 100;
        return {
          paymentMethod,
          amount: roundedAmount,
          percentage: isOnAccount || customerPaymentsTotalAmount === 0 ? 0 : (amount / customerPaymentsTotalAmount) * 100,
          count: customerPaymentCountsByMethod[paymentMethod] || 0,
          receivedOnAccounts: isOnAccount ? roundedReceivedOnAccounts : null,
          net: isOnAccount ? Math.round((roundedAmount - roundedReceivedOnAccounts) * 100) / 100 : null,
          excludeFromTotals: isOnAccount
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // --- Special Bank Stats for Cash Flow Trend Tab (Current Month) ---
    // Target Bank: 68b95ed97223c7b3d2882f5d
    // Period: Current Month (based on toDate)
    const currentMonthStartStr = `${toDateStr.slice(0, 7)}-01`;
    
    const targetBankId = '68b95ed97223c7b3d2882f5d';
    const targetBankStats = {
        credits: 0,
        debits: 0
    };

    // Filter transactions for target bank and current month
    // Note: sortedBankTransactions contains all txs >= fromDate (which usually covers current month if fromDate is 12 months ago)
    // We should double check we have the txs. If fromDate is in the future relative to current month (unlikely), we might miss.
    // Assuming standard usage where range includes current month.
    
    sortedBankTransactions.forEach(tx => {
        if (tx.bank_account_id === targetBankId && tx.transaction_date >= currentMonthStartStr && tx.transaction_date <= toDateStr) {
            // Revenue (Credits): source_type in deposit, manual, registries
            const validCreditSources = ['deposit', 'manual', 'registries'];
            if (validCreditSources.includes(tx.source_type) && tx.credit_amount) {
                targetBankStats.credits += tx.credit_amount;
            }

            // Paid (Debits): source_type != transfer
            if (tx.source_type !== 'transfer' && tx.debit_amount) {
                targetBankStats.debits += tx.debit_amount;
            }
        }
    });

    targetBankStats.credits = Math.round(targetBankStats.credits * 100) / 100;
    targetBankStats.debits = Math.round(targetBankStats.debits * 100) / 100;

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
          topExpenseCategories,
          customerPaymentsBreakdown: {
            totalAmount: Math.round(customerPaymentsTotalAmount * 100) / 100,
            totalCount: customerPaymentsTotalCount,
            receivedOnAccountsTotal: Math.round(receivedOnAccountsTotal * 100) / 100,
            items: customerPaymentsBreakdownItems.map((item) => ({
              ...item,
              percentage: Math.round(item.percentage * 10) / 10
            }))
          }
        },
        bankAccountsSummary,
        targetBankStats
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