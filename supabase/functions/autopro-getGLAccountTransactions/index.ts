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

    const { accountNumber, appliedStartDate, appliedEndDate } = await req.json();

    if (!accountNumber || !appliedStartDate || !appliedEndDate) {
      return res({ success: false, error: 'Missing required parameters: accountNumber, appliedStartDate, appliedEndDate' });
    }

    const { data: accounts, error: accountsError } = await supabase
      .from('ChartOfAccount')
      .select('account_number')
      .eq('account_number', accountNumber);

    if (accountsError) throw new Error(accountsError.message);
    if (!accounts || accounts.length === 0) {
      return res({ success: false, error: 'Account not found' });
    }

    const { data: rows, error: rpcError } = await supabase.rpc('get_gl_account_transactions', {
      p_account_number: String(accountNumber),
      p_start_date: appliedStartDate,
      p_end_date: appliedEndDate
    });

    if (rpcError) {
      throw new Error(`Failed to run get_gl_account_transactions: ${rpcError.message}`);
    }

    const allRows = rows || [];
    const preRangeRows = allRows.filter((r: any) => !r.in_range);
    const inRangeRows = allRows.filter((r: any) => r.in_range);

    const openingBalance = preRangeRows.length > 0 ? Number(preRangeRows[preRangeRows.length - 1].balance) : 0;

    const processedTransactions = inRangeRows
      .map((r: any) => {
        const { in_range, ...tx } = r;
        return tx;
      })
      .reverse();

    return res({
      success: true,
      transactions: processedTransactions,
      openingBalance,
      totalCount: processedTransactions.length
    });
  } catch (error: any) {
    console.error('Error in getGLAccountTransactions:', error);
    return res({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});
