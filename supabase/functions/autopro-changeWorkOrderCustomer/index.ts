import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
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
    const userEmail = authData.user.email || null;

    const body = await req.json().catch(() => ({}));
    const workOrderId = body.workOrderId;
    const newCustomerId = body.newCustomerId;
    const paymentIds = Array.isArray(body.paymentIds) ? body.paymentIds.filter(Boolean) : [];

    if (!workOrderId || !newCustomerId) {
      return new Response(JSON.stringify({ error: 'workOrderId and newCustomerId are required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();

    const workOrderUpdate = await supabaseAdmin
      .from('WorkOrder')
      .update({
        customer_id: newCustomerId,
        last_updated: nowIso,
        last_updated_by: userEmail,
      })
      .eq('id', workOrderId)
      .select('id, customer_id')
      .single();

    if (workOrderUpdate.error) throw workOrderUpdate.error;

    let updatedPaymentsCount = 0;

    if (paymentIds.length > 0) {
      const paymentsUpdate = await supabaseAdmin
        .from('CustomerPayments')
        .update({
          customer_id: newCustomerId,
          updated_date: nowIso,
        })
        .eq('work_order_id', workOrderId)
        .in('id', paymentIds)
        .select('id');

      if (paymentsUpdate.error) throw paymentsUpdate.error;

      updatedPaymentsCount = Array.isArray(paymentsUpdate.data) ? paymentsUpdate.data.length : 0;
    }

    return new Response(JSON.stringify({
      success: true,
      workOrderId,
      newCustomerId,
      updatedPaymentsCount,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
