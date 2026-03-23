import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getErrorDetails = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  stack: error?.stack || null,
});

Deno.serve(async (req) => {
  let stage = 'initializing';
  let logContext = {};

  try {
    stage = 'auth';
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      supplierId,
      paymentDate,
      paymentMethod,
      fromAccountId,
      totalPaymentAmount,
      chequeNumber,
      notes,
      appliedInvoices
    } = payload;

    if (!supplierId || !paymentDate || !paymentMethod || totalPaymentAmount === undefined || totalPaymentAmount === null) {
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

    if (!Array.isArray(appliedInvoices)) {
      return Response.json({ success: false, error: 'appliedInvoices must be an array' }, { status: 400 });
    }

    const paymentAmount = parseFloat(totalPaymentAmount);
    if (Number.isNaN(paymentAmount)) {
      return Response.json({ success: false, error: 'Invalid payment amount' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('id')
      .eq('id', supplierId)
      .single();

    if (supplierError || !supplier) {
      return Response.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    const paymentId = crypto.randomUUID();
    const paymentSource = paymentMethod === 'Cash' ? 'cash' : fromAccountId;

    const { data: allocationResult, error: allocationError } = await supabase.rpc('apply_supplier_invoice_line_paid_updates', {
      p_payment_id: paymentId,
      p_supplier_id: supplierId,
      p_payment_date: paymentDate,
      p_amount: paymentAmount,
      p_payment_method: paymentMethod,
      p_cheque_number: chequeNumber || null,
      p_source: paymentSource,
      p_notes: notes || null,
      p_applied_invoices: appliedInvoices
    });

    if (allocationError) {
      throw new Error(`Failed to create supplier payment: ${allocationError.message}`);
    }

    base44.functions.invoke('executeSupplierPayment', {
      paymentId
    }).catch((invokeError) => {
      console.error('Failed to trigger executeSupplierPayment:', invokeError);
    });

    return Response.json({
      success: true,
      message: 'Payment queued for processing',
      payment_id: allocationResult?.payment_id || paymentId
    });
  } catch (error) {
    console.error('Error in processSupplierPayment:', error);
    return Response.json({
      success: false,
      error: error.message || 'An error occurred while queuing the payment'
    }, { status: 500 });
  }
});