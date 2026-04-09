import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { period_start_date, period_end_date } = await req.json();
    
    if (!period_start_date || !period_end_date) {
      return Response.json({ 
        error: 'Missing required fields: period_start_date and period_end_date' 
      }, { status: 400 });
    }

    // Get system settings to retrieve GST account numbers
    const settingsRecords = await base44.asServiceRole.entities.SystemSettings.list();
    const settings = settingsRecords && settingsRecords.length > 0 ? settingsRecords[0] : null;
    
    if (!settings) {
      return Response.json({ 
        error: 'System settings not found. Please configure GST account numbers.' 
      }, { status: 400 });
    }

    const gstCollectedAccount = settings.gst_collected_account_number || '2002';
    const gstPaidAccount = settings.gst_paid_account_number || '2003';

    // Fetch all GL transactions with pagination to ensure we don't hit the limit
    const allTransactions = [];
    let skip = 0;
    while(true) {
      const batch = await base44.asServiceRole.entities.GLTransaction.filter({ }, undefined, 5000, skip);
      if (batch.length === 0) break;
      allTransactions.push(...batch);
      if (batch.length < 5000) break;
      skip += 5000;
    }
    
    // Filter transactions by date range
    const transactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.transaction_date);
      const startDate = new Date(period_start_date);
      const endDate = new Date(period_end_date);
      return txDate >= startDate && txDate <= endDate;
    });

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