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

    const { appliedStartDate, appliedEndDate } = await req.json();

    if (!appliedStartDate || !appliedEndDate) {
      return res({ success: false, error: 'Missing required parameters: appliedStartDate, appliedEndDate' });
    }

    const { data: transactions, error: rpcError } = await supabase.rpc('get_gl_journal_data', {
      start_date: appliedStartDate,
      end_date: appliedEndDate
    });

    if (rpcError) {
      throw new Error(`Failed to run get_gl_journal_data: ${rpcError.message}`);
    }

    return res({
      success: true,
      transactions: transactions || []
    });
  } catch (error: any) {
    console.error('Error in getGLJournalData:', error);
    return res({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});
