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

    const { startDate, endDate } = await req.json();

    const { data: accounts, error: rpcError } = await supabase.rpc('get_general_ledger_data', {
      start_date: startDate,
      end_date: endDate
    });

    if (rpcError) {
      throw new Error(`Failed to fetch General Ledger data from Supabase RPC: ${rpcError.message}`);
    }

    // Map RPC data to ensure numbers are correctly typed (Supabase returns numeric/bigint as strings depending on client config)
    const formattedAccounts = (accounts || []).map((acc: any) => ({
      ...acc,
      own_balance: Number(acc.own_balance) || 0,
      transactionCount: Number(acc.transactionCount) || 0
    }));

    return res({
      success: true,
      accounts: formattedAccounts
    });
  } catch (error: any) {
    console.error('Error generating general ledger data:', error);
    return res({
      success: false,
      error: error.message || 'Failed to generate general ledger data'
    });
  }
});
