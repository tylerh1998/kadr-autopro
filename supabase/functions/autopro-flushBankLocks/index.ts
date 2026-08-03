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

    const { data: bankAccounts, error: bankAccountsError } = await supabase
      .from('BankAccount')
      .select('id, locked_by_user, locked_timestamp');

    if (bankAccountsError) {
      throw new Error(bankAccountsError.message);
    }

    let flushedCount = 0;

    for (const account of bankAccounts || []) {
      if (account.locked_by_user || account.locked_timestamp) {
        const { error: updateError } = await supabase
          .from('BankAccount')
          .update({
            locked_by_user: null,
            locked_timestamp: null
          })
          .eq('id', account.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        flushedCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Flushed locks on ${flushedCount} bank account(s)`,
      flushedCount
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error in flushBankLocks:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
