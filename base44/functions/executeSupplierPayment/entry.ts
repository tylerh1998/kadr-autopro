import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let paymentId = null;

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    paymentId = payload.paymentId;

    if (!paymentId) {
      return Response.json({ success: false, error: 'No paymentId provided' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const startedAt = Date.now();

    const { data: payment, error: paymentError } = await supabase
      .from('SupplierPayment')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error('Supplier payment not found');
    }

    if (payment.status === 'completed') {
      return Response.json({ success: true, skipped: true });
    }

    await supabase
      .from('SupplierPayment')
      .update({ status: 'processing', error_message: null })
      .eq('id', paymentId);

    const supplierFetchStartedAt = Date.now();
    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    if (supplierError || !supplier) {
      throw new Error('Supplier not found');
    }

    console.info('[executeSupplierPayment] supplier_fetch_ms:', Date.now() - supplierFetchStartedAt);

    const paymentAmount = parseFloat(payment.amount) || 0;
    const paymentMethod = payment.payment_method;
    const fromAccountId = payment.source;
    const paymentDate = payment.payment_date;
    const chequeNumber = payment.cheque_number;

    const bankGlStartedAt = Date.now();

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
            next_cheque_number: parseInt(chequeNumber, 10) + 1
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

    await supabase
      .from('SupplierPayment')
      .update({ status: 'completed', error_message: null })
      .eq('id', paymentId);

    console.info('[executeSupplierPayment] total_ms:', Date.now() - startedAt);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error in executeSupplierPayment:', error);

    if (paymentId) {
      try {
        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (supabaseUrl && supabaseSecret) {
          const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
          await supabase
            .from('SupplierPayment')
            .update({
              status: 'failed',
              error_message: error.message || 'Unknown error during background processing'
            })
            .eq('id', paymentId);
        }
      } catch (statusError) {
        console.error('Failed to update payment status to failed:', statusError);
      }
    }

    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});