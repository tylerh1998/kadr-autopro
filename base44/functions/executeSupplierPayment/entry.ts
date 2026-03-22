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

    const paymentAmount = parseFloat(totalPaymentAmount) || 0;

    if (!paymentId) {
       return Response.json({ success: false, error: 'No paymentId provided' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get("Supabase_project_url");
    const supabaseSecret = Deno.env.get("Supabase_Secret_Key");
    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    // Update status to processing
    await base44.asServiceRole.entities.SupplierPayment.update(paymentId, { status: 'processing' });

    const startedAt = Date.now();

    const supplierFetchStartedAt = Date.now();
    const { data: supplier } = await supabase.from('Supplier').select('*').eq('id', supplierId).single();
    console.info('[executeSupplierPayment] supplier_fetch_ms:', Date.now() - supplierFetchStartedAt);

    const allocationStartedAt = Date.now();
    if (appliedInvoices && Array.isArray(appliedInvoices) && appliedInvoices.length > 0) {
      let allocationMode = 'rpc_v2';
      let allocationUpdatedCount = 0;

      const { data: allocationResult, error: allocationError } = await supabase.rpc('apply_supplier_invoice_line_paid_updates', {
        p_supplier_id: supplierId,
        p_applied_invoices: appliedInvoices
      });

      if (allocationError) {
        const isMissingNewSignature = allocationError.message?.includes('Could not find the function public.apply_supplier_invoice_line_paid_updates(p_applied_invoices, p_supplier_id)');

        if (!isMissingNewSignature) {
          throw new Error(`SupplierInvoiceLine allocation RPC failed: ${allocationError.message}`);
        }

        allocationMode = 'rpc_v1_compat';

        const updatesToProcess = [];
        const lineMap = new Map();
        const processLineIntoMap = (line) => ({
          ...line,
          _purchase: parseFloat(line.purchase_amount) || 0,
          _gst: parseFloat(line.gst_amount) || 0,
          _paid: parseFloat(line.paid_amount) || 0,
          _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
        });

        const { data: allLinesArr, error: linesError } = await supabase.from('SupplierInvoiceLine')
          .select('*')
          .eq('supplier_id', supplierId)
          .order('invoice_date', { ascending: false });

        if (linesError) {
          throw new Error(`SupplierInvoiceLine compatibility fetch failed: ${linesError.message}`);
        }

        if (allLinesArr) {
          allLinesArr.forEach((line) => {
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
            const candidates = Array.from(lineMap.values()).filter((line) =>
              String(line.invoice_number) === String(appliedDetail.invoice_number)
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
                } else {
                  if (due >= -0.005) continue;
                  const payAmount = Math.max(remainingForInvoice, due);
                  line._paid += payAmount;
                  remainingForInvoice -= payAmount;
                }

                const existingUpdateIndex = updatesToProcess.findIndex((update) => update.id === line.id);
                if (existingUpdateIndex >= 0) {
                  updatesToProcess[existingUpdateIndex].paid_amount = Math.round(line._paid * 100) / 100;
                } else {
                  updatesToProcess.push({
                    id: line.id,
                    paid_amount: Math.round(line._paid * 100) / 100
                  });
                }
              }

              continue;
            }
          }

          if (targetLine) {
            targetLine._paid += remainingForInvoice;
            const existingUpdateIndex = updatesToProcess.findIndex((update) => update.id === targetLine.id);
            if (existingUpdateIndex >= 0) {
              updatesToProcess[existingUpdateIndex].paid_amount = Math.round(targetLine._paid * 100) / 100;
            } else {
              updatesToProcess.push({
                id: targetLine.id,
                paid_amount: Math.round(targetLine._paid * 100) / 100
              });
            }
          }
        }

        if (updatesToProcess.length > 0) {
          const updatedAt = new Date().toISOString();
          const rpcUpdates = updatesToProcess.map((update) => ({
            id: update.id,
            paid_amount: update.paid_amount,
            updated_date: updatedAt
          }));

          const { data: legacyResult, error: legacyError } = await supabase.rpc('apply_supplier_invoice_line_paid_updates', {
            p_updates: rpcUpdates
          });

          if (legacyError) {
            throw new Error(`SupplierInvoiceLine compatibility RPC failed: ${legacyError.message}`);
          }

          allocationUpdatedCount = legacyResult?.updated_count ?? rpcUpdates.length;
        }
      } else {
        allocationUpdatedCount = allocationResult?.updated_count ?? 0;
      }

      console.info('[executeSupplierPayment] allocation_mode:', allocationMode);
      console.info('[executeSupplierPayment] allocation_updated_count:', allocationUpdatedCount);
    }
    console.info('[executeSupplierPayment] allocation_ms:', Date.now() - allocationStartedAt);

    const bankGlStartedAt = Date.now();
    // Process transactions
    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const selectedBank = await base44.asServiceRole.entities.BankAccount.get(fromAccountId);
      if (selectedBank) {
        await base44.asServiceRole.entities.BankTransaction.create({
          bank_account_id: selectedBank.id,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}${chequeNumber ? ` - Cheque #${chequeNumber}` : ''}`,
          debit_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
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
          debit_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: selectedBank.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          credit_amount: paymentAmount > 0 ? paymentAmount : 0,
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
          charge_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
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
          debit_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.entities.GLTransaction.create({
          account_number: selectedLOC.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          credit_amount: paymentAmount > 0 ? paymentAmount : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });
      }
    }

    console.info('[executeSupplierPayment] bank_gl_ms:', Date.now() - bankGlStartedAt);

    // Update status to completed
    await base44.asServiceRole.entities.SupplierPayment.update(paymentId, { status: 'completed' });
    console.info('[executeSupplierPayment] total_ms:', Date.now() - startedAt);

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