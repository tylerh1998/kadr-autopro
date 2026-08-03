import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getErrorDetails = (error: any) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  stack: error?.stack || null,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  let stage = 'initializing';
  let logContext: any = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    stage = 'auth';
    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
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
      return res({
        success: false,
        error: 'Missing required fields: supplierId, paymentDate, paymentMethod, totalPaymentAmount'
      });
    }

    if (paymentMethod !== 'Cash' && !fromAccountId) {
      return res({
        success: false,
        error: 'fromAccountId is required for non-cash payments'
      });
    }

    if (!Array.isArray(appliedInvoices)) {
      return res({ success: false, error: 'appliedInvoices must be an array' });
    }

    const paymentAmount = parseFloat(totalPaymentAmount);
    if (Number.isNaN(paymentAmount)) {
      return res({ success: false, error: 'Invalid payment amount' });
    }

    stage = 'supplier_lookup';
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

      return res({ success: false, error: 'Supplier not found' });
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

    stage = 'queue_executeSupplierPayment';
    supabase.functions.invoke('autopro-executeSupplierPayment', {
      body: { paymentId }
    }).catch((invokeError: any) => {
      console.error('processSupplierPayment failed to trigger executeSupplierPayment', {
        ...logContext,
        stage,
        payment_id: paymentId,
        error: getErrorDetails(invokeError),
      });
    });

    return res({
      success: true,
      message: 'Payment queued for processing',
      payment_id: allocationResult?.payment_id || paymentId
    });
  } catch (error: any) {
    console.error('processSupplierPayment unhandled error', {
      ...logContext,
      stage,
      error: getErrorDetails(error),
    });

    return res({
      success: false,
      error: error.message || 'An error occurred while queuing the payment'
    });
  }
});
