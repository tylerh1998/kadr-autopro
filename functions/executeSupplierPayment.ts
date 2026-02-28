import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let paymentId = null;

  try {
    // Parse request payload
    const payload = await req.json();
    paymentId = payload.paymentId;

    const {
      supplierId,
      paymentDate,
      paymentMethod,
      fromAccountId,
      totalPaymentAmount,
      chequeNumber,
      appliedInvoices
    } = payload;

    if (!paymentId) {
       return Response.json({ success: false, error: 'No paymentId provided' }, { status: 400 });
    }

    // Update status to processing
    await base44.asServiceRole.entities.SupplierPayment.update(paymentId, { status: 'processing' });

    // Get supplier for name
    const supplier = await base44.asServiceRole.entities.Supplier.get(supplierId);
    
    // Helper for batched updates
    const processUpdatesInBatches = async (items, updateFn, batchSize = 20) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 100));
        await Promise.all(batch.map(updateFn));
      }
    };

    // Update SupplierInvoiceLine paid amounts
    if (appliedInvoices && Array.isArray(appliedInvoices)) {
      const updatesToProcess = [];
      const lineMap = new Map();

      const processLineIntoMap = (line) => {
        return { 
            ...line, 
            _purchase: parseFloat(line.purchase_amount) || 0,
            _gst: parseFloat(line.gst_amount) || 0,
            _paid: parseFloat(line.paid_amount) || 0,
            _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
        };
      };

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

      for (const appliedDetail of appliedInvoices) {
        if (appliedDetail.invoice_number === 'On Account') continue;

        let remainingForInvoice = parseFloat(appliedDetail.amount_applied) || 0;
        if (Math.abs(remainingForInvoice) <= 0.005) continue;

        let targetLine = null;

        if (appliedDetail.id && lineMap.has(appliedDetail.id)) {
            targetLine = lineMap.get(appliedDetail.id);
        }

        if (!targetLine) {
            const candidates = Array.from(lineMap.values()).filter(l => 
                String(l.invoice_number) === String(appliedDetail.invoice_number)
            );
            
            if (candidates.length > 0) {
                 candidates.sort((a, b) => (a._total - a._paid) - (b._total - b._paid));
                 
                 for (const line of candidates) {
                    if (Math.abs(remainingForInvoice) <= 0.005) break;
                    
                    const due = line._total - line._paid;
                    
                    if (remainingForInvoice > 0) {
                        if (due <= 0.005) continue;
                        const payAmount = Math.min(remainingForInvoice, due);
                        
                        line._paid += payAmount;
                        remainingForInvoice -= payAmount;
                        
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
                 continue;
            }
        }

        if (targetLine) {
             const line = targetLine;
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

      if (updatesToProcess.length > 0) {
        await processUpdatesInBatches(updatesToProcess, (update) => 
          base44.asServiceRole.entities.SupplierInvoiceLine.update(update.id, {
            paid_amount: update.paid_amount
          })
        , 20);
      }
    }

    // Process transactions
    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const selectedBank = await base44.asServiceRole.entities.BankAccount.get(fromAccountId);
      if (selectedBank) {
        await base44.asServiceRole.entities.BankTransaction.create({
          bank_account_id: selectedBank.id,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}${chequeNumber ? ` - Cheque #${chequeNumber}` : ''}`,
          debit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          source_type: 'payment',
          source_id: paymentId
        });

        await base44.asServiceRole.functions.invoke('calculateBankBalances', {
          bankAccountId: selectedBank.id
        });

        if (chequeNumber) {
          await base44.asServiceRole.entities.BankAccount.update(selectedBank.id, {
            next_cheque_number: parseInt(chequeNumber) + 1
          });
        }

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: selectedBank.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          credit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });
      }
    } else if (paymentMethod === 'Line of Credit') {
      const selectedLOC = await base44.asServiceRole.entities.LinesOfCredit.get(fromAccountId);
      if (selectedLOC) {
        await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
          line_of_credit_id: selectedLOC.id,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          charge_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          payment_amount: 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
          lineOfCreditId: selectedLOC.id
        });

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: selectedLOC.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          credit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });
      }
    }

    // Update status to completed
    await base44.asServiceRole.entities.SupplierPayment.update(paymentId, { status: 'completed' });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error in executeSupplierPayment:', error);
    if (paymentId) {
        try {
            await base44.asServiceRole.entities.SupplierPayment.update(paymentId, { 
                status: 'failed',
                error_message: error.message || 'Unknown error during background processing'
            });
        } catch (e) {
            console.error('Failed to update payment status to failed:', e);
        }
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});