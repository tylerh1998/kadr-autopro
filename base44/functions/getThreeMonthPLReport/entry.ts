import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endDate } = await req.json();
    const isValidDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

    if (!isValidDateString(endDate)) {
      return Response.json({ error: 'A valid endDate is required' }, { status: 400 });
    }

    const parseDateOnly = (dateStr) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };

    const formatDateOnly = (date) => date.toISOString().split('T')[0];
    const getMonthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const getMonthEnd = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatMonthLabel = (date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    const roundAmount = (value) => Math.round((value || 0) * 100) / 100;
    const getVariancePercent = (month1, month3) => {
      if (Math.abs(month1) < 0.005) return null;
      return ((month3 - month1) / month1) * 100;
    };

    const anchorDate = parseDateOnly(endDate);
    const month3Start = getMonthStart(anchorDate);
    const month2Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 1, 1));
    const month1Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 2, 1));

    const months = [
      { key: 'month1', label: formatMonthLabel(month1Start), start: formatDateOnly(month1Start), end: formatDateOnly(getMonthEnd(month1Start)) },
      { key: 'month2', label: formatMonthLabel(month2Start), start: formatDateOnly(month2Start), end: formatDateOnly(getMonthEnd(month2Start)) },
      { key: 'month3', label: formatMonthLabel(month3Start), start: formatDateOnly(month3Start), end: formatDateOnly(getMonthEnd(month3Start)) }
    ];

    const overallStart = months[0].start;
    const overallEnd = months[2].end;

    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list(null, 10000);
    const plAccounts = allAccounts.filter((account) => (
      ['Revenue', 'Expense'].includes(account.account_type) && account.is_active !== false
    ));

    let allTransactions = [];
    let skip = 0;
    const limit = 5000;
    let hasMore = true;

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.GLTransaction.list('-transaction_date', limit, skip);
      allTransactions = allTransactions.concat(batch);
      if (batch.length < limit) {
        hasMore = false;
      } else {
        skip += limit;
      }
    }

    const monthForDate = (dateStr) => {
      return months.find((month) => dateStr >= month.start && dateStr <= month.end)?.key || null;
    };

    const accountRows = {};

    plAccounts.forEach((account) => {
      accountRows[account.account_number] = {
        account_number: account.account_number,
        account_name: account.account_name,
        account_type: account.account_type,
        month1: 0,
        month2: 0,
        month3: 0,
        variance_pct: null
      };
    });

    allTransactions.forEach((tx) => {
      const txDate = String(tx.transaction_date || '').split('T')[0];
      if (!txDate || txDate < overallStart || txDate > overallEnd) return;

      const row = accountRows[tx.account_number];
      const monthKey = monthForDate(txDate);
      if (!row || !monthKey) return;

      const creditAmount = Number(tx.credit_amount) || 0;
      const debitAmount = Number(tx.debit_amount) || 0;
      const signedAmount = row.account_type === 'Revenue'
        ? creditAmount - debitAmount
        : debitAmount - creditAmount;

      row[monthKey] += signedAmount;
    });

    const buildRows = (accountType) => {
      return Object.values(accountRows)
        .filter((row) => row.account_type === accountType)
        .map((row) => {
          const month1 = roundAmount(row.month1);
          const month2 = roundAmount(row.month2);
          const month3 = roundAmount(row.month3);
          return {
            ...row,
            month1,
            month2,
            month3,
            variance_pct: getVariancePercent(month1, month3)
          };
        })
        .filter((row) => Math.abs(row.month1) > 0.005 || Math.abs(row.month2) > 0.005 || Math.abs(row.month3) > 0.005)
        .sort((a, b) => a.account_number.localeCompare(b.account_number));
    };

    const revenueRows = buildRows('Revenue');
    const expenseRows = buildRows('Expense');

    const summarizeRows = (rows) => {
      const month1 = roundAmount(rows.reduce((sum, row) => sum + row.month1, 0));
      const month2 = roundAmount(rows.reduce((sum, row) => sum + row.month2, 0));
      const month3 = roundAmount(rows.reduce((sum, row) => sum + row.month3, 0));
      return {
        month1,
        month2,
        month3,
        variance_pct: getVariancePercent(month1, month3)
      };
    };

    const totalRevenue = summarizeRows(revenueRows);
    const totalExpenses = summarizeRows(expenseRows);
    const netIncome = {
      month1: roundAmount(totalRevenue.month1 - totalExpenses.month1),
      month2: roundAmount(totalRevenue.month2 - totalExpenses.month2),
      month3: roundAmount(totalRevenue.month3 - totalExpenses.month3)
    };
    netIncome.variance_pct = getVariancePercent(netIncome.month1, netIncome.month3);

    return Response.json({
      success: true,
      data: {
        endDate,
        months,
        revenueRows,
        expenseRows,
        summary: {
          totalRevenue,
          totalExpenses,
          netIncome
        }
      }
    });
  } catch (error) {
    console.error('Error generating three month P&L report:', error);
    return Response.json({ error: error.message || 'Failed to generate three month P&L report' }, { status: 500 });
  }
});