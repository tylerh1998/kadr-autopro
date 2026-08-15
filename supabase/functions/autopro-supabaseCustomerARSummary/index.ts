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
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { searchTerm = '', asOfDate } = await req.json();
    const cutoffDateString = asOfDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });

    const { data, error } = await supabase.rpc('get_customer_ar_summary', {
      p_as_of_date: cutoffDateString,
      p_search_term: searchTerm || null
    });

    if (error) throw error;

    const arSummaryData = (data || []).map((row) => ({
      customer: {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        org_name: row.org_name,
        phone: row.phone,
        email: row.email
      },
      balance_0_30: Number(row.balance_0_30) || 0,
      balance_31_60: Number(row.balance_31_60) || 0,
      balance_60_plus: Number(row.balance_60_plus) || 0,
      total_balance: Number(row.total_balance) || 0
    }));

    return new Response(JSON.stringify({ success: true, arSummaryData }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
