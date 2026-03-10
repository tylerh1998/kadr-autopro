import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const openPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({ is_closed: false });
    
    if (!openPeriods || openPeriods.length === 0) {
      return Response.json({ success: true, message: "No open fiscal periods found." });
    }

    const allTransactions = await base44.asServiceRole.entities.GLTransaction.list(null, 10000);
    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list(null, 10000);
    
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
      const assetsChange = data.assetDebits - data.assetCredits;
      const liabilitiesAndEquityChange = data.otherCredits - data.otherDebits;
      const bsDiff = assetsChange - liabilitiesAndEquityChange;
      const isBsBalanced = Math.abs(bsDiff) < 0.01;

      // Trial Balance Logic (Debits = Credits):
      const totalDebits = data.assetDebits + data.otherDebits;
      const totalCredits = data.assetCredits + data.otherCredits;
      const tbDiff = totalDebits - totalCredits;
      const isTbBalanced = Math.abs(tbDiff) < 0.01;
      
      // Use the Trial Balance difference for reporting, and require both to be balanced
      const diff = tbDiff;
      const isBalanced = isBsBalanced && isTbBalanced;
      
      dailyResults.push({
        day,
        difference: diff,
        bsDiff: bsDiff,
        tbDiff: tbDiff,
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
    let emailBody = `<h2>GL Imbalance Report for Open Fiscal Periods</h2>`;
    emailBody += `<p>Total Imbalanced Days: <strong>${imbalancesCount}</strong></p>`;
    emailBody += `<p>Total Imbalance Amount: <strong>$${totalImbalance.toFixed(2)}</strong></p>`;
    
    if (dailyResults.length === 0) {
      emailBody += `<p>No transactions found in open fiscal periods.</p>`;
    } else {
      emailBody += `
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th>Date</th>
            <th>Balance Sheet Diff</th>
            <th>Trial Balance Diff</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
      `;
      
      dailyResults.forEach(res => {
        const rowStyle = res.isBalanced ? "" : "background-color: #ffe6e6; color: #cc0000;";
        const statusText = res.isBalanced ? "Balanced" : "Imbalanced";
        
        emailBody += `
          <tr style="${rowStyle}">
            <td>${res.day}</td>
            <td>$${res.bsDiff.toFixed(2)}</td>
            <td>$${res.tbDiff.toFixed(2)}</td>
            <td><strong>${statusText}</strong></td>
          </tr>
        `;
      });
      
      emailBody += `
        </tbody>
      </table>
      `;
    }

    // Send email
    await base44.functions.invoke('sendEmailViaSMTP', {
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