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
    const processUpdatesInBatches = async (items, updateFn, batchSize = 100) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(updateFn));
      }
    };

    // Update SupplierInvoiceLine paid amounts
    if (appliedInvoices && Array.isArray(appliedInvoices)) {
      
      const updatesToProcess = [];
      const lineMap = new Map();

      // Helper to process raw line into map format
      const processLineIntoMap = (line) => {
        return { 
            ...line, 
            _purchase: parseFloat(line.purchase_amount) || 0,
            _gst: parseFloat(line.gst_amount) || 0,
            _paid: parseFloat(line.paid_amount) || 0,
            _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
        };
      };

      // Identify specific invoices to fetch
      // Note: If "On Account" was used, the frontend/pre-calculation step should have resolved it to specific invoices.
      // We expect appliedInvoices to contain specific invoice references now, or "On Account" ONLY if it's purely unapplied/credit.
      // If "On Account" logic is present with specific invoice lines in the payload, we treat "On Account" as "Unapplied".
      
      const specificInvoices = appliedInvoices
        .filter(ai => ai.invoice_number !== 'On Account')
        .map(ai => String(ai.invoice_number));
      
      const uniqueSpecificInvoices = [...new Set(specificInvoices)];
      
      // Fetch specific invoices in parallel batches
      if (uniqueSpecificInvoices.length > 0) {
        const BATCH_SIZE = 10;
        for (let i = 0; i < uniqueSpecificInvoices.length; i += BATCH_SIZE) {
            const batch = uniqueSpecificInvoices.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (invNum) => {
                try {
                    const lines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
                        supplier_id: supplierId,
                        invoice_number: invNum
                    });
                    if (lines) {
                        lines.forEach(line => {
                             if (!lineMap.has(line.id)) {
                                 lineMap.set(line.id, processLineIntoMap(line));
                             }
                        });
                    }
                } catch (e) {
                    console.error(`Error fetching invoice ${invNum}:`, e);
                }
            }));
        }
      }

      // Process invoices sequentially using in-memory data
      for (const appliedDetail of appliedInvoices) {
        
        if (appliedDetail.invoice_number === 'On Account') {
           // Skip "On Account" for line item updates as it implies unapplied amount
           continue;
        } else {
          // Specific Invoice
          const targetInvoiceNumber = String(appliedDetail.invoice_number);
          
          // amount_applied can be positive (paying an invoice) or negative (using a credit)
          let remainingForInvoice = parseFloat(appliedDetail.amount_applied) || 0;
          
          if (Math.abs(remainingForInvoice) <= 0.005) continue;

          // Find lines for this invoice in our memory cache
          let invoiceLines = Array.from(lineMap.values())
             .filter(line => String(line.invoice_number) === targetInvoiceNumber);

          // If no lines found, fallback fetch (safety net)
          if (invoiceLines.length === 0) {
             const fetchedLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
               supplier_id: supplierId,
               invoice_number: targetInvoiceNumber
             });
             
             if (fetchedLines && fetchedLines.length > 0) {
               fetchedLines.forEach(line => {
                  const processed = processLineIntoMap(line);
                  lineMap.set(line.id, processed);
                  invoiceLines.push(processed);
               });
             }
          }

          if (invoiceLines.length > 0) {
             // Sort by due amount ascending to handle multiple lines per invoice
             // But usually we just want to apply to the lines.
             // If we are applying positive amount, target lines with positive due.
             // If we are applying negative amount, target lines with negative due (credits).
             
             invoiceLines.sort((a, b) => (a._total - a._paid) - (b._total - b._paid));

             for (const line of invoiceLines) {
                if (Math.abs(remainingForInvoice) <= 0.005) break;

                const due = line._total - line._paid;
                
                // If applying positive payment
                if (remainingForInvoice > 0) {
                    // Only apply to positive due (unless we want to overpay a negative line? No.)
                    if (due <= 0.005) continue;
                    
                    const payAmount = Math.min(remainingForInvoice, due);
                    
                    line._paid += payAmount;
                    remainingForInvoice -= payAmount;
                } 
                // If applying negative payment (credit usage)
                else {
                    // Only apply to negative due (credits)
                    if (due >= -0.005) continue;
                    
                    // e.g. remaining: -50. due: -100. max(-50, -100) = -50.
                    // e.g. remaining: -200. due: -100. max(-200, -100) = -100.
                    const payAmount = Math.max(remainingForInvoice, due);
                    
                    line._paid += payAmount;
                    remainingForInvoice -= payAmount;
                }

                // Add to updates list
                const existingUpdateIndex = updatesToProcess.findIndex(u => u.id === line.id);
                if (existingUpdateIndex >= 0) {
                   updatesToProcess[existingUpdateIndex].paid_amount = Math.round(line._paid * 100) / 100;
                } else {
                   updatesToProcess.push({
                     id: line.id,
                     paid_amount: Math.round(line._paid * 100) / 100
                   });
                }
             }
          }
        }
      }

      // Execute all updates in batches
      // Batch size 100 for efficiency
      if (updatesToProcess.length > 0) {
        await processUpdatesInBatches(updatesToProcess, (update) => 
          base44.asServiceRole.entities.SupplierInvoiceLine.update(update.id, {
            paid_amount: update.paid_amount
          })
        , 100);
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