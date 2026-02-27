import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { supplierId, paymentAmount } = await req.json();

    if (!supplierId) {
      return Response.json({ success: false, error: 'Supplier ID is required' }, { status: 400 });
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount)) {
      return Response.json({ success: false, error: 'Invalid payment amount' }, { status: 400 });
    }

    // Fetch open invoices/credits
    // We fetch a large batch of recent invoices. 
    // Reduced limit to 2500 to prevent memory/timeout issues.
    const allLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter(
      { supplier_id: supplierId },
      'invoice_date',
      2500
    );

    // Filter for open items and calculate balances
    const openItems = allLines.map(line => {
      const purchase = parseFloat(line.purchase_amount) || 0;
      const gst = parseFloat(line.gst_amount) || 0;
      const paid = parseFloat(line.paid_amount) || 0;
      const total = purchase + gst;
      const balance = total - paid;
      
      return {
        ...line,
        _total: total,
        _paid: paid,
        _balance: balance
      };
    }).filter(item => Math.abs(item._balance) > 0.005);

    // Separate credits and debits
    // Sort oldest first
    openItems.sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));

    const appliedInvoices = [];
    let remainingAmount = amount;

    if (amount > 0) {
      // PAYMENT Logic
      
      // 1. Credit Netting: Apply available credits (negative balance)
      const openCredits = openItems.filter(item => item._balance < -0.005);
      
      for (const credit of openCredits) {
        // A credit has a negative balance (e.g. -100).
        // To "use" it, we apply a negative amount to it (e.g. -100), effectively "paying" it?
        // Wait, if I have a Credit of -100. It means I am OWED 100.
        // If I apply it to a debt of 100.
        // The debt gets +100 applied.
        // The credit gets +100 applied? Or -100?
        // Logic from previous implementation:
        // const creditBalance = credit._total - credit._paid; (e.g. -100)
        // credit._paid += creditBalance; (-100 += -100 => -200? NO)
        // If purchase is -100, paid is 0. Balance is -100.
        // If I "pay" it (clear it), paid should become -100?
        // If paid is -100, Balance = -100 - (-100) = 0. YES.
        // So we apply the negative balance to the credit line.
        
        const creditBalance = credit._balance; // negative amount
        
        // We apply this amount to the credit line itself
        appliedInvoices.push({
          invoice_number: credit.invoice_number,
          amount_applied: creditBalance,
          id: credit.id,
          original_balance: credit._balance,
          invoice_date: credit.invoice_date
        });
        
        // And we add the absolute value to our "funds available to pay debits"
        // e.g. Payment $1000 + Credit $100 = $1100 available to pay invoices
        remainingAmount += Math.abs(creditBalance);
      }

      // 2. Pay Invoices: Apply remaining funds to debits (positive balance)
      const openInvoices = openItems.filter(item => item._balance > 0.005);
      
      for (const invoice of openInvoices) {
        if (remainingAmount <= 0.005) break;
        
        const amountToPay = Math.min(remainingAmount, invoice._balance);
        
        appliedInvoices.push({
          invoice_number: invoice.invoice_number,
          amount_applied: amountToPay,
          id: invoice.id,
          original_balance: invoice._balance,
          invoice_date: invoice.invoice_date
        });
        
        remainingAmount -= amountToPay;
      }

    } else {
      // REFUND Logic (Negative Payment)
      // We are receiving money back (or reducing what we owe?)
      // Usually "Refund" means the supplier pays us back for a credit.
      // So we apply the negative payment to the credits.
      
      const openCredits = openItems.filter(item => item._balance < -0.005);
      
      for (const credit of openCredits) {
        if (remainingAmount >= -0.005) break;
        
        // credit._balance is e.g. -100. remainingAmount is e.g. -50.
        // We want to apply max(-50, -100) = -50.
        // If remaining is -200. max(-200, -100) = -100.
        
        const amountToApply = Math.max(remainingAmount, credit._balance);
        
        appliedInvoices.push({
          invoice_number: credit.invoice_number,
          amount_applied: amountToApply,
          id: credit.id,
          original_balance: credit._balance,
          invoice_date: credit.invoice_date
        });
        
        remainingAmount -= amountToApply;
      }
    }

    // If there is still remaining amount, it means overpayment (or unapplied refund)
    // We explicitly return this as "On Account" remainder
    let unappliedAmount = 0;
    if (Math.abs(remainingAmount) > 0.005) {
      unappliedAmount = remainingAmount;
    }

    return Response.json({
      success: true,
      breakdown: {
        appliedInvoices,
        unappliedAmount,
        totalApplied: appliedInvoices.reduce((sum, item) => sum + item.amount_applied, 0)
      }
    });

  } catch (error) {
    console.error('Error in calculateSupplierPaymentBreakdown:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});