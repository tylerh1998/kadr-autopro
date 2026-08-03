import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getMountainDateString = (value: any) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
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

  console.log('--- getSupplierTransactions: Function invoked ---');

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { supplierId, dateRange } = await req.json();

    if (!supplierId) {
      return res({ success: false, error: 'supplierId is required' });
    }

    const fromDate = getMountainDateString(dateRange?.from);
    const toDate = getMountainDateString(dateRange?.to);

    const { data: supplierDataArr, error: supplierErr } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', supplierId)
      .limit(1);

    const supplierData = supplierDataArr?.[0];

    if (supplierErr || !supplierData) {
      return res({ success: false, error: 'Supplier not found' });
    }

    const [chartOfAccountsResponse, paymentsResponse, rpcResponse, bankAccountsResponse] = await Promise.all([
      supabase.from('ChartOfAccount').select('*').limit(1000),
      supabase
        .from('SupplierPayment')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('payment_date', { ascending: false }),
      supabase.rpc('get_supplier_transactions_optimized', {
        p_supplier_id: supplierId,
        p_from_date: fromDate,
        p_to_date: toDate
      }),
      supabase
        .from('BankAccount')
        .select('id, name')
    ]);

    if (chartOfAccountsResponse.error) {
      return res({
        success: false,
        error: chartOfAccountsResponse.error.message || 'Failed to fetch chart of accounts'
      });
    }

    if (paymentsResponse.error) {
      return res({
        success: false,
        error: paymentsResponse.error.message || 'Failed to fetch supplier payments'
      });
    }

    if (rpcResponse.error) {
      console.error('RPC Error:', rpcResponse.error);
      return res({
        success: false,
        error: rpcResponse.error.message || 'Failed to fetch supplier transactions'
      });
    }

    if (bankAccountsResponse.error) {
      return res({
        success: false,
        error: bankAccountsResponse.error.message || 'Failed to fetch bank accounts'
      });
    }

    const bankAccountMap = new Map((bankAccountsResponse.data || []).map((account: any) => [account.id, account.name]));
    const paymentsWithBankNames = (paymentsResponse.data || []).map((payment: any) => {
      if (payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque') {
        return {
          ...payment,
          bank_account_name: bankAccountMap.get(payment.source) || '-'
        };
      }

      return payment;
    });

    return res({
      success: true,
      data: {
        supplier: supplierData,
        chartOfAccounts: chartOfAccountsResponse.data || [],
        payments: paymentsWithBankNames,
        conceptualInvoices: rpcResponse.data?.conceptualInvoices || [],
        allConceptualInvoices: rpcResponse.data?.allConceptualInvoices || [],
        invoiceLines: rpcResponse.data?.invoiceLines || [],
        allInvoiceLines: rpcResponse.data?.allInvoiceLines || [],
        currentBalance: Number(rpcResponse.data?.currentBalance || 0),
        dateRangeTotal: Number(rpcResponse.data?.dateRangeTotal || 0)
      }
    });
  } catch (error: any) {
    console.error('--- Error in getSupplierTransactions ---');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    return res({
      success: false,
      error: error.message || 'Failed to fetch supplier transactions'
    });
  }
});
