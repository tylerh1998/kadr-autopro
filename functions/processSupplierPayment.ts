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

    const supabaseUrl = Deno.env.get("Supabase_project_url");
    const supabaseSecret = Deno.env.get("Supabase_Secret_Key");
    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    // Get supplier to confirm existence
    const { data: supplier } = await supabase.from('Supplier').select('*').eq('id', supplierId).single();
    if (!supplier) {
      return Response.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    // Create SupplierPayment record with 'pending' status
    const paymentRecord = {
      supplier_id: supplierId,
      invoice_number: JSON.stringify(appliedInvoices || []),
      payment_date: paymentDate,
      amount: paymentAmount,
      payment_method: paymentMethod,
      cheque_number: chequeNumber || null,
      source: paymentMethod === 'Cash' ? 'cash' : fromAccountId,
      notes: notes || null,
      status: 'pending'
    };

    const { data: createdPayment, error: paymentError } = await supabase.from('SupplierPayment').insert(paymentRecord).select().single();
    if (paymentError || !createdPayment) {
        throw new Error('Failed to create payment record');
    }

    // Trigger background execution WITHOUT awaiting
    // We intentionally do not await this to allow immediate response
    base44.functions.invoke('executeSupplierPayment', {
        ...payload,
        paymentId: createdPayment.id
    }).catch(err => console.error('Failed to trigger background execution:', err));

    // Return immediate success
    return Response.json({
      success: true,
      message: 'Payment queued for processing',
      payment_id: createdPayment.id
    });

  } catch (error) {
    console.error('Error in processSupplierPayment:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'An error occurred while queuing the payment' 
    }, { status: 500 });
  }
});