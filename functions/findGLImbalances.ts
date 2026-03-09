import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // Optional: pass year and month (1-12) to filter, or leave blank for all time
    const { year, month } = body; 

    const allTransactions = await base44.entities.GLTransaction.list();
    const allAccounts = await base44.entities.ChartOfAccount.list();
    
    const accountTypeMap = {};
    allAccounts.forEach(acc => {
      accountTypeMap[acc.account_number] = acc.account_type;
    });
    
    // 1. Filter transactions
    const filteredTransactions = allTransactions.filter(tx => {
      if (!year || !month) return true; 
      const date = new Date(tx.transaction_date);
      // JS getUTCMonth is 0-indexed (0 = Jan, 1 = Feb)
      return date.getUTCMonth() === (month - 1) && date.getUTCFullYear() === year;
    });

    // 2. Group them by Date
    const dailyBlocks = {};
    filteredTransactions.forEach(tx => {
      const day = tx.transaction_date ? tx.transaction_date.split('T')[0] : 'Unknown'; 
      
      if (!dailyBlocks[day]) {
        dailyBlocks[day] = { 
          assetDebits: 0, assetCredits: 0, 
          otherDebits: 0, otherCredits: 0, 
          count: 0, transactions: [] 
        };
      }
      
      const debit = parseFloat(tx.debit_amount) || 0;
      const credit = parseFloat(tx.credit_amount) || 0;
      const accountType = accountTypeMap[tx.account_number] || 'Unknown';
      
      if (accountType === 'Asset') {
        dailyBlocks[day].assetDebits += debit;
        dailyBlocks[day].assetCredits += credit;
      } else {
        dailyBlocks[day].otherDebits += debit;
        dailyBlocks[day].otherCredits += credit;
      }
      
      dailyBlocks[day].count += 1;
      
      // Keep track of the actual rows so we can see what caused the imbalance
      dailyBlocks[day].transactions.push({
        id: tx.id,
        date: tx.transaction_date,
        account: tx.account_number,
        accountType: accountType,
        debit: debit,
        credit: credit,
        desc: tx.description
      });
    });

    // 3. Find any day where Assets != Liabilities + Equity
    const dailyResults = [];
    let totalImbalance = 0;
    let imbalancesCount = 0;

    for (const [day, data] of Object.entries(dailyBlocks)) {
      // Balance Sheet Logic: 
      // Assets Change = Debits - Credits
      // Liabilities + Equity Change (including Rev/Exp) = Credits - Debits
      const assetsChange = data.assetDebits - data.assetCredits;
      const liabilitiesAndEquityChange = data.otherCredits - data.otherDebits;
      
      const diff = assetsChange - liabilitiesAndEquityChange;
      const isBalanced = Math.abs(diff) < 0.01;
      
      dailyResults.push({
        day,
        assetsChange,
        liabilitiesAndEquityChange,
        difference: diff,
        isBalanced,
        count: data.count,
        transactions: data.transactions
      });
      
      if (!isBalanced) {
        imbalancesCount++;
        totalImbalance += diff;
      }
    }
    
    // Sort by day
    dailyResults.sort((a, b) => a.day.localeCompare(b.day));

    return Response.json({
      success: true,
      data: {
        scannedCount: filteredTransactions.length,
        daysScanned: dailyResults.length,
        imbalancedDaysCount: imbalancesCount,
        totalImbalance,
        dailyResults
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});