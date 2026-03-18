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
      const { data: allocationResult, error: allocationError } = await supabase.rpc('apply_supplier_invoice_line_paid_updates', {
        p_supplier_id: supplierId,
        p_applied_invoices: appliedInvoices
      });

      if (allocationError) {
        throw new Error(`SupplierInvoiceLine allocation RPC failed: ${allocationError.message}`);
      }

      console.info('[executeSupplierPayment] allocation_updated_count:', allocationResult?.updated_count ?? 0);
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