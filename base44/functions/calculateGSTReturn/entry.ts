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

    // Parse request body
    const { period_start_date, period_end_date } = await req.json();
    
    if (!period_start_date || !period_end_date) {
      return Response.json({ 
        error: 'Missing required fields: period_start_date and period_end_date' 
      }, { status: 400 });
    }

    // Get system settings to retrieve GST account numbers
    const { data: settingsRecords, error: settingsError } = await supabase
      .from('SystemSettings')
      .select('*')
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }

    const settings = settingsRecords && settingsRecords.length > 0 ? settingsRecords[0] : null;
    
    if (!settings) {
      return Response.json({ 
        error: 'System settings not found. Please configure GST account numbers.' 
      }, { status: 400 });
    }

    const gstCollectedAccount = settings.gst_collected_account_number || '2002';
    const gstPaidAccount = settings.gst_paid_account_number || '2003';

    // Fetch GL transactions within date range with pagination
    const transactions = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    
    while(true) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error: fetchError } = await supabase
        .from('GLTransaction')
        .select('account_number, debit_amount, credit_amount')
        .gte('transaction_date', period_start_date)
        .lte('transaction_date', period_end_date)
        .range(from, to);

      if (fetchError) {
        throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
      }

      if (!batch || batch.length === 0) break;
      
      transactions.push(...batch);
      
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Calculate GST collected (credits to account 2002)
    const gstCollectedTransactions = transactions.filter(
      tx => tx.account_number === gstCollectedAccount
    );
    const gstCollected = gstCollectedTransactions.reduce(
      (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 
      0
    );

    // Calculate GST paid (debits to account 2003)
    const gstPaidTransactions = transactions.filter(
      tx => tx.account_number === gstPaidAccount
    );
    const gstPaid = gstPaidTransactions.reduce(
      (sum, tx) => sum + (tx.debit_amount || 0) - (tx.credit_amount || 0), 
      0
    );

    // Calculate net GST due (positive = owe, negative = refund)
    const netGstDue = gstCollected - gstPaid;

    // Calculate total sales and purchases (for reference)
    // Sales are typically revenue accounts (4000-4999), Purchases are expense accounts (5000-5999)
    const salesTransactions = transactions.filter(
      tx => tx.account_number >= '4000' && tx.account_number < '5000'
    );
    const totalSales = salesTransactions.reduce(
      (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 
      0
    );

    const purchaseTransactions = transactions.filter(
      tx => tx.account_number >= '5000' && tx.account_number < '7000'
    );
    const totalPurchases = purchaseTransactions.reduce(
      (sum, tx) => sum + (tx.debit_amount || 0) - (tx.credit_amount || 0), 
      0
    );

    return Response.json({
      period_start_date,
      period_end_date,
      gst_collected: Math.round(gstCollected * 100) / 100,
      gst_paid: Math.round(gstPaid * 100) / 100,
      net_gst_due: Math.round(netGstDue * 100) / 100,
      total_sales: Math.round(totalSales * 100) / 100,
      total_purchases: Math.round(totalPurchases * 100) / 100,
      gst_collected_account: gstCollectedAccount,
      gst_paid_account: gstPaidAccount
    });

  } catch (error) {
    console.error('Error calculating GST return:', error);
    return Response.json({ 
      error: error.message || 'Failed to calculate GST return' 
    }, { status: 500 });
  }
});