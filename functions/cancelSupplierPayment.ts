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
    const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({});
    const paymentDate = new Date(payment.payment_date);
    
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
            
            await base44.asServiceRole.entities.BankTransaction.delete(tx.id);
            linkedAccountId = tx.bank_account_id;
            linkedAccountType = 'bank';
        }

    } else if (payment.payment_method === 'Line of Credit') {
        const locTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
            source_id: payment.id,
            source_type: 'supplier_payment'
        });

        if (locTx && locTx.length > 0) {
            const tx = locTx[0];
            // If it was a charge (payment), payment_amount is 0.
            if (tx.payment_amount > 0) {
                return Response.json({ 
                    success: false, 
                    error: 'Cannot cancel payment: The line of credit transaction has payments applied to it.' 
                }, { status: 400 });
            }

            await base44.asServiceRole.entities.LinesOfCreditTransaction.delete(tx.id);
            linkedAccountId = tx.line_of_credit_id;
            linkedAccountType = 'loc';
        }
    }

    // 4. Un-apply Invoices (Optimized Batch Process)
    
    // Fetch ALL supplier lines efficiently
    const allSupplierLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
        supplier_id: payment.supplier_id
    }, 'invoice_date', 10000);

    // Build map for fast lookup and state tracking
    const lineMap = new Map();
    allSupplierLines.forEach(line => {
        lineMap.set(line.id, { 
            ...line, 
            _purchase: parseFloat(line.purchase_amount) || 0,
            _gst: parseFloat(line.gst_amount) || 0,
            _paid: parseFloat(line.paid_amount) || 0,
            _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
        });
    });

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
        } else if (payment.invoice_number === 'On Account') {
             appliedInvoices = [{ invoice_number: 'On Account', amount_applied: payment.amount }];
        }
    }

    const updatesToProcess = [];
    const addUpdate = (line) => {
        const existingIndex = updatesToProcess.findIndex(u => u.id === line.id);
        const newPaid = Math.round(line._paid * 100) / 100;
        if (existingIndex >= 0) {
            updatesToProcess[existingIndex].paid_amount = newPaid;
        } else {
            updatesToProcess.push({ id: line.id, paid_amount: newPaid });
        }
    };

    for (const appliedDetail of appliedInvoices) {
        if (appliedDetail.invoice_number === 'On Account') {
             // Handle On Account Reversal
             // LIFO logic: Unpay the newest invoices first to maintain "Oldest Paid" state
             let amountToReverse = parseFloat(appliedDetail.amount_applied) || 0;
             if (Math.abs(amountToReverse) <= 0.005) continue;

             const isPayment = amountToReverse > 0;
             
             // Sort Newest First (Descending Date)
             const candidateLines = Array.from(lineMap.values())
                .filter(line => isPayment ? line._paid > 0.005 : line._paid < -0.005)
                .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));
            
             for (const line of candidateLines) {
                 if (isPayment) {
                     if (amountToReverse <= 0.005) break;
                     // Reduce paid amount by up to the current paid amount (or remaining reversal)
                     const canReverse = Math.min(amountToReverse, line._paid);
                     
                     line._paid -= canReverse;
                     amountToReverse -= canReverse;
                     
                     addUpdate(line);
                 } else {
                     // Refund reversal (amountToReverse is negative)
                     // line._paid is negative
                     // We want to increase line._paid (reduce magnitude)
                     if (amountToReverse >= -0.005) break;
                     
                     const canReverse = Math.max(amountToReverse, line._paid); // e.g. max(-50, -100) = -50
                     
                     line._paid -= canReverse; // -100 - (-50) = -50
                     amountToReverse -= canReverse; // 0
                     
                     addUpdate(line);
                 }
             }

        } else {
             // Handle Specific Invoice Reversal
             const targetInvoiceNumber = String(appliedDetail.invoice_number);
             let amountToReverse = parseFloat(appliedDetail.amount_applied) || 0;

             // Find lines for this invoice
             let invoiceLines = Array.from(lineMap.values())
                 .filter(line => String(line.invoice_number) === targetInvoiceNumber);

             // Fallback fetch if not in map
             if (invoiceLines.length === 0) {
                 const fetched = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
                     supplier_id: payment.supplier_id,
                     invoice_number: targetInvoiceNumber
                 });
                 if (fetched && fetched.length > 0) {
                     fetched.forEach(l => {
                         const p = { 
                            ...l, 
                            _purchase: parseFloat(l.purchase_amount) || 0,
                            _gst: parseFloat(l.gst_amount) || 0,
                            _paid: parseFloat(l.paid_amount) || 0,
                            _total: (parseFloat(l.purchase_amount) || 0) + (parseFloat(l.gst_amount) || 0)
                         };
                         lineMap.set(l.id, p);
                         invoiceLines.push(p);
                     });
                 }
             }
             
             // Reverse amount from lines
             // We un-pay lines until amountToReverse is exhausted
             
             // Sort by paid amount ascending (negatives/credits first) to ensure clean reversal
             invoiceLines.sort((a, b) => a._paid - b._paid);

             for (const line of invoiceLines) {
                 if (Math.abs(amountToReverse) <= 0.005) break;
                 
                 const currentPaid = line._paid;
                 let canReverse = 0;
                 
                 if (amountToReverse > 0) { // Reversing payment
                     canReverse = Math.min(amountToReverse, currentPaid);
                 } else { // Reversing refund (negative)
                     canReverse = Math.max(amountToReverse, currentPaid);
                 }
                 
                 if (Math.abs(canReverse) > 0.005) {
                     line._paid -= canReverse;
                     amountToReverse -= canReverse;
                     addUpdate(line);
                 }
             }
        }
    }

    // Execute updates in batches
    if (updatesToProcess.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < updatesToProcess.length; i += batchSize) {
            const batch = updatesToProcess.slice(i, i + batchSize);
            await Promise.all(batch.map(u => 
                base44.asServiceRole.entities.SupplierInvoiceLine.update(u.id, {
                    paid_amount: u.paid_amount
                })
            ));
        }
    }

    // 5. Create Reversal GL Entries
    // We create reversals if we can identify the credit account
    
    let creditAccountId = null;
    
    if (linkedAccountType === 'bank' && linkedAccountId) {
        const bank = await base44.asServiceRole.entities.BankAccount.get(linkedAccountId);
        creditAccountId = bank.gl_account;
    } else if (linkedAccountType === 'loc' && linkedAccountId) {
        const loc = await base44.asServiceRole.entities.LinesOfCredit.get(linkedAccountId);
        creditAccountId = loc.gl_account;
    }

    if (creditAccountId) {
        // Reversal GL 1: Debit the Bank/LOC (Asset/Liability)
        // This reverses the original credit to Bank/LOC
        await base44.asServiceRole.entities.GLTransaction.create({
            account_number: creditAccountId,
            transaction_date: payment.payment_date,
            description: `REVERSAL: Payment to ${supplier ? supplier.name : 'Supplier'}`,
            debit_amount: payment.amount > 0 ? payment.amount : 0,
            credit_amount: payment.amount < 0 ? Math.abs(payment.amount) : 0,
            source_type: 'manual', 
            source_id: payment.id 
        });

        // Reversal GL 2: Credit AP (2000)
        // This reverses the original debit to AP
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