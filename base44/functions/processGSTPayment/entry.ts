import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseKey = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ success: false, error: 'Supabase configuration is missing' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const auditUser = user?.full_name || user?.email || 'Unknown User';
    const getAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user?.id,
      updated_by: auditUser
    });

    // Parse request body
    const { gst_return_id, payment_date, bank_account_id } = await req.json();
    
    if (!gst_return_id || !payment_date || !bank_account_id) {
      return Response.json({ 
        error: 'Missing required fields: gst_return_id, payment_date, and bank_account_id' 
      }, { status: 400 });
    }

    // Get the GST return record
    const gstReturnRecords = await base44.asServiceRole.entities.GSTReturn.filter({ id: gst_return_id });
    const gstReturn = gstReturnRecords && gstReturnRecords.length > 0 ? gstReturnRecords[0] : null;
    
    if (!gstReturn) {
      return Response.json({ error: 'GST return not found' }, { status: 404 });
    }

    if (gstReturn.status !== 'posted') {
      return Response.json({ 
        error: 'GST return must be in "posted" status to mark as paid' 
      }, { status: 400 });
    }

    // Get system settings for GST payable/receivable account
    const settingsRecords = await base44.asServiceRole.entities.SystemSettings.list();
    const settings = settingsRecords && settingsRecords.length > 0 ? settingsRecords[0] : null;
    
    if (!settings) {
      return Response.json({ 
        error: 'System settings not found. Please configure GST account numbers.' 
      }, { status: 400 });
    }

    const gstPayableReceivableAccount = settings.gst_payable_receivable_account_number || '2001';

    // Get bank account details
    const { data: bankAccountRecords, error: bankAccountError } = await supabase
      .from('BankAccount')
      .select('*')
      .eq('id', bank_account_id)
      .limit(1);

    if (bankAccountError) {
      throw new Error(`Failed to fetch bank account: ${bankAccountError.message}`);
    }

    const bankAccount = bankAccountRecords && bankAccountRecords.length > 0 ? bankAccountRecords[0] : null;
    
    if (!bankAccount || !bankAccount.gl_account) {
      return Response.json({ error: 'Bank account not found or GL account not configured' }, { status: 404 });
    }

    const netGstDue = gstReturn.net_gst_due;
    const absAmount = Math.abs(netGstDue);

    // Create GL transactions
    const glTransactions = [];

    if (netGstDue > 0) {
      // We OWE money to the government (payment)
      // Debit GST Payable/Receivable (2001) - reduces the liability
      glTransactions.push({
        account_number: gstPayableReceivableAccount,
        transaction_date: payment_date,
        description: `GST Payment for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: absAmount,
        credit_amount: 0,
        source_type: 'payment',
        source_id: gstReturn.id
      });

      // Credit Bank Account - money leaving
      glTransactions.push({
        account_number: bankAccount.gl_account,
        transaction_date: payment_date,
        description: `GST Payment for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: 0,
        credit_amount: absAmount,
        source_type: 'payment',
        source_id: gstReturn.id
      });

    } else if (netGstDue < 0) {
      // We are OWED money (refund)
      // Debit Bank Account - money entering
      glTransactions.push({
        account_number: bankAccount.gl_account,
        transaction_date: payment_date,
        description: `GST Refund for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: absAmount,
        credit_amount: 0,
        source_type: 'payment',
        source_id: gstReturn.id
      });

      // Credit GST Payable/Receivable (2001) - reduces the receivable
      glTransactions.push({
        account_number: gstPayableReceivableAccount,
        transaction_date: payment_date,
        description: `GST Refund for period ${gstReturn.period_start_date} to ${gstReturn.period_end_date}`,
        reference: `GST-${gstReturn.id}`,
        debit_amount: 0,
        credit_amount: absAmount,
        source_type: 'payment',
        source_id: gstReturn.id
      });
    }

    // Add UUIDs and Audit Fields to GL Transactions
    const glTransactionsToInsert = glTransactions.map(tx => ({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...getAuditFields(),
        ...tx
    }));

    // Create all GL transactions
    const { error: glInsertError } = await supabase.from('GLTransaction').insert(glTransactionsToInsert);
    if (glInsertError) {
      throw new Error(`Failed to insert GL transactions: ${glInsertError.message}`);
    }

    // Create Bank Transaction
    const bankTx = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      ...getAuditFields(),
      bank_account_id: bankAccount.id,
      transaction_date: payment_date,
      description: netGstDue > 0 
        ? `GST Payment to CRA (${gstReturn.period_start_date} - ${gstReturn.period_end_date})` 
        : `GST Refund from CRA (${gstReturn.period_start_date} - ${gstReturn.period_end_date})`,
      reference: `GST-${gstReturn.id}`,
      credit_amount: netGstDue < 0 ? absAmount : 0, // Refund = Money In
      debit_amount: netGstDue > 0 ? absAmount : 0,  // Payment = Money Out
      cleared: false,
      reconciled: false,
      source_type: 'payment',
      source_id: gstReturn.id,
      gl_account: gstPayableReceivableAccount
    };
    
    const { error: bankTxError } = await supabase.from('BankTransaction').insert(bankTx);
    if (bankTxError) {
      throw new Error(`Failed to insert Bank transaction: ${bankTxError.message}`);
    }

    // Update the GST return to "paid" status
    await base44.asServiceRole.entities.GSTReturn.update(gstReturn.id, {
      status: 'paid',
      paid_date: payment_date,
      paid_by: user.email,
      bank_account_id: bank_account_id
    });

    return Response.json({
      success: true,
      message: 'GST payment processed successfully',
      gl_transactions_created: glTransactions.length
    });

  } catch (error) {
    console.error('Error processing GST payment:', error);
    return Response.json({ 
      error: error.message || 'Failed to process GST payment' 
    }, { status: 500 });
  }
});