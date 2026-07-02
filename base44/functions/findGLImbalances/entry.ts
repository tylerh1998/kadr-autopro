import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const openPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({ is_closed: false });

    if (!openPeriods || openPeriods.length === 0) {
      return Response.json({ success: true, message: 'No open fiscal periods found.' });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const minOpenDate = openPeriods.reduce((min, period) => period.start_date < min ? period.start_date : min, openPeriods[0].start_date);
    const maxOpenDate = openPeriods.reduce((max, period) => period.end_date > max ? period.end_date : max, openPeriods[0].end_date);

    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list(null, 10000);
    const accountTypeMap = {};
    allAccounts.forEach((acc) => {
      accountTypeMap[acc.account_number] = acc.account_type;
    });

    const knownAccountNumbers = new Set(allAccounts.map((acc) => acc.account_number));
    let invalidTransactions = [];
    let validTransactions = [];
    let dailyResults = [];
    let scannedCount = 0;

    const isInOpenPeriod = (dateString) => {
      return openPeriods.some((period) => dateString >= period.start_date && dateString <= period.end_date);
    };

    const callRpcWithCandidates = async (functionName, candidates) => {
      let lastError = null;

      for (const args of candidates) {
        const { data, error } = await supabase.rpc(functionName, args);
        if (!error) {
          return { data: data || [], error: null };
        }
        lastError = error;
      }

      return { data: null, error: lastError };
    };

    const helperResult = await callRpcWithCandidates('get_daily_gl_totals', [
      { _start_date: minOpenDate, _end_date: maxOpenDate },
      { start_date: minOpenDate, end_date: maxOpenDate },
      { p_start_date: minOpenDate, p_end_date: maxOpenDate },
      { from_date: minOpenDate, to_date: maxOpenDate }
    ]);

    const helperRows = helperResult.data || [];
    const hasDetailedHelperColumns = helperRows.some((row) =>
      row.asset_debits !== undefined ||
      row.asset_credits !== undefined ||
      row.other_debits !== undefined ||
      row.other_credits !== undefined ||
      row.assetDebits !== undefined ||
      row.assetCredits !== undefined ||
      row.otherDebits !== undefined ||
      row.otherCredits !== undefined
    );

    if (helperRows.length > 0 && hasDetailedHelperColumns) {
      const pickValue = (row, keys, fallback = 0) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== null) {
            return row[key];
          }
        }
        return fallback;
      };

      const normalizeNumber = (value) => Number(value) || 0;

      helperRows.forEach((row) => {
        const day = String(pickValue(row, ['tx_date', 'transaction_date', 'day'], '') || '');
        if (!day || !isInOpenPeriod(day)) return;

        const assetDebits = normalizeNumber(pickValue(row, ['asset_debits', 'assetDebits'], 0));
        const assetCredits = normalizeNumber(pickValue(row, ['asset_credits', 'assetCredits'], 0));
        const otherDebits = normalizeNumber(pickValue(row, ['other_debits', 'otherDebits'], 0));
        const otherCredits = normalizeNumber(pickValue(row, ['other_credits', 'otherCredits'], 0));

        const assetsChange = assetDebits - assetCredits;
        const liabilitiesAndEquityChange = otherCredits - otherDebits;
        const bsDiff = assetsChange - liabilitiesAndEquityChange;
        const isBsBalanced = Math.abs(bsDiff) < 0.01;

        const totalDebits = assetDebits + otherDebits;
        const totalCredits = assetCredits + otherCredits;
        const tbDiff = totalDebits - totalCredits;
        const isTbBalanced = Math.abs(tbDiff) < 0.01;
        const isBalanced = isBsBalanced && isTbBalanced;

        dailyResults.push({
          day,
          difference: tbDiff,
          bsDiff,
          tbDiff,
          isBalanced
        });

        scannedCount += normalizeNumber(pickValue(row, ['transaction_count', 'tx_count', 'entry_count', 'count'], 0));
      });
    } else {
      const { data: allTransactions, error: transactionsError } = await supabase
        .from('GLTransaction')
        .select('id, account_number, transaction_date, debit_amount, credit_amount')
        .gte('transaction_date', minOpenDate)
        .lte('transaction_date', maxOpenDate);

      if (transactionsError) {
        throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
      }

      validTransactions = (allTransactions || []).filter((tx) => {
        const txDate = tx.transaction_date ? String(tx.transaction_date).split('T')[0] : null;
        if (!txDate) return false;

        if (!isInOpenPeriod(txDate)) return false;

        if (!knownAccountNumbers.has(tx.account_number)) {
          console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
          invalidTransactions.push(tx);
          return false;
        }
        return true;
      });

      const dailyBlocks = {};
      validTransactions.forEach((tx) => {
        const day = tx.transaction_date ? String(tx.transaction_date).split('T')[0] : 'Unknown';

        if (!dailyBlocks[day]) {
          dailyBlocks[day] = {
            assetDebits: 0,
            assetCredits: 0,
            otherDebits: 0,
            otherCredits: 0,
            count: 0
          };
        }

        const debit = Number(tx.debit_amount) || 0;
        const credit = Number(tx.credit_amount) || 0;
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

      scannedCount = validTransactions.length;

      for (const [day, data] of Object.entries(dailyBlocks)) {
        const assetsChange = data.assetDebits - data.assetCredits;
        const liabilitiesAndEquityChange = data.otherCredits - data.otherDebits;
        const bsDiff = assetsChange - liabilitiesAndEquityChange;
        const isBsBalanced = Math.abs(bsDiff) < 0.01;

        const totalDebits = data.assetDebits + data.otherDebits;
        const totalCredits = data.assetCredits + data.otherCredits;
        const tbDiff = totalDebits - totalCredits;
        const isTbBalanced = Math.abs(tbDiff) < 0.01;
        const isBalanced = isBsBalanced && isTbBalanced;

        dailyResults.push({
          day,
          difference: tbDiff,
          bsDiff,
          tbDiff,
          isBalanced
        });
      }
    }

    let totalImbalance = 0;
    let imbalancesCount = 0;

    dailyResults.forEach((res) => {
      if (!res.isBalanced) {
        imbalancesCount++;
        totalImbalance += res.difference;
      }
    });

    dailyResults.sort((a, b) => a.day.localeCompare(b.day));

    let emailBody = '<h2>GL Imbalance Report for Open Fiscal Periods</h2>';
    if (invalidTransactions.length > 0) {
      emailBody += '<div style="background-color: #ffcccc; padding: 10px; border: 1px solid #cc0000; margin-bottom: 20px;">';
      emailBody += '<h3 style="color: #cc0000; margin-top: 0;">CRITICAL WARNING: Unknown Accounts Detected</h3>';
      emailBody += `<p>Found <strong>${invalidTransactions.length}</strong> transactions referencing accounts that do not exist in the Chart of Accounts. These transactions have been excluded from the balance calculations.</p>`;
      emailBody += '<ul>';
      invalidTransactions.slice(0, 10).forEach((tx) => {
        emailBody += `<li>Tx ID: ${tx.id} | Date: ${String(tx.transaction_date).split('T')[0]} | Account: <strong>${tx.account_number}</strong> | Amount: $${tx.debit_amount || tx.credit_amount}</li>`;
      });
      if (invalidTransactions.length > 10) {
        emailBody += `<li>...and ${invalidTransactions.length - 10} more. Check server logs for full details.</li>`;
      }
      emailBody += '</ul></div>';
    }

    emailBody += `<p>Total Imbalanced Days: <strong>${imbalancesCount}</strong></p>`;
    emailBody += `<p>Total Imbalance Amount: <strong>$${totalImbalance.toFixed(2)}</strong></p>`;

    if (dailyResults.length === 0) {
      emailBody += '<p>No transactions found in open fiscal periods.</p>';
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

      dailyResults.forEach((res) => {
        const rowStyle = res.isBalanced ? '' : 'background-color: #ffe6e6; color: #cc0000;';
        const statusText = res.isBalanced ? 'Balanced' : 'Imbalanced';

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

    if (imbalancesCount > 0 || invalidTransactions.length > 0) {
      try {
        await base44.asServiceRole.functions.invoke('sendEmailViaSMTP', {
          to: 'tyler@kensauto.ca',
          subject: 'Daily GL Imbalance Report - ACTION REQUIRED',
          body: emailBody
        });
      } catch (emailError) {
        console.error('Failed to send imbalance email:', emailError.message || emailError);
      }
    }

    return Response.json({
      success: true,
      warnings: invalidTransactions.length > 0 ? `Found ${invalidTransactions.length} transactions with unknown accounts.` : null,
      invalidTransactions,
      data: {
        scannedCount,
        daysScanned: dailyResults.length,
        imbalancedDaysCount: imbalancesCount,
        totalImbalance
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});