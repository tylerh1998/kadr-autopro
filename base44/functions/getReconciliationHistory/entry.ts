import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { bankAccountId } = body;

    if (!bankAccountId) {
      return Response.json({ error: 'bankAccountId is required' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    console.log('Fetching reconciliation history for bank account:', bankAccountId);

    const { data: bankAccount, error: bankAccountError } = await supabase
      .from('BankAccount')
      .select('id, name, bank_name, account_type')
      .eq('id', bankAccountId)
      .maybeSingle();

    if (bankAccountError) {
      console.error('Error fetching bank account:', bankAccountError);
      return Response.json({ error: bankAccountError.message }, { status: 500 });
    }

    if (!bankAccount) {
      return Response.json({ error: 'Bank account not found' }, { status: 404 });
    }

    const { data: reconciliations, error: reconciliationsError } = await supabase
      .from('BankReconciliation')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('reconciliation_date', { ascending: false });

    if (reconciliationsError) {
      console.error('Error fetching reconciliations:', reconciliationsError);
      return Response.json({ error: reconciliationsError.message }, { status: 500 });
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

    return Response.json({
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
    });
  } catch (error) {
    console.error('Error fetching reconciliation history:', error);
    return Response.json({
      error: error.message || 'Failed to fetch reconciliation history',
      details: error.stack
    }, { status: 500 });
  }
});