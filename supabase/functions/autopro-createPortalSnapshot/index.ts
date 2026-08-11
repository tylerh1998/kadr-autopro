import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function generateCpId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userEmail = authData.user.email || null;

    const { work_order_id } = await req.json().catch(() => ({}));

    if (!work_order_id) {
      return new Response(JSON.stringify({ error: 'work_order_id is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const workOrderResult = await supabaseAdmin
      .from('WorkOrder')
      .select('*')
      .eq('id', work_order_id)
      .limit(1)
      .maybeSingle();

    if (workOrderResult.error) {
      console.error('createPortalSnapshot work order fetch error:', workOrderResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch work order', details: workOrderResult.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const workOrder = workOrderResult.data;
    if (!workOrder) {
      return new Response(JSON.stringify({ error: 'Work order not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const customerResult = await supabaseAdmin
      .from('Customer')
      .select('*')
      .eq('id', workOrder.customer_id)
      .maybeSingle();

    if (customerResult.error) {
      console.error('createPortalSnapshot customer fetch error:', customerResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch customer', details: customerResult.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const customer = customerResult.data;
    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vehicleResult = await supabaseAdmin
      .from('Vehicle')
      .select('*')
      .eq('id', workOrder.vehicle_id)
      .maybeSingle();

    if (vehicleResult.error) {
      console.error('createPortalSnapshot vehicle fetch error:', vehicleResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch vehicle', details: vehicleResult.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const vehicle = vehicleResult.data;
    if (!vehicle) {
      return new Response(JSON.stringify({ error: 'Vehicle not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let cpId = generateCpId();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const existing = await supabaseAdmin
        .from('CustomerPortalWorkOrder')
        .select('id')
        .eq('cp_id', cpId)
        .limit(1);
      if (existing.error) {
        console.error('createPortalSnapshot cp_id uniqueness check error:', existing.error);
        return new Response(JSON.stringify({ error: 'Failed to verify cp_id uniqueness', details: existing.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!existing.data || existing.data.length === 0) {
        isUnique = true;
      } else {
        cpId = generateCpId();
        attempts++;
      }
    }

    if (!isUnique) {
      return new Response(JSON.stringify({ error: 'Failed to generate unique cp_id after multiple attempts' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const lineItemsSnapshot = typeof workOrder.line_items === 'string'
      ? workOrder.line_items
      : JSON.stringify(workOrder.line_items || []);

    let adjustedAmountPaid = 0;
    const paymentsList = Array.isArray(workOrder.payments)
      ? workOrder.payments
      : (() => {
          if (!workOrder.payments) return [];
          if (typeof workOrder.payments === 'string') {
            try {
              return JSON.parse(workOrder.payments);
            } catch (error) {
              console.error('Error parsing payments for snapshot balance calculation:', error);
              return [];
            }
          }
          return [];
        })();

    if (Array.isArray(paymentsList)) {
      adjustedAmountPaid = paymentsList.reduce((sum, p) => {
        const method = p.payment_method || p.method;
        if (method === 'on_account') {
          return sum;
        }
        return sum + (Number(p.amount) || 0);
      }, 0);
    } else {
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

    const nowIso = new Date().toISOString();
    const snapshotId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const insertResult = await supabaseAdmin
      .from('CustomerPortalWorkOrder')
      .insert({
        id: snapshotId,
        original_work_order_id: workOrder.id,
        cp_id: cpId,
        ref_number: refNumber,
        ref_date: refDate,
        snapshot_date: nowIso,
        notes_to_customer: workOrder.notes_to_customer || '',
        customer_snapshot: customerSnapshot,
        vehicle_snapshot: vehicleSnapshot,
        line_items_snapshot: lineItemsSnapshot,
        parts_total: workOrder.parts_total || 0,
        labor_total: workOrder.labor_total || 0,
        shop_supply_total: workOrder.shop_supply_total || 0,
        tax_amount: workOrder.tax_amount || 0,
        total_amount: workOrder.total_amount || 0,
        payments: typeof workOrder.payments === 'string'
          ? workOrder.payments
          : JSON.stringify(workOrder.payments || []),
        amount_paid: adjustedAmountPaid,
        po_number: workOrder.po_number || '',
        cvip: workOrder.cvip || null,
        odometer: workOrder.odometer ?? null,
        stage,
        approval: 'pending',
        created_date: nowIso,
        created_by: userEmail,
        created_by_id: authData.user.id,
      })
      .select('id')
      .single();

    if (insertResult.error) {
      console.error('createPortalSnapshot insert error:', insertResult.error);
      return new Response(JSON.stringify({ error: 'Failed to create portal snapshot', details: insertResult.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      cp_id: cpId,
      portal_url: `https://portal.kensauto.ca/WorkOrder?cp_id=${cpId}`,
      snapshot_id: insertResult.data.id
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error creating portal snapshot:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
