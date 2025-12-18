import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return Response.json({ success: false, error: 'Payment ID is required' }, { status: 400 });
    }

    // 1. Get the payment record
    const payment = await base44.asServiceRole.entities.SupplierPayment.get(paymentId);
    if (!payment) {
      return Response.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    const supplier = await base44.asServiceRole.entities.Supplier.get(payment.supplier_id);

    // 2. Check Fiscal Period
    // FiscalPeriod entity usually has start_date, end_date, is_closed
    const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({});
    const paymentDate = new Date(payment.payment_date);
    
    // Find matching period
    const matchingPeriod = fiscalPeriods.find(p => {
        const start = new Date(p.start_date);
        const end = new Date(p.end_date);
        return paymentDate >= start && paymentDate <= end;
    });

    if (matchingPeriod && matchingPeriod.is_closed) {
        return Response.json({ success: false, error: 'Cannot cancel payment in a closed fiscal period.' }, { status: 400 });
    }

    // 3. Handle Method-Specific Logic (Bank/LOC)
    let linkedAccountId = null;
    let linkedAccountType = null;

    if (payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque') {
        // Find Bank Transaction
        const bankTx = await base44.asServiceRole.entities.BankTransaction.filter({
            source_id: payment.id,
            source_type: 'payment'
        });

        if (bankTx && bankTx.length > 0) {
            const tx = bankTx[0];
            if (tx.cleared || tx.reconciled) {
                return Response.json({ 
                    success: false, 
                    error: 'Cannot cancel payment: The associated bank transaction has been cleared or reconciled.' 
                }, { status: 400 });
            }
            
            // Delete Bank Transaction
            await base44.asServiceRole.entities.BankTransaction.delete(tx.id);
            linkedAccountId = tx.bank_account_id;
            linkedAccountType = 'bank';
        }

    } else if (payment.payment_method === 'Line of Credit') {
        // Find LOC Transaction
        const locTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
            source_id: payment.id,
            source_type: 'supplier_payment'
        });

        if (locTx && locTx.length > 0) {
            const tx = locTx[0];
            if (tx.payment_amount > 0) {
                return Response.json({ 
                    success: false, 
                    error: 'Cannot cancel payment: The line of credit transaction has payments applied to it.' 
                }, { status: 400 });
            }

            // Delete LOC Transaction
            await base44.asServiceRole.entities.LinesOfCreditTransaction.delete(tx.id);
            linkedAccountId = tx.line_of_credit_id;
            linkedAccountType = 'loc';
        }
    }

    // 4. Un-apply Invoices
    let appliedInvoices = [];
    try {
        const parsed = JSON.parse(payment.invoice_number);
        if (Array.isArray(parsed)) {
            appliedInvoices = parsed;
        } else if (typeof parsed === 'string' && parsed !== 'On Account') {
             appliedInvoices = [{ invoice_number: parsed, amount_applied: payment.amount }];
        }
    } catch (e) {
        if (payment.invoice_number && payment.invoice_number !== 'On Account') {
            appliedInvoices = [{ invoice_number: payment.invoice_number, amount_applied: payment.amount }];
        }
    }

    for (const appliedDetail of appliedInvoices) {
        if (appliedDetail.invoice_number === 'On Account') continue;

        const lines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
            supplier_id: payment.supplier_id,
            invoice_number: appliedDetail.invoice_number
        });

        if (lines && lines.length > 0) {
             const invoiceTotal = lines.reduce((sum, line) => {
                const lineTotal = (line.purchase_amount || 0) + (line.gst_amount || 0);
                return sum + lineTotal;
            }, 0);

            for (const line of lines) {
                const lineTotal = (line.purchase_amount || 0) + (line.gst_amount || 0);
                const proportion = invoiceTotal !== 0 ? lineTotal / invoiceTotal : 0;
                // Subtract the applied amount
                const reduceBy = appliedDetail.amount_applied * proportion;
                const newPaidAmount = Math.max(0, (line.paid_amount || 0) - reduceBy);

                await base44.asServiceRole.entities.SupplierInvoiceLine.update(line.id, {
                    paid_amount: Math.round(newPaidAmount * 100) / 100
                });
            }
        }
    }

    // 5. Create Reversal GL Entries
    // Original: Dr AP (2000), Cr Bank/LOC
    // Reversal: Dr Bank/LOC, Cr AP (2000)
    
    // We need to know which account was credited originally
    let creditAccountId = null; // The Bank/LOC GL Account
    
    if (linkedAccountType === 'bank' && linkedAccountId) {
        const bank = await base44.asServiceRole.entities.BankAccount.get(linkedAccountId);
        creditAccountId = bank.gl_account;
    } else if (linkedAccountType === 'loc' && linkedAccountId) {
        const loc = await base44.asServiceRole.entities.LinesOfCredit.get(linkedAccountId);
        creditAccountId = loc.gl_account;
    } else if (payment.payment_method === 'Cash') {
         // Assuming Cash account, usually 1010 or similar, but need to find default cash account
         // If no account found, maybe skip specific GL or use a placeholder?
         // processSupplierPayment uses `fromAccountId` for non-cash, but for cash it sets source='cash'.
         // It doesn't seem to create a specific Cash GL entry in processSupplierPayment?
         // Wait, looking at processSupplierPayment lines 97-196...
         // It ONLY handles Bank, Cheque, LOC. It does NOT seem to create GL entries for Cash payments in the original function?
         // Let's re-read processSupplierPayment lines 96-97.
         // Yes, lines 97 check for Bank/Cheque, line 149 checks for LOC.
         // If paymentMethod is 'Cash', it falls through and does NOT create GL entries or BankTx/LOCTx.
         // So for Cash, we just need to un-apply invoices and delete payment. No GL reversal needed if none was created.
         // However, standard accounting requires GL. If the original didn't create it, we shouldn't create a reversal.
         // So we only create reversal if we found a linked account.
    }

    if (creditAccountId) {
        // Reversal GL 1: Debit the Bank/LOC (Asset/Liability)
        // (If original was Cr Bank (Asset decrease), reversal is Dr Bank (Asset increase))
        // (If original was Cr LOC (Liability increase), reversal is Dr LOC (Liability decrease))
        // Wait. 
        // Bank Payment: Dr AP, Cr Bank (Asset goes down).
        // Reversal: Dr Bank (Asset goes up), Cr AP.
        
        await base44.asServiceRole.entities.GLTransaction.create({
            account_number: creditAccountId,
            transaction_date: payment.payment_date,
            description: `REVERSAL: Payment to ${supplier ? supplier.name : 'Supplier'}`,
            debit_amount: payment.amount > 0 ? payment.amount : 0,
            credit_amount: payment.amount < 0 ? Math.abs(payment.amount) : 0,
            source_type: 'manual', // or 'supplier_payment_reversal'
            source_id: payment.id // Keeping link to deleted payment might be tricky if we delete it. 
            // Maybe we shouldn't delete the payment until after.
        });

        // Reversal GL 2: Credit AP (2000)
        await base44.asServiceRole.entities.GLTransaction.create({
            account_number: '2000',
            transaction_date: payment.payment_date,
            description: `REVERSAL: Payment to ${supplier ? supplier.name : 'Supplier'}`,
            debit_amount: payment.amount < 0 ? Math.abs(payment.amount) : 0,
            credit_amount: payment.amount > 0 ? payment.amount : 0,
            source_type: 'manual',
            source_id: payment.id
        });
    }

    // 6. Delete the Payment Record
    await base44.asServiceRole.entities.SupplierPayment.delete(paymentId);

    // 7. Recalculate Balances
    if (linkedAccountType === 'bank' && linkedAccountId) {
        await base44.asServiceRole.functions.invoke('calculateBankBalances', { bankAccountId: linkedAccountId });
    } else if (linkedAccountType === 'loc' && linkedAccountId) {
        await base44.asServiceRole.functions.invoke('calculateLOCBalances', { lineOfCreditId: linkedAccountId });
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error in cancelSupplierPayment:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});