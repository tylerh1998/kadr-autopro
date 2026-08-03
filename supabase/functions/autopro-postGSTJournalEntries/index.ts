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

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const auditUser = user.user_metadata?.full_name || user.email || 'Unknown User';
    const getAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user.id,
      updated_by: auditUser
    });

    const { gst_return_id, gst_collected, gst_paid, period_end_date } = await req.json();

    if (!gst_return_id) {
      return res({ error: 'Missing gst_return_id' });
    }

    // Fetch system settings for account numbers
    const { data: settingsList, error: settingsError } = await supabase
      .from('SystemSettings')
      .select('gst_collected_account_number, gst_paid_account_number, gst_payable_receivable_account_number')
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }

    const settings = settingsList?.[0] || {};

    const gstCollectedAccount = String(settings.gst_collected_account_number || '2002');
    const gstPaidAccount = String(settings.gst_paid_account_number || '2003');
    const gstPayableAccount = String(settings.gst_payable_receivable_account_number || '2001');

    // Use period end date as transaction date, or today (Mountain Time) if missing
    const txDate = period_end_date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
    const sourceId = gst_return_id;
    const sourceType = 'supplier_invoice';
    const description = `GST Return Posting (Consolidation)`;

    const glTransactions: any[] = [];

    // 1. Move GST Collected to Payable
    // Account usually has Credit balance (gst_collected > 0). We need to Debit it to clear.
    if (gst_collected && gst_collected !== 0) {
      const amount = Math.abs(gst_collected);
      if (gst_collected > 0) {
        // Normal case (Credit Balance): Debit collected, Credit payable
        glTransactions.push({
          account_number: gstCollectedAccount,
          transaction_date: txDate,
          description: `${description} - Clear Collected`,
          reference: `GST-${gst_return_id}`,
          debit_amount: amount,
          credit_amount: 0,
          source_type: sourceType,
          source_id: sourceId
        });
        glTransactions.push({
          account_number: gstPayableAccount,
          transaction_date: txDate,
          description: `${description} - Transfer Collected`,
          reference: `GST-${gst_return_id}`,
          debit_amount: 0,
          credit_amount: amount,
          source_type: sourceType,
          source_id: sourceId
        });
      } else {
        // Negative collection (Debit Balance): Credit collected, Debit payable
        glTransactions.push({
          account_number: gstCollectedAccount,
          transaction_date: txDate,
          description: `${description} - Clear Collected`,
          reference: `GST-${gst_return_id}`,
          debit_amount: 0,
          credit_amount: amount,
          source_type: sourceType,
          source_id: sourceId
        });
        glTransactions.push({
          account_number: gstPayableAccount,
          transaction_date: txDate,
          description: `${description} - Transfer Collected`,
          reference: `GST-${gst_return_id}`,
          debit_amount: amount,
          credit_amount: 0,
          source_type: sourceType,
          source_id: sourceId
        });
      }
    }

    // 2. Move GST Paid to Payable
    // Account usually has Debit balance (gst_paid > 0). We need to Credit it to clear.
    if (gst_paid && gst_paid !== 0) {
      const amount = Math.abs(gst_paid);
      if (gst_paid > 0) {
        // Normal case (Debit Balance): Credit paid, Debit payable
        glTransactions.push({
          account_number: gstPaidAccount,
          transaction_date: txDate,
          description: `${description} - Clear Paid`,
          reference: `GST-${gst_return_id}`,
          debit_amount: 0,
          credit_amount: amount,
          source_type: sourceType,
          source_id: sourceId
        });
        glTransactions.push({
          account_number: gstPayableAccount,
          transaction_date: txDate,
          description: `${description} - Transfer Paid`,
          reference: `GST-${gst_return_id}`,
          debit_amount: amount,
          credit_amount: 0,
          source_type: sourceType,
          source_id: sourceId
        });
      } else {
        // Negative paid (Credit Balance): Debit paid, Credit payable
        glTransactions.push({
          account_number: gstPaidAccount,
          transaction_date: txDate,
          description: `${description} - Clear Paid`,
          reference: `GST-${gst_return_id}`,
          debit_amount: amount,
          credit_amount: 0,
          source_type: sourceType,
          source_id: sourceId
        });
        glTransactions.push({
          account_number: gstPayableAccount,
          transaction_date: txDate,
          description: `${description} - Transfer Paid`,
          reference: `GST-${gst_return_id}`,
          debit_amount: 0,
          credit_amount: amount,
          source_type: sourceType,
          source_id: sourceId
        });
      }
    }

    const glTransactionsToInsert = glTransactions.map((tx) => ({
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      ...getAuditFields(),
      ...tx
    }));

    const { error: insertError } = await supabase.from('GLTransaction').insert(glTransactionsToInsert);
    if (insertError) {
      throw new Error(`Failed to insert GL transactions: ${insertError.message}`);
    }

    return res({ success: true, count: glTransactions.length });

  } catch (error: any) {
    console.error('Error posting GST journal entries:', error);
    return res({ error: error.message });
  }
});
