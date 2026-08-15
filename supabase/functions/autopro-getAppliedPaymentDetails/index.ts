import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const parseArApplyTo = (value: any) => {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};

const parseAppliedData = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { paymentId, arApplyTo, customerId } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetCustomerId = customerId || null;
    let fallbackArApplyTo = arApplyTo || '';

    if (paymentId) {
      const { data: payment, error: paymentError } = await supabase
        .from('CustomerPayments')
        .select('id, customer_id, ar_applyto')
        .eq('id', paymentId)
        .maybeSingle();

      if (paymentError) throw paymentError;
      if (!payment) {
        return new Response(JSON.stringify({ error: 'Payment not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      targetCustomerId = payment.customer_id || targetCustomerId;
      fallbackArApplyTo = payment.ar_applyto || fallbackArApplyTo;
    }

    if (!targetCustomerId) {
      return new Response(JSON.stringify({ success: true, appliedDetails: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: customerData, error: customerDataError } = await supabase.rpc('get_customer_ar_data', {
      customer_id_val: targetCustomerId
    });

    if (customerDataError) throw customerDataError;

    const rowMap = Object.fromEntries((customerData || []).map((row: any) => [row.transaction_id, row]));
    const paymentRow = paymentId ? rowMap[paymentId] : null;
    const rpcAppliedData = parseAppliedData(paymentRow?.applied_data);
    const parsedAppliedData = rpcAppliedData.length
      ? rpcAppliedData
      : parseArApplyTo(fallbackArApplyTo);

    const appliedDetails = parsedAppliedData
      .map((item: any) => {
        const id = item?.id;
        const amountApplied = Number(item?.amount) || 0;
        if (!id) return null;

        const row = rowMap[id];
        if (!row) {
          return {
            id,
            type: 'Unknown',
            reference: '',
            date: null,
            description: '',
            amountApplied,
            isOverpayment: false,
            source: 'unknown'
          };
        }

        const numericAmount = Number(row.amount) || 0;
        const isOverpayment = row.transaction_type === 'adjustment' && String(row.reference || '').startsWith('OVERPMT');

        return {
          id,
          type: row.transaction_type === 'payment'
            ? 'Invoice'
            : isOverpayment
              ? 'Overpayment Credit'
              : numericAmount > 0
                ? 'Charge'
                : 'Credit',
          reference: row.reference || '',
          date: row.txn_date ? String(row.txn_date).slice(0, 10) : null,
          description: item?.description || row.description || '',
          amountApplied,
          isOverpayment,
          source: row.transaction_type === 'payment' ? 'customer_payment' : 'customer_ar_adjustment'
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const dateA = a.date || '9999-12-31';
        const dateB = b.date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });

    return new Response(JSON.stringify({ success: true, appliedDetails }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error('Error in autopro-getAppliedPaymentDetails:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
