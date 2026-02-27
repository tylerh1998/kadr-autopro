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
      
      // Fetch ALL supplier lines in reasonable batches to avoid timeouts
      // Note: The SDK's filter method limit parameter defaults to fetching all matching records
      // We set a reasonable limit to avoid timeout issues
      const allSupplierLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter(
          { supplier_id: supplierId }, 
          'invoice_date', 
          5000 // Reasonable limit that should handle most suppliers
      );

      const updatesToProcess = [];
      
      // Create a map for fast lookup by ID to track in-memory updates
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

      // Helper to add update
      const addUpdate = (line) => {
          const existingUpdateIndex = updatesToProcess.findIndex(u => u.id === line.id);
          const newPaid = Math.round(line._paid * 100) / 100;
          if (existingUpdateIndex >= 0) {
             updatesToProcess[existingUpdateIndex].paid_amount = newPaid;
          } else {
             updatesToProcess.push({
               id: line.id,
               paid_amount: newPaid
             });
          }
      };

      // Process invoices sequentially using in-memory data
      for (const appliedDetail of appliedInvoices) {
        
        if (appliedDetail.invoice_number === 'On Account') {
           let remainingPayment = parseFloat(appliedDetail.amount_applied) || 0;
           
           if (Math.abs(remainingPayment) <= 0.005) continue;

           // Handling Payment (Positive)
           if (remainingPayment > 0) {
               // 1. CREDIT NETTING: Identify and use available credits
               // Sort by date to use oldest credits first? Or just any? Standard is usually oldest.
               const allLines = Array.from(lineMap.values()).sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));
               const openCredits = allLines.filter(line => (line._total - line._paid) < -0.005);
               
               for (const credit of openCredits) {
                   const creditBalance = credit._total - credit._paid; // Negative value (e.g. -100)
                   // "Use" the credit: Make it fully paid (bring balance to 0)
                   // New Paid = Old Paid + Credit Balance.
                   // Example: Total -100. Paid 0. Balance -100. New Paid -100. Balance 0.
                   // Change in Paid: -100.
                   
                   credit._paid += creditBalance; 
                   addUpdate(credit);
                   
                   // Increase our buying power by the magnitude of the credit
                   remainingPayment += Math.abs(creditBalance);
               }

               // 2. PAY INVOICES: Apply the (boosted) remaining payment to positive invoices
               const openInvoices = allLines.filter(line => (line._total - line._paid) > 0.005);
               
               for (const line of openInvoices) {
                  if (remainingPayment <= 0.005) break;

                  const due = line._total - line._paid;
                  const payAmount = Math.min(remainingPayment, due);
                  
                  line._paid += payAmount;
                  addUpdate(line);
                  
                  remainingPayment -= payAmount;
               }

           } else {
               // Handling Refund (Negative Payment)
               // Apply negative amount to credits (making them more unpaid? No, making them PAID, i.e. 0 balance)
               // If I receive a refund of -$100.
               // It should clear a Credit Note of -$100.
               // Credit: Total -100. Paid 0. Bal -100.
               // Apply -100.
               // Max(-100, -100) = -100.
               // Paid += -100. New Paid -100. Bal 0.
               // Correct.
               
               const openCredits = Array.from(lineMap.values())
                 .filter(line => (line._total - line._paid) < -0.005)
                 .sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));

               for (const line of openCredits) {
                   if (remainingPayment >= -0.005) break; // remainingPayment is negative
                   
                   const balance = line._total - line._paid; // e.g. -100
                   // We want to apply 'remainingPayment' (e.g. -500).
                   // We can apply at most 'balance' (magnitude).
                   // Actually we want to Match.
                   // Apply max(remainingPayment, balance) ?
                   // max(-500, -100) = -100. Correct.
                   
                   const amountToApply = Math.max(remainingPayment, balance);
                   
                   line._paid += amountToApply;
                   addUpdate(line);
                   
                   remainingPayment -= amountToApply;
               }
           }

        } else {
          // Specific Invoice
          const targetInvoiceNumber = String(appliedDetail.invoice_number);
          let remainingForInvoice = parseFloat(appliedDetail.amount_applied) || 0;

          // Find lines for this invoice in our memory cache
          let invoiceLines = Array.from(lineMap.values())
             .filter(line => String(line.invoice_number) === targetInvoiceNumber);

          // Fallback: If not found in the 3000 loaded lines, we must fetch them specifically
          if (invoiceLines.length === 0) {
             const fetchedLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
               supplier_id: supplierId,
               invoice_number: targetInvoiceNumber
             }, undefined, 100);
             
             if (fetchedLines && fetchedLines.length > 0) {
               // Add to map
               fetchedLines.forEach(line => {
                  const processed = { 
                    ...line, 
                    _purchase: parseFloat(line.purchase_amount) || 0,
                    _gst: parseFloat(line.gst_amount) || 0,
                    _paid: parseFloat(line.paid_amount) || 0,
                    _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
                  };
                  lineMap.set(line.id, processed);
                  invoiceLines.push(processed);
               });
             }
          }

          if (invoiceLines.length > 0) {
             // Sort by due amount ascending (negatives/credits first) to ensure clean application
             invoiceLines.sort((a, b) => (a._total - a._paid) - (b._total - b._paid));

             for (const line of invoiceLines) {
                if (remainingForInvoice <= 0.005) break;

                const due = line._total - line._paid;
                // Note: We process negatives even if due <= 0, because due can be negative for credits
                // But the check "due <= 0.005" excludes them? 
                // Wait, if due is -20, it is <= 0.005. It would continue.
                // We MUST process negative dues if we want to apply credits!
                // BUT, if we are paying a positive amount...
                // If due is -20. min(80, -20) = -20.
                // We want to apply -20.
                // So we should NOT skip negative dues.
                // We should only skip if due is 0 (fully paid).
                if (Math.abs(due) <= 0.005) continue; 

                const payAmount = Math.min(remainingForInvoice, due);
                
                // Update in-memory
                line._paid += payAmount;

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
                
                remainingForInvoice -= payAmount;
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