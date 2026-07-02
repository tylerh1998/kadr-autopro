import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import moment from 'npm:moment-timezone@0.5.48';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asOfDate } = await req.json();
    if (!asOfDate) {
      return Response.json({ error: 'As-of date is required' }, { status: 400 });
    }

    const asOfDateStr = moment.tz(asOfDate, 'America/Edmonton').format('YYYY-MM-DD');
    console.log('Fetching Balance Sheet data as of:', asOfDateStr);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const callRpcWithCandidates = async (functionName, candidates) => {
      let lastError = null;

      for (const args of candidates) {
        const { data, error } = await supabase.rpc(functionName, args);
        if (!error) {
          return data || [];
        }
        lastError = error;
      }

      throw new Error(`Failed to run ${functionName}: ${lastError?.message || 'Unknown RPC error'}`);
    };

    const pickValue = (row, keys, fallback = 0) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) {
          return row[key];
        }
      }
      return fallback;
    };

    const normalizeNumber = (value) => Number(value) || 0;

    const allAccounts = await base44.entities.ChartOfAccount.list(null, 10000);
    console.log('Found accounts:', allAccounts.length);

    const rawAggregatedRows = await callRpcWithCandidates('get_balance_sheet_data', [
      { _as_of_date: asOfDateStr },
      { as_of_date: asOfDateStr },
      { p_as_of_date: asOfDateStr },
      { report_date: asOfDateStr },
      { asOfDate: asOfDateStr }
    ]);

    const aggregatedRows = (rawAggregatedRows || [])
      .map((row) => ({
        account_number: String(pickValue(row, ['account_number', 'gl_account_number', 'account', 'account_num'], '') || ''),
        totalDebits: normalizeNumber(pickValue(row, ['total_debits', 'debit_total', 'debits', 'total_debit', 'debit_amount'], 0)),
        totalCredits: normalizeNumber(pickValue(row, ['total_credits', 'credit_total', 'credits', 'total_credit', 'credit_amount'], 0)),
        directBalance: pickValue(row, ['balance', 'net_balance', 'account_balance', 'own_balance'], null),
        hasDirectBalance: ['balance', 'net_balance', 'account_balance', 'own_balance'].some((key) => row[key] !== undefined && row[key] !== null),
        ytdDebits: normalizeNumber(pickValue(row, ['ytd_debits', 'current_year_debits', 'cy_debits', 'year_to_date_debits'], 0)),
        ytdCredits: normalizeNumber(pickValue(row, ['ytd_credits', 'current_year_credits', 'cy_credits', 'year_to_date_credits'], 0)),
        priorDebits: normalizeNumber(pickValue(row, ['prior_debits', 'prior_year_debits', 'pre_year_debits', 'retained_earnings_debits'], 0)),
        priorCredits: normalizeNumber(pickValue(row, ['prior_credits', 'prior_year_credits', 'pre_year_credits', 'retained_earnings_credits'], 0)),
        transactionCount: normalizeNumber(pickValue(row, ['transaction_count', 'tx_count', 'entry_count', 'count'], 0))
      }))
      .filter((row) => row.account_number);

    const accountTotalsMap = {};
    aggregatedRows.forEach((row) => {
      accountTotalsMap[row.account_number] = row;
    });

    const accountMap = {};
    allAccounts.forEach((account) => {
      const totals = accountTotalsMap[account.account_number] || {
        totalDebits: 0,
        totalCredits: 0,
        directBalance: null,
        hasDirectBalance: false,
        transactionCount: 0
      };

      const ownBalance = totals.hasDirectBalance
        ? normalizeNumber(totals.directBalance)
        : account.account_type === 'Asset' || account.account_type === 'Expense'
          ? totals.totalDebits - totals.totalCredits
          : totals.totalCredits - totals.totalDebits;

      accountMap[account.account_number] = {
        ...account,
        children: [],
        own_balance: ownBalance,
        total_balance: 0,
        balance: 0,
        credits: totals.totalCredits,
        debits: totals.totalDebits,
        transactionCount: totals.transactionCount
      };
    });

    const roots = [];
    Object.values(accountMap).forEach((accNode) => {
      if (accNode.parent_account && accountMap[accNode.parent_account]) {
        accountMap[accNode.parent_account].children.push(accNode);
      } else {
        roots.push(accNode);
      }
    });

    const calculateTotals = (node) => {
      let childTotal = 0;
      node.children.forEach((child) => {
        childTotal += calculateTotals(child);
      });
      node.total_balance = node.own_balance + childTotal;
      node.balance = node.total_balance;
      return node.total_balance;
    };

    roots.forEach((root) => calculateTotals(root));

    const transformNode = (node) => {
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      if (node.children.length > 0 && Math.abs(node.own_balance) > 0.001) {
        const syntheticChild = {
          ...node,
          account_name: `${node.account_name} (Direct)`,
          balance: node.own_balance,
          children: [],
          is_synthetic: true,
          parent_account: node.account_number
        };
        node.children.unshift(syntheticChild);
      }
    };

    roots.forEach(transformNode);

    const filterHierarchy = (nodes) => {
      return nodes.reduce((acc, node) => {
        if (node.children && node.children.length > 0) {
          node.children = filterHierarchy(node.children);
        }

        const hasBalance = Math.abs(node.balance) > 0.001;
        const hasActivity = node.transactionCount > 0;
        const hasChildren = node.children && node.children.length > 0;

        if (hasBalance || hasActivity || hasChildren) {
          acc.push(node);
        }
        return acc;
      }, []);
    };

    const assetData = filterHierarchy(roots.filter((r) => r.account_type === 'Asset'));
    const liabilityData = filterHierarchy(roots.filter((r) => r.account_type === 'Liability'));
    const equityData = filterHierarchy(roots.filter((r) => r.account_type === 'Equity'));

    assetData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    liabilityData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    equityData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    const revenueAccountNums = new Set(allAccounts.filter((acc) => acc.account_type === 'Revenue').map((acc) => acc.account_number));
    const expenseAccountNums = new Set(allAccounts.filter((acc) => acc.account_type === 'Expense').map((acc) => acc.account_number));
    const pnlAccountNumbers = [...new Set([...revenueAccountNums, ...expenseAccountNums])].filter(Boolean);

    const hasPeriodColumns = (rawAggregatedRows || []).some((row) =>
      row.ytd_debits !== undefined ||
      row.ytd_credits !== undefined ||
      row.current_year_debits !== undefined ||
      row.current_year_credits !== undefined ||
      row.prior_debits !== undefined ||
      row.prior_credits !== undefined ||
      row.prior_year_debits !== undefined ||
      row.prior_year_credits !== undefined
    );

    const currentYear = moment.tz(asOfDateStr, 'America/Edmonton').year();
    const startOfYearStr = `${currentYear}-01-01`;

    let yearToDateRevenue = 0;
    let yearToDateExpenses = 0;
    let retainedEarningsRevenue = 0;
    let retainedEarningsExpenses = 0;

    if (hasPeriodColumns) {
      aggregatedRows.forEach((row) => {
        if (revenueAccountNums.has(row.account_number)) {
          yearToDateRevenue += row.ytdCredits - row.ytdDebits;
          retainedEarningsRevenue += row.priorCredits - row.priorDebits;
        } else if (expenseAccountNums.has(row.account_number)) {
          yearToDateExpenses += row.ytdDebits - row.ytdCredits;
          retainedEarningsExpenses += row.priorDebits - row.priorCredits;
        }
      });
    } else if (pnlAccountNumbers.length > 0) {
      const { data: pnlTransactions, error: pnlError } = await supabase
        .from('GLTransaction')
        .select('account_number, transaction_date, debit_amount, credit_amount')
        .in('account_number', pnlAccountNumbers)
        .lte('transaction_date', asOfDateStr);

      if (pnlError) {
        throw new Error(`Failed to fetch P&L transactions from Supabase: ${pnlError.message}`);
      }

      (pnlTransactions || []).forEach((tx) => {
        if (!tx.transaction_date) return;
        const txDateStr = moment.tz(tx.transaction_date, 'America/Edmonton').format('YYYY-MM-DD');

        if (txDateStr >= startOfYearStr) {
          if (revenueAccountNums.has(tx.account_number)) {
            yearToDateRevenue += (Number(tx.credit_amount) || 0) - (Number(tx.debit_amount) || 0);
          } else if (expenseAccountNums.has(tx.account_number)) {
            yearToDateExpenses += (Number(tx.debit_amount) || 0) - (Number(tx.credit_amount) || 0);
          }
        } else {
          if (revenueAccountNums.has(tx.account_number)) {
            retainedEarningsRevenue += (Number(tx.credit_amount) || 0) - (Number(tx.debit_amount) || 0);
          } else if (expenseAccountNums.has(tx.account_number)) {
            retainedEarningsExpenses += (Number(tx.debit_amount) || 0) - (Number(tx.credit_amount) || 0);
          }
        }
      });
    }

    const netIncome = yearToDateRevenue - yearToDateExpenses;
    const retainedEarnings = retainedEarningsRevenue - retainedEarningsExpenses;

    if (Math.abs(netIncome) > 0.001) {
      equityData.push({
        account_number: '',
        account_name: 'Net Income',
        balance: netIncome,
        children: [],
        is_synthetic: true,
        transactionCount: 0,
        account_type: 'Equity'
      });
    }

    const hasExistingRetainedEarningsGLAccount = allAccounts.some(
      (acc) => acc.account_type === 'Equity' && acc.account_name.toLowerCase().includes('retained earnings') && acc.transactionCount > 0
    );

    if (!hasExistingRetainedEarningsGLAccount && Math.abs(retainedEarnings) > 0.001) {
      equityData.push({
        account_number: '',
        account_name: "Retained Earnings (Prior Years' P&L)",
        balance: retainedEarnings,
        children: [],
        is_synthetic: true,
        transactionCount: 0,
        account_type: 'Equity'
      });
    }

    const totalAssets = assetData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = liabilityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalEquity = equityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    console.log('Balance Sheet Summary - Assets:', totalAssets, 'Liabilities:', totalLiabilities, 'Equity:', totalEquity, 'Net Income:', netIncome, 'Balanced:', isBalanced);

    return Response.json({
      success: true,
      warnings: null,
      invalidTransactions: [],
      data: {
        assets: assetData,
        liabilities: liabilityData,
        equity: equityData,
        summary: {
          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesAndEquity,
          isBalanced
        },
        asOfDate: asOfDateStr
      }
    });
  } catch (error) {
    console.error('Error generating Balance Sheet:', error);
    return Response.json({
      error: error.message || 'Failed to generate Balance Sheet',
      details: error.stack
    }, { status: 500 });
  }
});