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

    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const {
      asOfDate = null,
      startDate = '1900-01-01',
      endDate = asOfDate,
      supplierIdFilter = null,
    } = payload;

    const { data, error } = await supabase.rpc('get_ap_summary_data', {
      _as_of_date: asOfDate,
      _start_date: startDate,
      _end_date: endDate,
      _supplier_id_filter: supplierIdFilter,
    });

    if (error) {
      throw new Error(`Failed to fetch AP summary: ${error.message}`);
    }

    const filteredData = (data || []).filter((row: any) => Math.abs(Number(row.current_balance || 0)) > 0.01);

    return res({
      success: true,
      data: filteredData,
    });
  } catch (error: any) {
    console.error('Error in getAPSummary:', error);
    return res({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});
