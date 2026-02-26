import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request payload
    const {
      supplierId,
      paymentDate,
      paymentMethod,
      fromAccountId,
      totalPaymentAmount,
      chequeNumber,
      notes,
      appliedInvoices
    } = await req.json();

    // Validate required fields
    if (!supplierId || !paymentDate || !paymentMethod || !totalPaymentAmount) {
      return Response.json({ 
        success: false, 
        error: 'Missing required fields: supplierId, paymentDate, paymentMethod, totalPaymentAmount' 
      }, { status: 400 });
    }

    if (paymentMethod !== 'Cash' && !fromAccountId) {
      return Response.json({ 
        success: false, 
        error: 'fromAccountId is required for non-cash payments' 
      }, { status: 400 });
    }

    const paymentAmount = parseFloat(totalPaymentAmount);
    if (isNaN(paymentAmount)) {
      return Response.json({ success: false, error: 'Invalid payment amount' }, { status: 400 });
    }

    // Get supplier
    const supplier = await base44.asServiceRole.entities.Supplier.get(supplierId);
    if (!supplier) {
      return Response.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    // Create SupplierPayment record
    const paymentRecord = {
      supplier_id: supplierId,
      invoice_number: JSON.stringify(appliedInvoices || []),
      payment_date: paymentDate,
      amount: paymentAmount,
      payment_method: paymentMethod,
      cheque_number: chequeNumber || null,
      source: paymentMethod === 'Cash' ? 'cash' : fromAccountId,
      notes: notes || null
    };

    const createdPayment = await base44.asServiceRole.entities.SupplierPayment.create(paymentRecord);

    // Helper for batched updates
    const processUpdatesInBatches = async (items, updateFn, batchSize = 25) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(updateFn));
      }
    };

    // Update SupplierInvoiceLine paid amounts
    if (appliedInvoices && Array.isArray(appliedInvoices)) {
      // Process invoices sequentially to prevent database connection exhaustion
      for (const appliedDetail of appliedInvoices) {
        
        if (appliedDetail.invoice_number === 'On Account') {
           let remainingPayment = parseFloat(appliedDetail.amount_applied) || 0;
           if (remainingPayment <= 0.005) continue;

           // Fetch lines for supplier, sorted by oldest first
           // Limit to 2000 to handle large batches
           const allSupplierLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
              supplier_id: supplierId
           }, 'invoice_date', 2000);

           // Filter for unpaid/partially paid lines
           const unpaidLines = allSupplierLines.filter(line => {
              const total = (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0);
              const paid = parseFloat(line.paid_amount) || 0;
              return (total - paid) > 0.005; // Check if outstanding amount > ~0
           });

           // Prepare updates first
           const updatesToProcess = [];
           for (const line of unpaidLines) {
              if (remainingPayment <= 0.005) break;

              const total = (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0);
              const currentPaid = parseFloat(line.paid_amount) || 0;
              const due = total - currentPaid;
              
              const payAmount = Math.min(remainingPayment, due);
              const newPaid = currentPaid + payAmount;
              
              updatesToProcess.push({
                id: line.id,
                paid_amount: Math.round(newPaid * 100) / 100
              });
              
              remainingPayment -= payAmount;
           }

           // Execute in batches
           if (updatesToProcess.length > 0) {
             await processUpdatesInBatches(updatesToProcess, (update) => 
               base44.asServiceRole.entities.SupplierInvoiceLine.update(update.id, {
                 paid_amount: update.paid_amount
               })
             );
           }

        } else {
          // Specific Invoice: Sequential Fill Logic
          const targetInvoiceNumber = String(appliedDetail.invoice_number);
          let remainingForInvoice = parseFloat(appliedDetail.amount_applied) || 0;

          const invoiceLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
            supplier_id: supplierId,
            invoice_number: targetInvoiceNumber
          }, undefined, 1000);

          if (invoiceLines && invoiceLines.length > 0) {
             const updatesToProcess = [];
             
             for (const line of invoiceLines) {
                if (remainingForInvoice <= 0.005) break;

                const p = parseFloat(line.purchase_amount) || 0;
                const g = parseFloat(line.gst_amount) || 0;
                const lineTotal = p + g;
                const currentPaid = parseFloat(line.paid_amount) || 0;
                const due = lineTotal - currentPaid;

                if (due <= 0.005) continue; // Already paid

                const payAmount = Math.min(remainingForInvoice, due);
                const newPaid = currentPaid + payAmount;

                updatesToProcess.push({
                  id: line.id,
                  paid_amount: Math.round(newPaid * 100) / 100
                });
                
                remainingForInvoice -= payAmount;
             }

             // Execute in batches
             if (updatesToProcess.length > 0) {
               await processUpdatesInBatches(updatesToProcess, (update) => 
                 base44.asServiceRole.entities.SupplierInvoiceLine.update(update.id, {
                   paid_amount: update.paid_amount
                 })
               );
             }
          }
        }
      }
    }

    const glTransactionIds = [];

    // Process based on payment method
    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const selectedBank = await base44.asServiceRole.entities.BankAccount.get(fromAccountId);
      if (!selectedBank) {
        return Response.json({ success: false, error: 'Bank account not found' }, { status: 404 });
      }

      // Create BankTransaction
      await base44.asServiceRole.entities.BankTransaction.create({
        bank_account_id: selectedBank.id,
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}${chequeNumber ? ` - Cheque #${chequeNumber}` : ''}`,
        debit_amount: paymentAmount > 0 ? paymentAmount : 0,
        credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        source_type: 'payment',
        source_id: createdPayment.id
      });

      // Recalculate bank balance
      await base44.asServiceRole.functions.invoke('calculateBankBalances', {
        bankAccountId: selectedBank.id
      });

      // Update next cheque number if applicable
      if (chequeNumber) {
        await base44.asServiceRole.entities.BankAccount.update(selectedBank.id, {
          next_cheque_number: parseInt(chequeNumber) + 1
        });
      }

      // Create GL transactions for bank payment
      const glTx1 = await base44.asServiceRole.entities.GLTransaction.create({
        account_number: '2000',
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}`,
        debit_amount: paymentAmount > 0 ? paymentAmount : 0,
        credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        source_type: 'supplier_payment',
        source_id: createdPayment.id
      });
      glTransactionIds.push(glTx1.id);

      const glTx2 = await base44.asServiceRole.entities.GLTransaction.create({
        account_number: selectedBank.gl_account,
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}`,
        debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        credit_amount: paymentAmount > 0 ? paymentAmount : 0,
        source_type: 'supplier_payment',
        source_id: createdPayment.id
      });
      glTransactionIds.push(glTx2.id);

    } else if (paymentMethod === 'Line of Credit') {
      const selectedLOC = await base44.asServiceRole.entities.LinesOfCredit.get(fromAccountId);
      if (!selectedLOC) {
        return Response.json({ success: false, error: 'Line of credit not found' }, { status: 404 });
      }

      // Create LinesOfCreditTransaction
      // Positive payment = charge (draw from LOC to pay supplier)
      // Negative payment = credit (refund from supplier to LOC)
      await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
        line_of_credit_id: selectedLOC.id,
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}`,
        charge_amount: paymentAmount > 0 ? paymentAmount : 0,
        credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        payment_amount: 0,
        source_type: 'supplier_payment',
        source_id: createdPayment.id
      });

      // Recalculate LOC balance
      await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
        lineOfCreditId: selectedLOC.id
      });

      // Create GL transactions for LOC payment
      const glTx1 = await base44.asServiceRole.entities.GLTransaction.create({
        account_number: '2000',
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}`,
        debit_amount: paymentAmount > 0 ? paymentAmount : 0,
        credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        source_type: 'supplier_payment',
        source_id: createdPayment.id
      });
      glTransactionIds.push(glTx1.id);

      const glTx2 = await base44.asServiceRole.entities.GLTransaction.create({
        account_number: selectedLOC.gl_account,
        transaction_date: paymentDate,
        description: `Payment to ${supplier.name}`,
        debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
        credit_amount: paymentAmount > 0 ? paymentAmount : 0,
        source_type: 'supplier_payment',
        source_id: createdPayment.id
      });
      glTransactionIds.push(glTx2.id);
    }

    return Response.json({
      success: true,
      message: 'Payment processed successfully',
      payment_id: createdPayment.id,
      gl_transaction_ids: glTransactionIds
    });

  } catch (error) {
    console.error('Error in processSupplierPayment:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'An error occurred while processing the payment' 
    }, { status: 500 });
  }
});