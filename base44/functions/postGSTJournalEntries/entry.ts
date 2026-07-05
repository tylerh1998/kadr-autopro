import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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

    const {
      gst_return_id,
      gst_collected,
      gst_paid,
      period_end_date
    } = await req.json();

    if (!gst_return_id) {
      return Response.json({ error: 'Missing gst_return_id' }, { status: 400 });
    }

    // Fetch system settings for account numbers
    const settingsList = await base44.asServiceRole.entities.SystemSettings.list();
    const settings = settingsList?.[0] || {};
    
    const gstCollectedAccount = settings.gst_collected_account_number || '2002';
    const gstPaidAccount = settings.gst_paid_account_number || '2003';
    const gstPayableAccount = settings.gst_payable_receivable_account_number || '2001';

    // Use period end date as transaction date, or today (Mountain Time) if missing
    // en-CA format is YYYY-MM-DD
    const txDate = period_end_date || new Date().toLocaleDateString("en-CA", {timeZone: "America/Denver"});
    const sourceId = gst_return_id;
    const sourceType = 'supplier_invoice'; 
    const description = `GST Return Posting (Consolidation)`;

    const glTransactions = [];

    // 1. Move GST Collected (2002) to Payable (2001)
    // Account 2002 usually has Credit balance (gst_collected > 0). We need to Debit it to clear.
    if (gst_collected && gst_collected !== 0) {
        const amount = Math.abs(gst_collected);
        if (gst_collected > 0) {
            // Normal case (Credit Balance): Debit 2002, Credit 2001
            glTransactions.push({
                account_number: gstCollectedAccount,
                transaction_date: txDate,
                description: `${description} - Clear Collected`,
                reference: `GST-${gst_return_id}`,
                debit_amount: amount,
                credit_amount: 0,
                source_type: sourceType,
                source_id: sourceId
            });
            glTransactions.push({
                account_number: gstPayableAccount,
                transaction_date: txDate,
                description: `${description} - Transfer Collected`,
                reference: `GST-${gst_return_id}`,
                debit_amount: 0,
                credit_amount: amount,
                source_type: sourceType,
                source_id: sourceId
            });
        } else {
            // Negative collection (Debit Balance): Credit 2002, Debit 2001
            glTransactions.push({
                account_number: gstCollectedAccount,
                transaction_date: txDate,
                description: `${description} - Clear Collected`,
                reference: `GST-${gst_return_id}`,
                debit_amount: 0,
                credit_amount: amount,
                source_type: sourceType,
                source_id: sourceId
            });
            glTransactions.push({
                account_number: gstPayableAccount,
                transaction_date: txDate,
                description: `${description} - Transfer Collected`,
                reference: `GST-${gst_return_id}`,
                debit_amount: amount,
                credit_amount: 0,
                source_type: sourceType,
                source_id: sourceId
            });
        }
    }

    // 2. Move GST Paid (2003) to Payable (2001)
    // Account 2003 usually has Debit balance (gst_paid > 0). We need to Credit it to clear.
    if (gst_paid && gst_paid !== 0) {
        const amount = Math.abs(gst_paid);
        if (gst_paid > 0) {
            // Normal case (Debit Balance): Credit 2003, Debit 2001
            glTransactions.push({
                account_number: gstPaidAccount,
                transaction_date: txDate,
                description: `${description} - Clear Paid`,
                reference: `GST-${gst_return_id}`,
                debit_amount: 0,
                credit_amount: amount,
                source_type: sourceType,
                source_id: sourceId
            });
            glTransactions.push({
                account_number: gstPayableAccount,
                transaction_date: txDate,
                description: `${description} - Transfer Paid`,
                reference: `GST-${gst_return_id}`,
                debit_amount: amount,
                credit_amount: 0,
                source_type: sourceType,
                source_id: sourceId
            });
        } else {
            // Negative paid (Credit Balance): Debit 2003, Credit 2001
            glTransactions.push({
                account_number: gstPaidAccount,
                transaction_date: txDate,
                description: `${description} - Clear Paid`,
                reference: `GST-${gst_return_id}`,
                debit_amount: amount,
                credit_amount: 0,
                source_type: sourceType,
                source_id: sourceId
            });
            glTransactions.push({
                account_number: gstPayableAccount,
                transaction_date: txDate,
                description: `${description} - Transfer Paid`,
                reference: `GST-${gst_return_id}`,
                debit_amount: 0,
                credit_amount: amount,
                source_type: sourceType,
                source_id: sourceId
            });
        }
    }

    // Add UUIDs and Audit Fields
    const glTransactionsToInsert = glTransactions.map(tx => ({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...getAuditFields(),
        ...tx
    }));

    // Create transactions
    const { error: insertError } = await supabase.from('GLTransaction').insert(glTransactionsToInsert);
    if (insertError) {
      throw new Error(`Failed to insert GL transactions: ${insertError.message}`);
    }

    return Response.json({ success: true, count: glTransactions.length });

  } catch (error) {
    console.error('Error posting GST journal entries:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});