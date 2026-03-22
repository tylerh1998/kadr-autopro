import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const openPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({ is_closed: false });
    
    if (!openPeriods || openPeriods.length === 0) {
      return Response.json({ success: true, message: "No open fiscal periods found." });
    }

    let allTransactions = [];
    let skip = 0;
    const limit = 5000;
    let hasMore = true;
    
    while (hasMore) {
        const batch = await base44.asServiceRole.entities.GLTransaction.list(null, limit, skip);
        allTransactions = allTransactions.concat(batch);
        if (batch.length < limit) {
            hasMore = false;
        } else {
            skip += limit;
        }
    }
    
    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list(null, 10000);
    
    const accountTypeMap = {};
    allAccounts.forEach(acc => {
      accountTypeMap[acc.account_number] = acc.account_type;
    });
    
    const knownAccountNumbers = new Set(allAccounts.map(acc => acc.account_number));
    const invalidTransactions = [];

    // 1. Filter transactions to only those in open fiscal periods
    const validTransactions = allTransactions.filter(tx => {
      const txDate = tx.transaction_date ? tx.transaction_date.split('T')[0] : null;
      if (!txDate) return false;
      
      const inOpenPeriod = openPeriods.some(period => {
        return txDate >= period.start_date && txDate <= period.end_date;
      });

      if (!inOpenPeriod) return false;

      if (!knownAccountNumbers.has(tx.account_number)) {
        console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
        invalidTransactions.push(tx);
        return false;
      }
      return true;
    });

    // 2. Group them by Date
    const dailyBlocks = {};
    validTransactions.forEach(tx => {
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
    if (invalidTransactions.length > 0) {
      emailBody += `<div style="background-color: #ffcccc; padding: 10px; border: 1px solid #cc0000; margin-bottom: 20px;">`;
      emailBody += `<h3 style="color: #cc0000; margin-top: 0;">CRITICAL WARNING: Unknown Accounts Detected</h3>`;
      emailBody += `<p>Found <strong>${invalidTransactions.length}</strong> transactions referencing accounts that do not exist in the Chart of Accounts. These transactions have been excluded from the balance calculations.</p>`;
      emailBody += `<ul>`;
      invalidTransactions.slice(0, 10).forEach(tx => {
        emailBody += `<li>Tx ID: ${tx.id} | Date: ${tx.transaction_date.split('T')[0]} | Account: <strong>${tx.account_number}</strong> | Amount: $${tx.debit_amount || tx.credit_amount}</li>`;
      });
      if (invalidTransactions.length > 10) {
        emailBody += `<li>...and ${invalidTransactions.length - 10} more. Check server logs for full details.</li>`;
      }
      emailBody += `</ul></div>`;
    }

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

    // Send email only if there are imbalances or invalid transactions
    if (imbalancesCount > 0 || invalidTransactions.length > 0) {
      await base44.functions.invoke('sendEmailViaSMTP', {
        to: "tyler@kensauto.ca",
        subject: `Daily GL Imbalance Report - ACTION REQUIRED`,
        body: emailBody
      });
    }

    return Response.json({
      success: true,
      warnings: invalidTransactions.length > 0 ? `Found ${invalidTransactions.length} transactions with unknown accounts.` : null,
      invalidTransactions: invalidTransactions,
      data: {
        scannedCount: validTransactions.length,
        daysScanned: dailyResults.length,
        imbalancedDaysCount: imbalancesCount,
        totalImbalance
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});