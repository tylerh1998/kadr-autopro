import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { lineOfCreditId, paymentAmount } = await req.json();

    if (!lineOfCreditId) {
      return Response.json({ success: false, error: 'lineOfCreditId is required' }, { status: 400 });
    }

    const amountValue = parseFloat(paymentAmount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      return Response.json({ success: false, error: 'paymentAmount must be greater than 0' }, { status: 400 });
    }

    const transactions = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter(
      { line_of_credit_id: lineOfCreditId },
      'transaction_date',
      2000
    );

    const outstandingTransactions = transactions
      .filter((tx) => {
        if (tx.is_reversed === true) return false;
        if (tx.source_type === 'payment_made') return false;

        if ((tx.charge_amount || 0) > 0) {
          return (tx.payment_amount || 0) < (tx.charge_amount || 0);
        }

        if ((tx.credit_amount || 0) > 0) {
          return (tx.payment_amount || 0) > -(tx.credit_amount || 0);
        }

        return false;
      })
      .sort((a, b) => {
        const dateCompare = String(a.transaction_date).localeCompare(String(b.transaction_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.id).localeCompare(String(b.id));
      });

    let remainingAmount = amountValue;
    const appliedCharges = [];

    for (const tx of outstandingTransactions) {
      if (remainingAmount <= 0.00001) break;

      if ((tx.credit_amount || 0) > 0) {
        const remainingCredit = (tx.credit_amount || 0) + (tx.payment_amount || 0);
        if (remainingCredit > 0.00001) {
          appliedCharges.push({
            id: tx.id,
            amount: -remainingCredit
          });
          remainingAmount -= remainingCredit;
        }
        continue;
      }

      if ((tx.charge_amount || 0) > 0) {
        const remainingCharge = (tx.charge_amount || 0) - (tx.payment_amount || 0);
        if (remainingCharge > 0.00001) {
          const amountToApply = Math.min(remainingAmount, remainingCharge);
          appliedCharges.push({
            id: tx.id,
            amount: amountToApply
          });
          remainingAmount -= amountToApply;
        }
      }
    }

    const totalApplied = appliedCharges.reduce((sum, item) => sum + item.amount, 0);

    return Response.json({
      success: true,
      breakdown: {
        appliedCharges,
        totalApplied,
        unappliedAmount: remainingAmount,
      }
    });
  } catch (error) {
    console.error('Error calculating LOC payment breakdown:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});