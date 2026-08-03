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
    const { bankAccountId } = await req.json();

    if (!bankAccountId) {
      return new Response(JSON.stringify({ success: false, error: 'bankAccountId is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: transactions, error: transactionsError } = await supabase
      .from('BankTransaction')
      .select('id, credit_amount, debit_amount, is_reversed')
      .eq('bank_account_id', bankAccountId)
      .order('transaction_date', { ascending: true });

    if (transactionsError) {
      throw new Error(transactionsError.message);
    }

    const balanceTransactions = (transactions || []).filter((transaction) => transaction.is_reversed !== true);

    let runningBalance = 0;
    for (const transaction of balanceTransactions) {
      const credit = Number(transaction.credit_amount) || 0;
      const debit = Number(transaction.debit_amount) || 0;
      runningBalance += credit - debit;
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('BankAccount')
      .update({
        current_balance: runningBalance,
        last_recalculated_date: now,
      })
      .eq('id', bankAccountId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log(`Balance recalculated for bank account ${bankAccountId}: ${runningBalance}`);

    return new Response(JSON.stringify({
      success: true,
      bankAccountId,
      finalBalance: runningBalance,
      last_recalculated_date: now,
      transactionCount: balanceTransactions.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error in calculateBankBalances:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
