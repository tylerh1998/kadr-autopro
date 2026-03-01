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

    // Sort oldest first (both credits and debits mixed)
    openItems.sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));

    const appliedInvoices = [];
    let remainingAmount = amount;

    // Iterate sequentially through sorted items
    for (const item of openItems) {
      if (Math.abs(remainingAmount) <= 0.005) break;

      let amountToApply = 0;

      if (amount > 0) {
        // Positive Payment Mode (We are paying supplier)
        if (item._balance > 0.005) {
          // Invoice (Positive Balance): Pay it down
          amountToApply = Math.min(remainingAmount, item._balance);
        } else if (item._balance < -0.005) {
          // Credit (Negative Balance): Settle it
          // Applying a negative amount (the balance) "pays off" the credit.
          // This effectively increases our remaining amount available for other invoices.
          // e.g. Rem: 100. Credit: -50. Apply: -50. Rem: 100 - (-50) = 150.
          amountToApply = item._balance;
        }
      } else {
        // Negative Payment Mode (Refund / Reversal)
        if (item._balance < -0.005) {
          // Credit (Negative Balance): Reduce credit (move closer to 0)
          // e.g. Rem: -50. Credit: -100. Apply: -50. Rem: 0.
          amountToApply = Math.max(remainingAmount, item._balance);
        } else if (item._balance > 0.005) {
          // Invoice (Positive Balance): Reverse payment / Increase debt
          // We can only reverse up to what was paid? Or just apply negative?
          // Applying negative to positive balance increases the balance.
          // We limit reversal to the 'paid' amount to avoid creating arbitrary debt beyond original value?
          // But user said "reduce what you owe", which we interpreted as "reduce what you paid".
          // Let's assume we can unpay up to the amount paid.
          const paid = item._paid || 0;
          if (paid > 0.005) {
             amountToApply = Math.max(remainingAmount, -paid);
          }
        }
      }

      if (Math.abs(amountToApply) > 0.005) {
        appliedInvoices.push({
          invoice_number: item.invoice_number,
          amount_applied: amountToApply,
          id: item.id,
          original_balance: item._balance,
          invoice_date: item.invoice_date
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