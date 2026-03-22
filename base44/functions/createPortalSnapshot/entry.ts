import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Generate a random 10-character alphanumeric string
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

    const { work_order_id } = await req.json();

    if (!work_order_id) {
      return Response.json({ error: 'work_order_id is required' }, { status: 400 });
    }

    // Fetch the work order
    const workOrders = await base44.entities.WorkOrder.filter({ id: work_order_id });
    if (!workOrders || workOrders.length === 0) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }
    const workOrder = workOrders[0];

    // Fetch the customer
    const customers = await base44.entities.Customer.filter({ id: workOrder.customer_id });
    if (!customers || customers.length === 0) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }
    const customer = customers[0];

    // Fetch the vehicle
    const vehicles = await base44.entities.Vehicle.filter({ id: workOrder.vehicle_id });
    if (!vehicles || vehicles.length === 0) {
      return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    }
    const vehicle = vehicles[0];

    // Generate a unique cp_id
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

    // Build customer snapshot (name and phone only)
    const customerName = customer.org_name && customer.org_name.trim() !== '' 
      ? customer.org_name 
      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    
    const customerSnapshot = JSON.stringify({
      name: customerName,
      phone: customer.phone || ''
    });

    // Build vehicle snapshot
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

    // Line items snapshot (from work order's line_items field)
    const lineItemsSnapshot = workOrder.line_items || '[]';

    // Calculate paid amount excluding 'on_account' payments for the snapshot
    // This ensures the portal displays the correct balance due (customer still owes on_account amounts)
    let adjustedAmountPaid = 0;
    try {
      if (workOrder.payments) {
        const paymentsList = JSON.parse(workOrder.payments);
        if (Array.isArray(paymentsList)) {
          adjustedAmountPaid = paymentsList.reduce((sum, p) => {
            // Check both payment_method and method fields
            const method = p.payment_method || p.method;
            if (method === 'on_account') {
              return sum;
            }
            return sum + (Number(p.amount) || 0);
          }, 0);
        }
      }
    } catch (e) {
      console.error("Error parsing payments for snapshot balance calculation", e);
      // Fallback
      adjustedAmountPaid = workOrder.amount_paid || 0;
    }

    // Determine ref_number and ref_date based on stage
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
      // Fallback to ro_number
      refNumber = workOrder.ro_number || '';
      refDate = workOrder.wo_date || workOrder.est_date || '';
    }

    // Create the CustomerPortalWorkOrder record
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
      stage: stage,
      approval: 'pending'
    });

    const portalUrl = `https://portal.kensauto.ca/WorkOrder?cp_id=${cpId}`;

    return Response.json({
      success: true,
      cp_id: cpId,
      portal_url: portalUrl,
      snapshot_id: portalSnapshot.id
    });

  } catch (error) {
    console.error('Error creating portal snapshot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});