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
      return res({ error: 'Supabase configuration is missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { period_start_date, period_end_date } = await req.json();

    if (!period_start_date || !period_end_date) {
      return res({ error: 'Missing required fields: period_start_date and period_end_date' });
    }

    const { data: settingsRecords, error: settingsError } = await supabase
      .from('SystemSettings')
      .select('gst_collected_account_number, gst_paid_account_number')
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }

    const settings = settingsRecords && settingsRecords.length > 0 ? settingsRecords[0] : null;

    if (!settings) {
      return res({ error: 'System settings not found. Please configure GST account numbers.' });
    }

    const gstCollectedAccount = String(settings.gst_collected_account_number || '2002');
    const gstPaidAccount = String(settings.gst_paid_account_number || '2003');

    // Fetch GL transactions within date range with pagination
    const transactions: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error: fetchError } = await supabase
        .from('GLTransaction')
        .select('account_number, debit_amount, credit_amount')
        .gte('transaction_date', period_start_date)
        .lte('transaction_date', period_end_date)
        .range(from, to);

      if (fetchError) {
        throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
      }

      if (!batch || batch.length === 0) break;

      transactions.push(...batch);

      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Calculate GST collected (credits to the configured "collected" account)
    const gstCollectedTransactions = transactions.filter(
      (tx) => String(tx.account_number) === gstCollectedAccount
    );
    const gstCollected = gstCollectedTransactions.reduce(
      (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0),
      0
    );

    // Calculate GST paid (debits to the configured "paid" account)
    const gstPaidTransactions = transactions.filter(
      (tx) => String(tx.account_number) === gstPaidAccount
    );
    const gstPaid = gstPaidTransactions.reduce(
      (sum, tx) => sum + (tx.debit_amount || 0) - (tx.credit_amount || 0),
      0
    );

    // Net GST due (positive = owe, negative = refund)
    const netGstDue = gstCollected - gstPaid;

    // Total sales/purchases (for reference) — string comparisons against text account numbers, matching legacy
    const salesTransactions = transactions.filter(
      (tx) => tx.account_number >= '4000' && tx.account_number < '5000'
    );
    const totalSales = salesTransactions.reduce(
      (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0),
      0
    );

    const purchaseTransactions = transactions.filter(
      (tx) => tx.account_number >= '5000' && tx.account_number < '7000'
    );
    const totalPurchases = purchaseTransactions.reduce(
      (sum, tx) => sum + (tx.debit_amount || 0) - (tx.credit_amount || 0),
      0
    );

    return res({
      period_start_date,
      period_end_date,
      gst_collected: Math.round(gstCollected * 100) / 100,
      gst_paid: Math.round(gstPaid * 100) / 100,
      net_gst_due: Math.round(netGstDue * 100) / 100,
      total_sales: Math.round(totalSales * 100) / 100,
      total_purchases: Math.round(totalPurchases * 100) / 100,
      gst_collected_account: gstCollectedAccount,
      gst_paid_account: gstPaidAccount
    });

  } catch (error: any) {
    console.error('Error calculating GST return:', error);
    return res({ error: error.message || 'Failed to calculate GST return' });
  }
});
