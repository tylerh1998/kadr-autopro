import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import moment from "npm:moment-timezone@0.5.48";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const getCurrentMountainTimestamp = () => moment.tz('America/Edmonton').format();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { transactionIds, reconciliationId } = await req.json();

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No transaction IDs provided' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!reconciliationId) {
      return new Response(JSON.stringify({ error: 'Reconciliation ID is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    console.log(`Processing batch reconciliation for ${transactionIds.length} transactions. ID: ${reconciliationId}`);

    const updatedTimestamp = getCurrentMountainTimestamp();
    const { data, error } = await supabase
      .from('BankTransaction')
      .update({
        reconciled: true,
        reconciliation_id: reconciliationId,
        cleared: true,
        updated_date: updatedTimestamp
      })
      .in('id', transactionIds)
      .select('id');

    if (error) {
      console.error('Failed to update reconciled transactions:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const processedCount = Array.isArray(data) ? data.length : 0;

    if (processedCount !== transactionIds.length) {
      return new Response(JSON.stringify({
        success: false,
        message: `Only reconciled ${processedCount} of ${transactionIds.length} transactions`,
        count: processedCount
      }), { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully reconciled ${processedCount} transactions`,
      count: processedCount
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error in batchReconcileTransactions:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
