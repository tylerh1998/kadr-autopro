import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

function generateCpId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAdjustedAmountPaid(workOrder) {
  const payments = toArray(workOrder.payments);
  if (payments.length === 0) {
    return toNumber(workOrder.amount_paid);
  }

  return payments.reduce((sum, payment) => {
    const method = payment?.payment_method || payment?.method;
    if (method === 'on_account') return sum;
    return sum + toNumber(payment?.amount);
  }, 0);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { work_order_id } = await req.json().catch(() => ({}));
    if (!work_order_id) {
      return Response.json({ error: 'work_order_id is required' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const workOrderResult = await supabase.from('WorkOrder').select('*').eq('id', work_order_id).maybeSingle();
    if (workOrderResult.error) {
      return Response.json({ error: 'Failed to fetch work order', details: workOrderResult.error.message }, { status: 500 });
    }

    const workOrder = workOrderResult.data;
    if (!workOrder) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }

    const customerResult = await supabase.from('Customer').select('*').eq('id', workOrder.customer_id).maybeSingle();
    if (customerResult.error) {
      return Response.json({ error: 'Failed to fetch customer', details: customerResult.error.message }, { status: 500 });
    }

    const customer = customerResult.data;
    if (!customer) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    const vehicleResult = await supabase.from('Vehicle').select('*').eq('id', workOrder.vehicle_id).maybeSingle();
    if (vehicleResult.error) {
      return Response.json({ error: 'Failed to fetch vehicle', details: vehicleResult.error.message }, { status: 500 });
    }

    const vehicle = vehicleResult.data;
    if (!vehicle) {
      return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    let cpId = generateCpId();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await base44.entities.CustomerPortalWorkOrder.filter({ cp_id: cpId });
      if (!existing || existing.length === 0) break;
      cpId = generateCpId();
      attempts += 1;
    }

    if (attempts >= 10) {
      return Response.json({ error: 'Failed to generate unique cp_id after multiple attempts' }, { status: 500 });
    }

    const customerName = customer.org_name && String(customer.org_name).trim() !== ''
      ? customer.org_name
      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    const stage = workOrder.stage || 'work_order';
    const refNumber = workOrder.inv_number || workOrder.wo_number || workOrder.est_number || workOrder.crinv_number || workOrder.ro_number || '';
    const refDate = workOrder.invoice_date || workOrder.wo_date || workOrder.est_date || '';

    const portalSnapshot = await base44.entities.CustomerPortalWorkOrder.create({
      original_work_order_id: workOrder.id,
      cp_id: cpId,
      ref_number: refNumber,
      ref_date: refDate,
      snapshot_date: new Date().toISOString(),
      notes_to_customer: workOrder.notes_to_customer || '',
      customer_snapshot: JSON.stringify({
        name: customerName,
        phone: customer.phone || ''
      }),
      vehicle_snapshot: JSON.stringify({
        year: vehicle.year || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        trim: vehicle.trim || '',
        vin: vehicle.vin || '',
        license_plate: vehicle.license_plate || '',
        color: vehicle.color || '',
        mileage: vehicle.mileage || null
      }),
      line_items_snapshot: JSON.stringify(toArray(workOrder.line_items)),
      parts_total: toNumber(workOrder.parts_total),
      labor_total: toNumber(workOrder.labor_total),
      shop_supply_total: toNumber(workOrder.shop_supply_total),
      tax_amount: toNumber(workOrder.tax_amount),
      total_amount: toNumber(workOrder.total_amount),
      payments: JSON.stringify(toArray(workOrder.payments)),
      amount_paid: getAdjustedAmountPaid(workOrder),
      po_number: workOrder.po_number || '',
      stage,
      approval: 'pending'
    });

    return Response.json({
      success: true,
      cp_id: cpId,
      portal_url: `https://portal.kensauto.ca/WorkOrder?cp_id=${cpId}`,
      snapshot_id: portalSnapshot.id
    });
  } catch (error) {
    console.error('Error creating batch portal snapshot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});