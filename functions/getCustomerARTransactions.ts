import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId, dateFrom, dateTo, searchTerm } = await req.json();

    if (!customerId) {
      return Response.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    // Fetch all data for this customer
    const [allPayments, allAdjustments, allWorkOrders] = await Promise.all([
      base44.entities.CustomerPayments.filter({ customer_id: customerId }),
      base44.entities.CustomerARAdjustment.filter({ customer_id: customerId }),
      base44.entities.WorkOrder.filter({ customer_id: customerId })
    ]);

    const transactions = [];

    // Add 'On Account' charges
    allPayments
      .filter(payment => payment && payment.payment_method === 'on_account')
      .forEach(payment => {
        const amount = payment.amount || 0;
        const arPaid = payment.ar_paid || 0;
        
        const workOrder = allWorkOrders.find(wo => wo && wo.id === payment.work_order_id);
        const description = workOrder?.description || payment.notes || `Invoice ${payment.invoice_number || ''}`;
        
        transactions.push({
          date: payment.payment_date || new Date().toISOString(),
          type: 'Invoice',
          description: description,
          reference: workOrder?.inv_number || payment.invoice_number || workOrder?.ro_number || '',
          amount: amount,
          payment: arPaid,
          balance: amount - arPaid,
          source: 'on_account',
          sourceId: payment.id || 'unknown',
          workOrderId: workOrder?.id || null,
          ar_pmt: payment.ar_pmt || false,
          payment_method: payment.payment_method || '',
          lankar_invoice: payment.lankar_invoice || null
        });
      });

    // Add actual AR payments
    allPayments
      .filter(payment => payment && payment.ar_pmt === true && payment.payment_method !== 'on_account')
      .forEach(payment => {
        const workOrder = allWorkOrders.find(wo => wo && wo.id === payment.work_order_id);
        const description = workOrder?.description || payment.notes || `${(payment.payment_method || 'unknown').replace('_', ' ').toUpperCase()} Payment`;

        transactions.push({
          date: payment.payment_date || new Date().toISOString(),
          type: 'Payment',
          description: description,
          reference: payment.reference || '',
          amount: 0,
          payment: payment.amount || 0,
          balance: 0,
          source: 'payment',
          sourceId: payment.id || 'unknown',
          ar_pmt: true,
          originalPaymentRecord: payment,
          payment_method: payment.payment_method || ''
        });
      });

    // Add adjustments (overpayment adjustments show as available credit)
    allAdjustments.forEach(adj => {
      if (!adj) return;
      
      const adjAmount = adj.amount || 0;
      const arPaid = adj.ar_paid || 0;
      const isCharge = adjAmount > 0;
      
      const workOrder = allWorkOrders.find(wo => wo && wo.id === adj.work_order_id);
      const description = workOrder?.description || adj.description || 'Adjustment';

      transactions.push({
        date: adj.adjustment_date || new Date().toISOString(),
        type: isCharge ? 'Charge' : 'Credit',
        description: description,
        reference: adj.reference || '',
        amount: isCharge ? adjAmount : 0,
        payment: isCharge ? arPaid : Math.abs(adjAmount),
        balance: adj.overpayment ? adjAmount : (isCharge ? (adjAmount - arPaid) : adjAmount),
        source: 'adjustment',
        sourceId: adj.id || 'unknown',
        ar_pmt: false,
        payment_method: ''
      });
    });

    // Sort by date (oldest first)
    transactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      return dateA - dateB;
    });

    // Calculate all-time balance (before any filters)
    const transactionsTabOnly = transactions.filter(t => t.ar_pmt !== true);
    const allTimeBalance = transactionsTabOnly.reduce((total, t) => total + (t.balance || 0), 0);

    // Calculate Opening Balance and Apply date filters
    let filtered = transactions;
    let openingBalance = 0;

    if (dateFrom || dateTo) {
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);

      const toDate = dateTo ? new Date(dateTo) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);
      
      if (fromDate) {
        openingBalance = transactionsTabOnly
          .filter(t => new Date(t.date) < fromDate)
          .reduce((total, t) => total + (t.balance || 0), 0);
      }

      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.date);
        return (!fromDate || transactionDate >= fromDate) && (!toDate || transactionDate <= toDate);
      });
    }

    // Apply search filter
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const referenceMatch = (t.reference || '').toLowerCase().includes(searchLower);
        const descriptionMatch = (t.description || '').toLowerCase().includes(searchLower);
        const amountMatch = (t.amount || 0).toFixed(2).includes(searchLower) || 
                           (t.payment || 0).toFixed(2).includes(searchLower) ||
                           (t.balance || 0).toFixed(2).includes(searchLower);
        return referenceMatch || descriptionMatch || amountMatch;
      });
    }

    // Split into tabs
    const transactionsTab = filtered.filter(t => t.ar_pmt !== true);
    const paymentsTab = filtered.filter(t => t.ar_pmt === true);

    return Response.json({
      success: true,
      allTimeBalance,
      transactionsTab,
      paymentsTab
    });

  } catch (error) {
    console.error('Error in getCustomerARTransactions:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});