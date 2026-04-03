import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

function generateCpId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const workOrderResult = await supabase
      .from('WorkOrder')
      .select('*')
      .eq('id', work_order_id)
      .limit(1)
      .maybeSingle();

    if (workOrderResult.error) {
      console.error('createPortalSnapshot work order fetch error:', workOrderResult.error);
      return Response.json({ error: 'Failed to fetch work order', details: workOrderResult.error.message }, { status: 500 });
    }

    const workOrder = workOrderResult.data;
    if (!workOrder) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }

    const customerResult = await supabase
      .from('Customer')
      .select('*')
      .eq('id', workOrder.customer_id)
      .maybeSingle();

    if (customerResult.error) {
      console.error('createPortalSnapshot customer fetch error:', customerResult.error);
      return Response.json({ error: 'Failed to fetch customer', details: customerResult.error.message }, { status: 500 });
    }
    const customer = customerResult.data;
    if (!customer) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    const vehicleResult = await supabase
      .from('Vehicle')
      .select('*')
      .eq('id', workOrder.vehicle_id)
      .maybeSingle();

    if (vehicleResult.error) {
      console.error('createPortalSnapshot vehicle fetch error:', vehicleResult.error);
      return Response.json({ error: 'Failed to fetch vehicle', details: vehicleResult.error.message }, { status: 500 });
    }
    const vehicle = vehicleResult.data;
    if (!vehicle) {
      return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    let cpId = generateCpId();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const existing = await base44.entities.CustomerPortalWorkOrder.filter({ cp_id: cpId });
      if (!existing || existing.length === 0) {
        isUnique = true;
      } else {
        cpId = generateCpId();
        attempts++;
      }
    }

    if (!isUnique) {
      return Response.json({ error: 'Failed to generate unique cp_id after multiple attempts' }, { status: 500 });
    }

    const customerName = customer.org_name && customer.org_name.trim() !== ''
      ? customer.org_name
      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    const customerSnapshot = JSON.stringify({
      name: customerName,
      phone: customer.phone || ''
    });

    const vehicleSnapshot = JSON.stringify({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || '',
      vin: vehicle.vin || '',
      license_plate: vehicle.license_plate || '',
      color: vehicle.color || '',
      mileage: vehicle.mileage || null
    });

    const lineItemsSnapshot = workOrder.line_items || '[]';

    let adjustedAmountPaid = 0;
    try {
      if (workOrder.payments) {
        const paymentsList = JSON.parse(workOrder.payments);
        if (Array.isArray(paymentsList)) {
          adjustedAmountPaid = paymentsList.reduce((sum, p) => {
            const method = p.payment_method || p.method;
            if (method === 'on_account') {
              return sum;
            }
            return sum + (Number(p.amount) || 0);
          }, 0);
        }
      }
    } catch (error) {
      console.error('Error parsing payments for snapshot balance calculation:', error);
      adjustedAmountPaid = workOrder.amount_paid || 0;
    }

    let refNumber;
    let refDate;
    const stage = workOrder.stage || 'work_order';

    if (stage === 'estimate' && workOrder.est_number) {
      refNumber = workOrder.est_number;
      refDate = workOrder.est_date || '';
    } else if (stage === 'work_order' && workOrder.wo_number) {
      refNumber = workOrder.wo_number;
      refDate = workOrder.wo_date || '';
    } else if (stage === 'invoice' && workOrder.inv_number) {
      refNumber = workOrder.inv_number;
      refDate = workOrder.invoice_date || '';
    } else if (stage === 'credit_invoice' && workOrder.crinv_number) {
      refNumber = workOrder.crinv_number;
      refDate = workOrder.invoice_date || '';
    } else {
      refNumber = workOrder.ro_number || '';
      refDate = workOrder.wo_date || workOrder.est_date || '';
    }

    const portalSnapshot = await base44.entities.CustomerPortalWorkOrder.create({
      original_work_order_id: workOrder.id,
      cp_id: cpId,
      ref_number: refNumber,
      ref_date: refDate,
      snapshot_date: new Date().toISOString(),
      notes_to_customer: workOrder.notes_to_customer || '',
      customer_snapshot: customerSnapshot,
      vehicle_snapshot: vehicleSnapshot,
      line_items_snapshot: lineItemsSnapshot,
      parts_total: workOrder.parts_total || 0,
      labor_total: workOrder.labor_total || 0,
      shop_supply_total: workOrder.shop_supply_total || 0,
      tax_amount: workOrder.tax_amount || 0,
      total_amount: workOrder.total_amount || 0,
      payments: workOrder.payments || '[]',
      amount_paid: adjustedAmountPaid,
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
    console.error('Error creating portal snapshot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});