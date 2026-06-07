import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const workOrderId = body.workOrderId;
    const newCustomerId = body.newCustomerId;
    const paymentIds = Array.isArray(body.paymentIds) ? body.paymentIds.filter(Boolean) : [];
    const nowIso = new Date().toISOString();

    if (!workOrderId || !newCustomerId) {
      return Response.json({ error: 'workOrderId and newCustomerId are required' }, { status: 400 });
    }

    const workOrderUpdate = await supabase
      .from('WorkOrder')
      .update({
        customer_id: newCustomerId,
        last_updated: nowIso,
        last_updated_by: user.email || null,
      })
      .eq('id', workOrderId)
      .select('id, customer_id')
      .single();

    if (workOrderUpdate.error) {
      throw workOrderUpdate.error;
    }

    let updatedPaymentsCount = 0;

    if (paymentIds.length > 0) {
      const paymentsUpdate = await supabase
        .from('CustomerPayments')
        .update({
          customer_id: newCustomerId,
          updated_date: nowIso,
        })
        .eq('work_order_id', workOrderId)
        .in('id', paymentIds)
        .select('id');

      if (paymentsUpdate.error) {
        throw paymentsUpdate.error;
      }

      updatedPaymentsCount = Array.isArray(paymentsUpdate.data) ? paymentsUpdate.data.length : 0;
    }

    return Response.json({
      success: true,
      workOrderId,
      newCustomerId,
      updatedPaymentsCount,
    });
  } catch (error) {
    console.error('changeWorkOrderCustomer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});