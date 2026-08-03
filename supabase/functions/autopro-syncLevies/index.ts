import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabaseRecordId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase configuration is missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { workOrderId, lineItems } = await req.json();

    console.log('--- syncLevies Invoked ---');
    console.log('WorkOrder:', workOrderId);
    console.log('Line Items Count:', lineItems?.length);

    if (!workOrderId || !lineItems) {
      return res({ success: false, error: 'Missing required parameters' });
    }

    // 1. Fetch OtherChargeList to identify reportable levies
    const { data: otherCharges, error: otherChargesError } = await supabase
      .from('OtherChargeList')
      .select('*')
      .limit(1000);

    if (otherChargesError) throw new Error(otherChargesError.message);

    const reportableLevyMap = new Map();
    (otherCharges || []).forEach((oc: any) => {
      if (oc.reportable_levy) {
        reportableLevyMap.set(oc.id, oc);
      }
    });

    console.log('Reportable Levy Types found:', reportableLevyMap.size);

    // 2. Build Target State (What should be on the Work Order)
    // Map: line_item_id -> { qty, amount, other_charge_id, ... }
    const targetState = new Map();

    for (const line of lineItems) {
      if (line.is_other_charge) {
        if (line.other_charge_id) {
          const oc = reportableLevyMap.get(line.other_charge_id);
          if (oc) {
            console.log(`Found reportable levy on line ${line.id} (Charge ID: ${oc.id})`);
            const lid = String(line.id);
            targetState.set(lid, {
              other_charge_id: oc.id,
              qty: parseFloat(line.qty || 0),
              amount: parseFloat(line.oc_total || 0),
              base_amount: parseFloat(line.oc_total || 0) / (parseFloat(line.qty) || 1), // implied base amount
              supplier_invoice_line_id: line.supplier_invoice_line_id || null
            });
          }
        }
      }
    }

    // 3. Build Current DB Ledger State (Net effect of all transactions so far)
    // Map: line_item_id -> { net_qty, net_amount, sample_record }
    const { data: existingLevies, error: existingLeviesError } = await supabase
      .from('Levies')
      .select('*')
      .eq('work_order_id', workOrderId)
      .limit(1000);

    if (existingLeviesError) throw new Error(existingLeviesError.message);

    const dbState = new Map();

    for (const levy of existingLevies || []) {
      const lid = String(levy.line_item_id);
      if (!dbState.has(lid)) {
        dbState.set(lid, { net_qty: 0, net_amount: 0, sample_record: levy });
      }
      const state = dbState.get(lid);
      state.net_qty += (parseFloat(levy.qty) || 0);
      state.net_amount += (parseFloat(levy.total_amount) || 0);
    }

    const actions: any[] = [];

    // 4. Reconcile Target vs DB (Additions & Modifications)
    for (const [lineId, target] of targetState) {
      const db = dbState.get(lineId) || { net_qty: 0, net_amount: 0, sample_record: null };

      const diffQty = target.qty - db.net_qty;
      const diffAmt = target.amount - db.net_amount;

      // Check if there is a material difference (accounting for float precision)
      const hasChange = Math.abs(diffQty) > 0.001 || Math.abs(diffAmt) > 0.005;

      if (hasChange) {
        // Create a delta record (positive or negative adjustment)
        actions.push({
          id: createSupabaseRecordId(),
          work_order_id: workOrderId,
          other_charge_id: target.other_charge_id,
          line_item_id: lineId,
          qty: diffQty,
          base_amount: target.base_amount,
          total_amount: diffAmt,
          supplier_invoice_line_id: target.supplier_invoice_line_id,
          date_applied: new Date().toISOString()
        });
      }

      // Remove processed line from dbState tracker
      dbState.delete(lineId);
    }

    // 5. Reconcile Remaining DB items (Deletions)
    // Any lines left in dbState are in the DB (non-zero net) but NOT in the current WO -> They were deleted.
    for (const [lineId, db] of dbState) {
      const isNonZero = Math.abs(db.net_qty) > 0.001 || Math.abs(db.net_amount) > 0.005;

      if (isNonZero) {
        // Create a negative balancing record to zero out the ledger
        actions.push({
          id: createSupabaseRecordId(),
          work_order_id: workOrderId,
          other_charge_id: db.sample_record?.other_charge_id, // Use metadata from history
          line_item_id: lineId,
          qty: -db.net_qty, // Reverse the net quantity
          base_amount: db.sample_record?.base_amount || 0,
          total_amount: -db.net_amount, // Reverse the net amount
          supplier_invoice_line_id: db.sample_record?.supplier_invoice_line_id || null,
          date_applied: new Date().toISOString()
        });
      }
    }

    // 6. Execute Transaction Log (single batch insert, replacing the legacy's per-row create loop)
    if (actions.length > 0) {
      const { error: insertError } = await supabase.from('Levies').insert(actions);
      if (insertError) throw new Error(insertError.message);
    }

    return res({
      success: true,
      message: 'Levies ledger synced successfully',
      records_created: actions.length
    });

  } catch (error: any) {
    console.error('Error in syncLevies:', error);
    return res({
      success: false,
      error: error.message || 'Failed to sync levies'
    });
  }
});
