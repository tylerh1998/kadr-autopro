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
        // Add small delay between batches to reduce load
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 100));
        await Promise.all(batch.map(updateFn));
      }
    };

    // Update SupplierInvoiceLine paid amounts
    if (appliedInvoices && Array.isArray(appliedInvoices)) {
      const updatesToProcess = [];

      // STRATEGY: Fetch all supplier lines (limit 5000) for efficiency.
      // This avoids individual fetches for each invoice, which causes timeouts.
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

      // Fetch all recent lines for this supplier
      const allLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter(
         { supplier_id: supplierId }, 
         'invoice_date', 
         5000 
      );

      if (allLines) {
         allLines.forEach(line => {
             lineMap.set(line.id, processLineIntoMap(line));
         });
      }

      // Process invoices
      for (const appliedDetail of appliedInvoices) {
        if (appliedDetail.invoice_number === 'On Account') continue;

        let remainingForInvoice = parseFloat(appliedDetail.amount_applied) || 0;
        if (Math.abs(remainingForInvoice) <= 0.005) continue;

        // Find the line to update
        let targetLine = null;

        // 1. Try by ID first (fastest and most reliable)
        if (appliedDetail.id && lineMap.has(appliedDetail.id)) {
            targetLine = lineMap.get(appliedDetail.id);
        }

        // 2. If no ID or not found by ID, try searching by invoice number in map
        if (!targetLine) {
            // This is a fallback and slower search, but still in-memory
            const candidates = Array.from(lineMap.values()).filter(l => 
                String(l.invoice_number) === String(appliedDetail.invoice_number)
            );
            
            // If multiple lines exist for same invoice number (rare but possible), pick the best candidate
            // For now, let's take the first open one or just the first one
            // Ideally we should process ALL lines for that invoice number if ID wasn't specific
            
            if (candidates.length > 0) {
                 // Sort candidates by due amount to be consistent
                 candidates.sort((a, b) => (a._total - a._paid) - (b._total - b._paid));
                 
                 // Apply to candidates logic
                 for (const line of candidates) {
                    if (Math.abs(remainingForInvoice) <= 0.005) break;
                    
                    const due = line._total - line._paid;
                    
                    // Application logic
                    if (remainingForInvoice > 0) {
                        if (due <= 0.005) continue;
                        const payAmount = Math.min(remainingForInvoice, due);
                        
                        line._paid += payAmount;
                        remainingForInvoice -= payAmount;
                        
                        // Queue update
                        const existingUpdateIndex = updatesToProcess.findIndex(u => u.id === line.id);
                        if (existingUpdateIndex >= 0) {
                           updatesToProcess[existingUpdateIndex].paid_amount = Math.round(line._paid * 100) / 100;
                        } else {
                           updatesToProcess.push({
                             id: line.id,
                             paid_amount: Math.round(line._paid * 100) / 100
                           });
                        }
                    } else {
                        if (due >= -0.005) continue;
                        const payAmount = Math.max(remainingForInvoice, due);
                        
                        line._paid += payAmount;
                        remainingForInvoice -= payAmount;
                        
                        // Queue update
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
                 continue; // Done with this appliedDetail
            }
        }

        // 3. If we found a specific target line by ID, apply to it
        if (targetLine) {
             const line = targetLine;
             const due = line._total - line._paid;
             
             // Simple application to this specific line
             // We assume the amount_applied is correct for this line from calculation
             // But we add it to current _paid
             
             line._paid += remainingForInvoice;
             
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

      // Execute updates
      // Increased batch size to 20 for better throughput
      if (updatesToProcess.length > 0) {
        await processUpdatesInBatches(updatesToProcess, (update) => 
          base44.asServiceRole.entities.SupplierInvoiceLine.update(update.id, {
            paid_amount: update.paid_amount
          })
        , 20);
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