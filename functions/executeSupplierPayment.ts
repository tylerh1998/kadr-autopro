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

    const supabaseUrl = Deno.env.get("Supabase_project_url");
    const supabaseSecret = Deno.env.get("Supabase_Secret_Key");
    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    // Update status to processing
    await supabase.from('SupplierPayment').update({ status: 'processing' }).eq('id', paymentId);

    // Get supplier for name
    const { data: supplier } = await supabase.from('Supplier').select('*').eq('id', supplierId).single();
    
    // Helper for batched updates
    // Helper for batched updates with robust rate limiting and exponential backoff
    const processUpdatesInBatches = async (items, updateFn, batchSize = 1) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        // Delay to ensure we stay under ~100 ops/minute (approx 600ms per op)
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 600));
        
        let retries = 3;
        while (retries > 0) {
            try {
                await Promise.all(batch.map(updateFn));
                break; // Success
            } catch (err) {
                if (err?.status === 429 || err?.message?.includes('Rate limit')) {
                     retries--;
                     const waitTime = (4 - retries) * 3000; // 3s, 6s, 9s
                     console.warn(`Rate limit hit at index ${i}. Retries left: ${retries}. Waiting ${waitTime}ms...`);
                     await new Promise(resolve => setTimeout(resolve, waitTime));
                     if (retries === 0) throw err;
                } else {
                    throw err;
                }
            }
        }
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

      const { data: allLinesArr } = await supabase.from('SupplierInvoiceLine')
         .select('*')
         .eq('supplier_id', supplierId)
         .order('invoice_date', { ascending: false });

      if (allLinesArr) {
         allLinesArr.forEach(line => {
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
        await processUpdatesInBatches(updatesToProcess, async (update) => {
          const { error } = await supabase.from('SupplierInvoiceLine').update({
            updated_date: new Date().toISOString(),
            paid_amount: update.paid_amount
          }).eq('id', update.id);
          if (error) throw error;
        }, 10); // increased batch size since supabase is faster
      }
    }

    // Process transactions
    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const { data: selectedBank } = await supabase.from('BankAccount').select('*').eq('id', fromAccountId).single();
      if (selectedBank) {
        await supabase.from('BankTransaction').insert({
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
          await supabase.from('BankAccount').update({
            next_cheque_number: parseInt(chequeNumber) + 1
          }).eq('id', selectedBank.id);
        }

        await supabase.from('GLTransaction').insert({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await supabase.from('GLTransaction').insert({
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
      const { data: selectedLOC } = await supabase.from('LinesOfCredit').select('*').eq('id', fromAccountId).single();
      if (selectedLOC) {
        await supabase.from('LinesOfCreditTransaction').insert({
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

        await supabase.from('GLTransaction').insert({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: totalPaymentAmount > 0 ? totalPaymentAmount : 0,
          credit_amount: totalPaymentAmount < 0 ? Math.abs(totalPaymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await supabase.from('GLTransaction').insert({
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
    await supabase.from('SupplierPayment').update({ status: 'completed' }).eq('id', paymentId);

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error in executeSupplierPayment:', error);
    if (paymentId) {
        try {
            const supabaseUrl = Deno.env.get("Supabase_project_url");
            const supabaseSecret = Deno.env.get("Supabase_Secret_Key");
            const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
            const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
            
            await supabase.from('SupplierPayment').update({ 
                status: 'failed',
                error_message: error.message || 'Unknown error during background processing'
            }).eq('id', paymentId);
        } catch (e) {
            console.error('Failed to update payment status to failed:', e);
        }
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});