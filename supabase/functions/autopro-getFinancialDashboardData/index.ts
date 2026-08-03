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
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { dateRange } = await req.json();

    const isValidDateString = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
    const getMountainDateString = (date = new Date()) => {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    };

    const todayMountain = getMountainDateString();
    const fromDateStr = isValidDateString(dateRange?.from) ? dateRange.from : `${todayMountain.slice(0, 4)}-01-01`;
    const toDateStr = isValidDateString(dateRange?.to) ? dateRange.to : todayMountain;

    const [glMonthlyResponse, bankAccountsResponse, cashFlowDailyResponse, customerPaymentsResponse] = await Promise.all([
      supabase.rpc('get_financial_dashboard_gl_monthly', { p_start_date: fromDateStr, p_end_date: toDateStr }),
      supabase.from('BankAccount').select('*'),
      supabase.rpc('get_bank_cash_flow_daily', { p_from_date: fromDateStr, p_to_date: toDateStr }),
      supabase
        .from('CustomerPayments')
        .select('amount, payment_method, payment_date, ar_pmt')
        .gte('payment_date', fromDateStr)
        .lte('payment_date', toDateStr)
    ]);

    if (glMonthlyResponse.error) {
      throw new Error(glMonthlyResponse.error.message || 'Failed to run get_financial_dashboard_gl_monthly');
    }
    if (bankAccountsResponse.error) {
      throw new Error(bankAccountsResponse.error.message || 'Failed to fetch BankAccount from Supabase');
    }
    if (cashFlowDailyResponse.error) {
      throw new Error(cashFlowDailyResponse.error.message || 'Failed to run get_bank_cash_flow_daily');
    }
    if (customerPaymentsResponse.error) {
      throw new Error(customerPaymentsResponse.error.message || 'Failed to fetch CustomerPayments from Supabase');
    }

    const glMonthlyRows = glMonthlyResponse.data || [];
    const bankAccounts = bankAccountsResponse.data || [];
    const cashFlowDailyRows = cashFlowDailyResponse.data || [];
    const customerPayments = customerPaymentsResponse.data || [];

    // Revenue/expense/monthly/category breakdown — preserves the legacy's exact hardcoded
    // account-number-range logic (4000-4999 = revenue, >=5000 = expense), NOT account_type,
    // since that's what the original function actually does.
    let totalRevenue = 0;
    let totalExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    const monthlyData: Record<string, { revenue: number; expenses: number }> = {};
    const accountBalancesByType: Record<string, number> = {
      Asset: 0,
      Liability: 0,
      Equity: 0,
      Revenue: 0,
      Expense: 0
    };

    glMonthlyRows.forEach((row: any) => {
      const debit = Number(row.total_debits) || 0;
      const credit = Number(row.total_credits) || 0;
      const accountNum = parseInt(row.account_number, 10);

      if (!monthlyData[row.month_key]) {
        monthlyData[row.month_key] = { revenue: 0, expenses: 0 };
      }

      if (accountNum >= 4000 && accountNum <= 4999) {
        const rev = credit - debit;
        totalRevenue += rev;
        monthlyData[row.month_key].revenue += rev;
      } else if (accountNum >= 5000) {
        const exp = debit - credit;
        totalExpenses += exp;
        monthlyData[row.month_key].expenses += exp;

        const categoryName = row.account_name ? `${row.account_number} - ${row.account_name}` : row.account_number;
        expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + exp;
      }

      if (row.account_type && accountBalancesByType[row.account_type] !== undefined) {
        accountBalancesByType[row.account_type] += debit - credit;
      }
    });

    const netIncome = totalRevenue - totalExpenses;

    let cashPosition = 0;
    bankAccounts.filter((acc: any) => acc.is_active !== false).forEach((acc: any) => {
      cashPosition += Number(acc.current_balance) || 0;
    });

    const revenueVsExpensesChart = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        revenue: Math.round(data.revenue * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        netIncome: Math.round((data.revenue - data.expenses) * 100) / 100
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    Object.keys(accountBalancesByType).forEach((type) => {
      accountBalancesByType[type] = Math.round(accountBalancesByType[type] * 100) / 100;
    });

    const topExpenseCategories = Object.entries(expensesByCategory)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Cash flow by account, from the pre-computed daily RPC (already includes the full date spine
    // and the reverse-chronological balance walk).
    const activeBankAccounts = bankAccounts.filter((acc: any) => acc.is_active !== false);
    const accountNameById: Record<string, string> = {};
    activeBankAccounts.forEach((acc: any) => {
      accountNameById[acc.id] = acc.name;
    });

    const rowsByAccount: Record<string, any[]> = {};
    cashFlowDailyRows.forEach((row: any) => {
      if (!rowsByAccount[row.bank_account_id]) rowsByAccount[row.bank_account_id] = [];
      rowsByAccount[row.bank_account_id].push(row);
    });

    const cashFlowByAccount = activeBankAccounts.map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      data: (rowsByAccount[acc.id] || [])
        .slice()
        .sort((a: any, b: any) => String(a.tx_date).localeCompare(String(b.tx_date)))
        .map((d: any) => ({
          date: d.tx_date,
          inflow: Math.round((Number(d.inflow) || 0) * 100) / 100,
          outflow: Math.round((Number(d.outflow) || 0) * 100) / 100,
          netCashFlow: Math.round((Number(d.net_cash_flow) || 0) * 100) / 100,
          balance: Math.round((Number(d.balance) || 0) * 100) / 100
        }))
    }));

    const allAccountsByDate: Record<string, { date: string; inflow: number; outflow: number; netCashFlow: number; balance: number }> = {};
    cashFlowDailyRows.forEach((row: any) => {
      const date = row.tx_date;
      if (!allAccountsByDate[date]) {
        allAccountsByDate[date] = { date, inflow: 0, outflow: 0, netCashFlow: 0, balance: 0 };
      }
      allAccountsByDate[date].inflow += Number(row.inflow) || 0;
      allAccountsByDate[date].outflow += Number(row.outflow) || 0;
      allAccountsByDate[date].netCashFlow += Number(row.net_cash_flow) || 0;
      allAccountsByDate[date].balance += Number(row.balance) || 0;
    });

    const allAccountsData = Object.values(allAccountsByDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        inflow: Math.round(d.inflow * 100) / 100,
        outflow: Math.round(d.outflow * 100) / 100,
        netCashFlow: Math.round(d.netCashFlow * 100) / 100,
        balance: Math.round(d.balance * 100) / 100
      }));

    cashFlowByAccount.unshift({
      id: 'all',
      name: 'All Accounts',
      data: allAccountsData
    });

    const cashFlowChart = cashFlowByAccount[0].data;

    const normalizeDateText = (value: any) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : raw;
    };

    const customerPaymentsByMethod: Record<string, number> = {};
    const customerPaymentCountsByMethod: Record<string, number> = {};
    let customerPaymentsTotalAmount = 0;
    let customerPaymentsTotalCount = 0;
    let receivedOnAccountsTotal = 0;

    customerPayments.forEach((payment: any) => {
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

    // Target bank stats — narrow, targeted query (one account, one month), kept as a direct native read.
    const currentMonthStartStr = `${toDateStr.slice(0, 7)}-01`;
    const targetBankId = '68b95ed97223c7b3d2882f5d';

    const { data: targetBankTxs, error: targetBankTxsError } = await supabase
      .from('BankTransaction')
      .select('source_type, credit_amount, debit_amount, transaction_date')
      .eq('bank_account_id', targetBankId)
      .gte('transaction_date', currentMonthStartStr)
      .lte('transaction_date', toDateStr);

    if (targetBankTxsError) {
      throw new Error(targetBankTxsError.message || 'Failed to fetch target bank transactions');
    }

    const targetBankStats = { credits: 0, debits: 0 };
    (targetBankTxs || []).forEach((tx: any) => {
      const validCreditSources = ['deposit', 'manual', 'registries'];
      if (validCreditSources.includes(tx.source_type) && tx.credit_amount) {
        targetBankStats.credits += Number(tx.credit_amount) || 0;
      }
      if (tx.source_type !== 'transfer' && tx.debit_amount) {
        targetBankStats.debits += Number(tx.debit_amount) || 0;
      }
    });

    targetBankStats.credits = Math.round(targetBankStats.credits * 100) / 100;
    targetBankStats.debits = Math.round(targetBankStats.debits * 100) / 100;

    const bankAccountsSummary = bankAccounts
      .filter((acc: any) => acc.is_active !== false)
      .map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        bank_name: acc.bank_name,
        account_type: acc.account_type,
        current_balance: Math.round((Number(acc.current_balance) || 0) * 100) / 100
      }))
      .sort((a: any, b: any) => b.current_balance - a.current_balance);

    return res({
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
          cashFlowByAccount,
          accountBalancesByType: Object.entries(accountBalancesByType)
            .filter(([, amount]) => amount !== 0)
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
  } catch (error: any) {
    console.error('Error generating financial dashboard data:', error);
    return res({
      success: false,
      error: error.message || 'Failed to generate financial dashboard data'
    });
  }
});
