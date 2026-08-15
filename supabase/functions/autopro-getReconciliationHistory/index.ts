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
    const body = await req.json();
    const { bankAccountId } = body;

    if (!bankAccountId) {
      return new Response(JSON.stringify({ error: 'bankAccountId is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    console.log('Fetching reconciliation history for bank account:', bankAccountId);

    const { data: bankAccount, error: bankAccountError } = await supabase
      .from('BankAccount')
      .select('id, name, bank_name, account_type')
      .eq('id', bankAccountId)
      .maybeSingle();

    if (bankAccountError) {
      console.error('Error fetching bank account:', bankAccountError);
      return new Response(JSON.stringify({ error: bankAccountError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!bankAccount) {
      return new Response(JSON.stringify({ error: 'Bank account not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: reconciliations, error: reconciliationsError } = await supabase
      .from('BankReconciliation')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('reconciliation_date', { ascending: false });

    if (reconciliationsError) {
      console.error('Error fetching reconciliations:', reconciliationsError);
      return new Response(JSON.stringify({ error: reconciliationsError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const allReconciliations = reconciliations || [];
    console.log('Found', allReconciliations.length, 'reconciliation records for bank account:', bankAccount.name);

    const formattedRecords = allReconciliations.map((recon) => {
      const difference = parseFloat(recon.difference) || 0;

      return {
        id: recon.id,
        reconciliation_id: recon.reconciliation_id,
        reconciliation_date: recon.reconciliation_date,
        period_start_date: recon.period_start_date,
        period_end_date: recon.period_end_date,
        statement_ending_balance: parseFloat(recon.statement_ending_balance) || 0,
        cleared_balance_at_reconciliation: parseFloat(recon.cleared_balance_at_reconciliation) || 0,
        difference,
        starting_balance: parseFloat(recon.starting_balance) || 0,
        total_credits: parseFloat(recon.total_credits) || 0,
        total_debits: parseFloat(recon.total_debits) || 0,
        reconciled_by: recon.created_by || recon.reconciled_by || 'Unknown',
        is_balanced: Math.abs(difference) < 0.01
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        bank_account: {
          id: bankAccount.id,
          name: bankAccount.name,
          bank_name: bankAccount.bank_name,
          account_type: bankAccount.account_type
        },
        reconciliations: formattedRecords,
        total_count: formattedRecords.length
      }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error fetching reconciliation history:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Failed to fetch reconciliation history'
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
