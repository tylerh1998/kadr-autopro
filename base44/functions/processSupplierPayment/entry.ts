import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getErrorDetails = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  stack: error?.stack || null,
});

const buildInvoiceStateSnapshot = (rows = []) => (rows || []).map((row) => ({
  id: row?.id || null,
  invoice_number: row?.invoice_number || null,
  invoice_date: row?.invoice_date || null,
  purchase_amount: row?.purchase_amount ?? null,
  gst_amount: row?.gst_amount ?? null,
  paid_amount: row?.paid_amount ?? null,
  updated_date: row?.updated_date || null,
}));

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

    logContext = {
      user_email: user.email,
      supplier_id: supplierId || null,
      payment_date: paymentDate || null,
      payment_method: paymentMethod || null,
      from_account_id: fromAccountId || null,
      total_payment_amount: totalPaymentAmount ?? null,
      cheque_number: chequeNumber || null,
      applied_invoice_count: Array.isArray(appliedInvoices) ? appliedInvoices.length : null,
    };

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

    stage = 'supplier_lookup';
    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('id')
      .eq('id', supplierId)
      .single();

    if (supplierError || !supplier) {
      console.error('processSupplierPayment supplier lookup failed', {
        ...logContext,
        stage,
        error: getErrorDetails(supplierError || new Error('Supplier not found')),
      });

      return Response.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    const paymentSource = paymentMethod === 'Cash' ? 'cash' : fromAccountId;

    stage = 'create_supplier_payment';
    const paymentId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const now = new Date().toISOString();

    const { error: createPaymentError } = await supabase
      .from('SupplierPayment')
      .insert([{ 
        id: paymentId,
        created_date: now,
        updated_date: now,
        created_by: user.email,
        created_by_id: user.id,
        supplier_id: supplierId,
        invoice_number: JSON.stringify(appliedInvoices),
        payment_date: paymentDate,
        amount: paymentAmount,
        payment_method: paymentMethod,
        cheque_number: chequeNumber || null,
        source: paymentSource,
        notes: notes || null,
        status: 'pending',
        error_message: null,
      }]);

    if (createPaymentError) {
      throw new Error(`Failed to create supplier payment: ${createPaymentError.message}`);
    }

    stage = 'apply_supplier_invoice_line_paid_updates';

    const trackedInvoiceIds = [...new Set(
      appliedInvoices
        .map((invoice) => invoice?.id)
        .filter(Boolean)
    )];
    const trackedInvoiceNumbers = [...new Set(
      appliedInvoices
        .map((invoice) => invoice?.invoice_number)
        .filter((invoiceNumber) => invoiceNumber && invoiceNumber !== 'On Account')
    )];

    let invoiceStateBeforeById = [];
    let invoiceStateBeforeByNumber = [];

    if (trackedInvoiceIds.length > 0) {
      const { data: rowsById, error: rowsByIdError } = await supabase
        .from('SupplierInvoiceLine')
        .select('id, invoice_number, invoice_date, purchase_amount, gst_amount, paid_amount, updated_date')
        .in('id', trackedInvoiceIds);

      if (rowsByIdError) {
        console.error('processSupplierPayment failed to load invoice state by id before allocation', {
          ...logContext,
          stage,
          payment_id: paymentId,
          tracked_invoice_ids: trackedInvoiceIds,
          error: getErrorDetails(rowsByIdError),
        });
      } else {
        invoiceStateBeforeById = rowsById || [];
      }
    }

    if (trackedInvoiceNumbers.length > 0) {
      const { data: rowsByNumber, error: rowsByNumberError } = await supabase
        .from('SupplierInvoiceLine')
        .select('id, invoice_number, invoice_date, purchase_amount, gst_amount, paid_amount, updated_date')
        .eq('supplier_id', supplierId)
        .in('invoice_number', trackedInvoiceNumbers)
        .order('invoice_date', { ascending: false });

      if (rowsByNumberError) {
        console.error('processSupplierPayment failed to load invoice state by invoice number before allocation', {
          ...logContext,
          stage,
          payment_id: paymentId,
          tracked_invoice_numbers: trackedInvoiceNumbers,
          error: getErrorDetails(rowsByNumberError),
        });
      } else {
        invoiceStateBeforeByNumber = rowsByNumber || [];
      }
    }

    console.info('processSupplierPayment allocation snapshot before RPC', {
      ...logContext,
      stage,
      payment_id: paymentId,
      applied_invoices: appliedInvoices,
      tracked_invoice_ids: trackedInvoiceIds,
      tracked_invoice_numbers: trackedInvoiceNumbers,
      matched_by_id: buildInvoiceStateSnapshot(invoiceStateBeforeById),
      matched_by_invoice_number: buildInvoiceStateSnapshot(invoiceStateBeforeByNumber),
    });

    const { data: allocationResult, error: allocationError } = await supabase.rpc('apply_supplier_invoice_line_paid_updates', {
      p_supplier_id: supplierId,
      p_applied_invoices: appliedInvoices
    });

    if (allocationError) {
      console.error('processSupplierPayment allocation RPC failed', {
        ...logContext,
        stage,
        payment_id: paymentId,
        payment_source: paymentSource,
        error: getErrorDetails(allocationError),
      });

      stage = 'rollback_supplier_payment';
      await supabase
        .from('SupplierPayment')
        .delete()
        .eq('id', paymentId);

      throw new Error(`Failed to create supplier payment: ${allocationError.message}`);
    }

    let invoiceStateAfterById = [];
    let invoiceStateAfterByNumber = [];

    if (trackedInvoiceIds.length > 0) {
      const { data: rowsByIdAfter, error: rowsByIdAfterError } = await supabase
        .from('SupplierInvoiceLine')
        .select('id, invoice_number, invoice_date, purchase_amount, gst_amount, paid_amount, updated_date')
        .in('id', trackedInvoiceIds);

      if (rowsByIdAfterError) {
        console.error('processSupplierPayment failed to load invoice state by id after allocation', {
          ...logContext,
          stage,
          payment_id: paymentId,
          tracked_invoice_ids: trackedInvoiceIds,
          error: getErrorDetails(rowsByIdAfterError),
        });
      } else {
        invoiceStateAfterById = rowsByIdAfter || [];
      }
    }

    if (trackedInvoiceNumbers.length > 0) {
      const { data: rowsByNumberAfter, error: rowsByNumberAfterError } = await supabase
        .from('SupplierInvoiceLine')
        .select('id, invoice_number, invoice_date, purchase_amount, gst_amount, paid_amount, updated_date')
        .eq('supplier_id', supplierId)
        .in('invoice_number', trackedInvoiceNumbers)
        .order('invoice_date', { ascending: false });

      if (rowsByNumberAfterError) {
        console.error('processSupplierPayment failed to load invoice state by invoice number after allocation', {
          ...logContext,
          stage,
          payment_id: paymentId,
          tracked_invoice_numbers: trackedInvoiceNumbers,
          error: getErrorDetails(rowsByNumberAfterError),
        });
      } else {
        invoiceStateAfterByNumber = rowsByNumberAfter || [];
      }
    }

    console.info('processSupplierPayment allocation snapshot after RPC', {
      ...logContext,
      stage,
      payment_id: paymentId,
      payment_source: paymentSource,
      allocation_result: allocationResult || null,
      matched_by_id: buildInvoiceStateSnapshot(invoiceStateAfterById),
      matched_by_invoice_number: buildInvoiceStateSnapshot(invoiceStateAfterByNumber),
    });

    stage = 'queue_executeSupplierPayment';
    base44.functions.invoke('executeSupplierPayment', {
      paymentId
    }).catch((invokeError) => {
      console.error('processSupplierPayment failed to trigger executeSupplierPayment', {
        ...logContext,
        stage,
        payment_id: paymentId,
        error: getErrorDetails(invokeError),
      });
    });

    return Response.json({
      success: true,
      message: 'Payment queued for processing',
      payment_id: allocationResult?.payment_id || paymentId
    });
  } catch (error) {
    console.error('processSupplierPayment unhandled error', {
      ...logContext,
      stage,
      error: getErrorDetails(error),
    });

    return Response.json({
      success: false,
      error: error.message || 'An error occurred while queuing the payment'
    }, { status: 500 });
  }
});