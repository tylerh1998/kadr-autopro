import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import moment from "npm:moment-timezone@0.5.48";

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

    const { asOfDate } = await req.json();
    if (!asOfDate) {
      return res({ error: 'As-of date is required' });
    }

    const asOfDateStr = moment.tz(asOfDate, 'America/Edmonton').format('YYYY-MM-DD');
    console.log('Fetching Balance Sheet data as of:', asOfDateStr);

    const pickValue = (row: any, keys: string[], fallback: any = 0) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) {
          return row[key];
        }
      }
      return fallback;
    };

    const normalizeNumber = (value: any) => Number(value) || 0;

    const { data: allAccounts, error: accountsError } = await supabase
      .from('ChartOfAccount')
      .select('*')
      .limit(10000);
    if (accountsError) throw new Error(accountsError.message);
    console.log('Found accounts:', (allAccounts || []).length);

    const { data: rawAggregatedRowsData, error: rpcError } = await supabase.rpc('get_balance_sheet_data', {
      _as_of_date: asOfDateStr
    });
    if (rpcError) {
      throw new Error(`Failed to run get_balance_sheet_data: ${rpcError.message}`);
    }
    const rawAggregatedRows = rawAggregatedRowsData || [];

    const aggregatedRows = rawAggregatedRows
      .map((row: any) => ({
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
      .filter((row: any) => row.account_number);

    const accountTotalsMap: any = {};
    aggregatedRows.forEach((row: any) => {
      accountTotalsMap[row.account_number] = row;
    });

    const accountMap: any = {};
    (allAccounts || []).forEach((account: any) => {
      const totals = accountTotalsMap[String(account.account_number)] || {
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

      accountMap[String(account.account_number)] = {
        ...account,
        account_number: String(account.account_number),
        children: [],
        own_balance: ownBalance,
        total_balance: 0,
        balance: 0,
        credits: totals.totalCredits,
        debits: totals.totalDebits,
        transactionCount: totals.transactionCount
      };
    });

    const roots: any[] = [];
    Object.values(accountMap).forEach((accNode: any) => {
      const parentKey = accNode.parent_account != null ? String(accNode.parent_account) : null;
      if (parentKey && accountMap[parentKey]) {
        accountMap[parentKey].children.push(accNode);
      } else {
        roots.push(accNode);
      }
    });

    const calculateTotals = (node: any): number => {
      let childTotal = 0;
      node.children.forEach((child: any) => {
        childTotal += calculateTotals(child);
      });
      node.total_balance = node.own_balance + childTotal;
      node.balance = node.total_balance;
      return node.total_balance;
    };

    roots.forEach((root) => calculateTotals(root));

    const transformNode = (node: any) => {
      node.children.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
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

    const filterHierarchy = (nodes: any[]): any[] => {
      return nodes.reduce((acc: any[], node: any) => {
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

    const assetData = filterHierarchy(roots.filter((r: any) => r.account_type === 'Asset'));
    const liabilityData = filterHierarchy(roots.filter((r: any) => r.account_type === 'Liability'));
    const equityData = filterHierarchy(roots.filter((r: any) => r.account_type === 'Equity'));

    assetData.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
    liabilityData.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
    equityData.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));

    const revenueAccountNums = new Set((allAccounts || []).filter((acc: any) => acc.account_type === 'Revenue').map((acc: any) => String(acc.account_number)));
    const expenseAccountNums = new Set((allAccounts || []).filter((acc: any) => acc.account_type === 'Expense').map((acc: any) => String(acc.account_number)));
    const pnlAccountNumbers = [...new Set([...revenueAccountNums, ...expenseAccountNums])].filter(Boolean);

    const hasPeriodColumns = rawAggregatedRows.some((row: any) =>
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
      aggregatedRows.forEach((row: any) => {
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

      (pnlTransactions || []).forEach((tx: any) => {
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

    const hasExistingRetainedEarningsGLAccount = (allAccounts || []).some(
      (acc: any) => acc.account_type === 'Equity' && (acc.account_name || '').toLowerCase().includes('retained earnings') && acc.transactionCount > 0
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

    const totalAssets = assetData.reduce((sum: number, acc: any) => sum + acc.balance, 0);
    const totalLiabilities = liabilityData.reduce((sum: number, acc: any) => sum + acc.balance, 0);
    const totalEquity = equityData.reduce((sum: number, acc: any) => sum + acc.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    console.log('Balance Sheet Summary - Assets:', totalAssets, 'Liabilities:', totalLiabilities, 'Equity:', totalEquity, 'Net Income:', netIncome, 'Balanced:', isBalanced);

    return res({
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
  } catch (error: any) {
    console.error('Error generating Balance Sheet:', error);
    return res({
      error: error.message || 'Failed to generate Balance Sheet',
      details: error.stack
    });
  }
});
