import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { bankAccountId } = body;

    if (!bankAccountId) {
      return Response.json({ 
        error: 'bankAccountId is required' 
      }, { status: 400 });
    }

    console.log('Fetching reconciliation history for bank account:', bankAccountId);

    // Fetch the bank account to verify it exists and get its name
    const bankAccount = await base44.entities.BankAccount.get(bankAccountId);
    if (!bankAccount) {
      return Response.json({ 
        error: 'Bank account not found' 
      }, { status: 404 });
    }

    // Fetch all reconciliation records for this bank account
    const allReconciliations = await base44.entities.BankReconciliation.filter(
      { bank_account_id: bankAccountId },
      '-reconciliation_date' // Sort by reconciliation_date descending (newest first)
    );

    console.log('Found', allReconciliations.length, 'reconciliation records for bank account:', bankAccount.name);

    // Format the data for frontend consumption
    const formattedRecords = allReconciliations.map(recon => ({
      id: recon.id,
      reconciliation_id: recon.reconciliation_id,
      reconciliation_date: recon.reconciliation_date,
      period_start_date: recon.period_start_date,
      period_end_date: recon.period_end_date,
      statement_ending_balance: recon.statement_ending_balance || 0,
      cleared_balance_at_reconciliation: recon.cleared_balance_at_reconciliation || 0,
      difference: recon.difference || 0,
      starting_balance: recon.starting_balance || 0,
      total_credits: recon.total_credits || 0,
      total_debits: recon.total_debits || 0,
      reconciled_by: recon.created_by || recon.reconciled_by || 'Unknown',
      is_balanced: Math.abs(recon.difference || 0) < 0.01
    }));

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