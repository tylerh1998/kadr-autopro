import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const openPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({ is_closed: false });
    
    if (!openPeriods || openPeriods.length === 0) {
      return Response.json({ success: true, message: "No open fiscal periods found." });
    }

    const allTransactions = await base44.asServiceRole.entities.GLTransaction.list();
    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list();
    
    const accountTypeMap = {};
    allAccounts.forEach(acc => {
      accountTypeMap[acc.account_number] = acc.account_type;
    });
    
    // 1. Filter transactions to only those in open fiscal periods
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = tx.transaction_date ? tx.transaction_date.split('T')[0] : null;
      if (!txDate) return false;
      
      return openPeriods.some(period => {
        return txDate >= period.start_date && txDate <= period.end_date;
      });
    });

    // 2. Group them by Date
    const dailyBlocks = {};
    filteredTransactions.forEach(tx => {
      const day = tx.transaction_date ? tx.transaction_date.split('T')[0] : 'Unknown'; 
      
      if (!dailyBlocks[day]) {
        dailyBlocks[day] = { 
          assetDebits: 0, assetCredits: 0, 
          otherDebits: 0, otherCredits: 0, 
          count: 0 
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
        difference: diff,
        isBalanced
      });
      
      if (!isBalanced) {
        imbalancesCount++;
        totalImbalance += diff;
      }
    }
    
    // Sort by day
    dailyResults.sort((a, b) => a.day.localeCompare(b.day));

    // Format email body
    let emailBody = `GL Imbalance Report for Open Fiscal Periods\n\n`;
    emailBody += `Total Imbalanced Days: ${imbalancesCount}\n`;
    emailBody += `Total Imbalance Amount: $${totalImbalance.toFixed(2)}\n\n`;
    
    if (dailyResults.length === 0) {
      emailBody += `No transactions found in open fiscal periods.\n`;
    } else {
      emailBody += `Daily Breakdown:\n`;
      dailyResults.forEach(res => {
        if (res.isBalanced) {
          emailBody += `${res.day}: Balanced\n`;
        } else {
          emailBody += `${res.day}: Imbalanced by $${res.difference.toFixed(2)}\n`;
        }
      });
    }

    // Send email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: "tyler@kensauto.ca",
      subject: `Daily GL Imbalance Report - ${imbalancesCount > 0 ? 'ACTION REQUIRED' : 'All Good'}`,
      body: emailBody
    });

    return Response.json({
      success: true,
      data: {
        scannedCount: filteredTransactions.length,
        daysScanned: dailyResults.length,
        imbalancedDaysCount: imbalancesCount,
        totalImbalance
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});