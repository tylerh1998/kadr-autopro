import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data: openPeriods, error: openPeriodsError } = await supabase
      .from('FiscalPeriod')
      .select('*')
      .eq('is_closed', false);
    if (openPeriodsError) throw new Error(openPeriodsError.message);

    if (!openPeriods || openPeriods.length === 0) {
      return res({ success: true, message: 'No open fiscal periods found.' });
    }

    const minOpenDate = openPeriods.reduce((min: string, period: any) => period.start_date < min ? period.start_date : min, openPeriods[0].start_date);
    const maxOpenDate = openPeriods.reduce((max: string, period: any) => period.end_date > max ? period.end_date : max, openPeriods[0].end_date);

    const { data: allAccounts, error: accountsError } = await supabase
      .from('ChartOfAccount')
      .select('*')
      .limit(10000);
    if (accountsError) throw new Error(accountsError.message);

    const accountTypeMap: any = {};
    (allAccounts || []).forEach((acc: any) => {
      accountTypeMap[String(acc.account_number)] = acc.account_type;
    });

    const knownAccountNumbers = new Set((allAccounts || []).map((acc: any) => String(acc.account_number)));
    let invalidTransactions: any[] = [];
    let dailyResults: any[] = [];
    let scannedCount = 0;

    const isInOpenPeriod = (dateString: string) => {
      return openPeriods.some((period: any) => dateString >= period.start_date && dateString <= period.end_date);
    };

    const roundToCents = (value: any) => Number((Number(value) || 0).toFixed(2));
    const isBalancedAtCents = (value: any) => Math.abs(roundToCents(value)) < 0.009;

    const pickValue = (row: any, keys: string[], fallback: any = 0) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) {
          return row[key];
        }
      }
      return fallback;
    };

    const normalizeNumber = (value: any) => Number(value) || 0;

    const { data: helperRowsData, error: helperError } = await supabase.rpc('get_daily_gl_imbalances', {
      _start_date: minOpenDate,
      _end_date: maxOpenDate
    });

    if (!helperError) {
      const helperRows = helperRowsData || [];

      helperRows.forEach((row: any) => {
        const rawDay = String(pickValue(row, ['tx_day', 'transaction_date', 'tx_date', 'day'], '') || '');
        const day = rawDay ? rawDay.split('T')[0] : '';
        if (!day || !isInOpenPeriod(day)) return;

        const totalDebits = normalizeNumber(pickValue(row, ['total_debits', 'totalDebits', 'debits'], 0));
        const totalCredits = normalizeNumber(pickValue(row, ['total_credits', 'totalCredits', 'credits'], 0));
        const rawDiff = row.diff !== undefined && row.diff !== null
          ? normalizeNumber(row.diff)
          : totalDebits - totalCredits;
        const roundedDiff = roundToCents(rawDiff);
        const isBalanced = isBalancedAtCents(rawDiff);

        dailyResults.push({
          day,
          difference: roundedDiff,
          bsDiff: roundedDiff,
          tbDiff: roundedDiff,
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

      const validTransactions = (allTransactions || []).filter((tx: any) => {
        const txDate = tx.transaction_date ? String(tx.transaction_date).split('T')[0] : null;
        if (!txDate) return false;

        if (!isInOpenPeriod(txDate)) return false;

        if (!knownAccountNumbers.has(String(tx.account_number))) {
          console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
          invalidTransactions.push(tx);
          return false;
        }
        return true;
      });

      const dailyBlocks: any = {};
      validTransactions.forEach((tx: any) => {
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
        const accountType = accountTypeMap[String(tx.account_number)] || 'Unknown';

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

      for (const [day, data] of Object.entries(dailyBlocks) as [string, any][]) {
        const assetsChange = data.assetDebits - data.assetCredits;
        const liabilitiesAndEquityChange = data.otherCredits - data.otherDebits;
        const rawBsDiff = assetsChange - liabilitiesAndEquityChange;
        const bsDiff = roundToCents(rawBsDiff);
        const isBsBalanced = isBalancedAtCents(rawBsDiff);

        const totalDebits = data.assetDebits + data.otherDebits;
        const totalCredits = data.assetCredits + data.otherCredits;
        const rawTbDiff = totalDebits - totalCredits;
        const tbDiff = roundToCents(rawTbDiff);
        const isTbBalanced = isBalancedAtCents(rawTbDiff);
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

    dailyResults.forEach((r) => {
      if (!r.isBalanced) {
        imbalancesCount++;
        totalImbalance += r.difference;
      }
    });

    totalImbalance = roundToCents(totalImbalance);
    dailyResults.sort((a, b) => a.day.localeCompare(b.day));

    let emailBody = '<h2>GL Imbalance Report for Open Fiscal Periods</h2>';
    if (invalidTransactions.length > 0) {
      emailBody += '<div style="background-color: #ffcccc; padding: 10px; border: 1px solid #cc0000; margin-bottom: 20px;">';
      emailBody += '<h3 style="color: #cc0000; margin-top: 0;">CRITICAL WARNING: Unknown Accounts Detected</h3>';
      emailBody += `<p>Found <strong>${invalidTransactions.length}</strong> transactions referencing accounts that do not exist in the Chart of Accounts. These transactions have been excluded from the balance calculations.</p>`;
      emailBody += '<ul>';
      invalidTransactions.slice(0, 10).forEach((tx: any) => {
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

      dailyResults.forEach((res2) => {
        const rowStyle = res2.isBalanced ? '' : 'background-color: #ffe6e6; color: #cc0000;';
        const statusText = res2.isBalanced ? 'Balanced' : 'Imbalanced';

        emailBody += `
          <tr style="${rowStyle}">
            <td>${res2.day}</td>
            <td>$${res2.bsDiff.toFixed(2)}</td>
            <td>$${res2.tbDiff.toFixed(2)}</td>
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
        await supabase.functions.invoke('autopro-sendEmailViaSMTP', {
          body: {
            to: 'tyler@kensauto.ca',
            subject: 'Daily GL Imbalance Report - ACTION REQUIRED',
            body: emailBody
          }
        });
      } catch (emailError: any) {
        console.error('Failed to send imbalance email:', emailError.message || emailError);
      }
    }

    return res({
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
  } catch (error: any) {
    return res({ error: error.message });
  }
});
