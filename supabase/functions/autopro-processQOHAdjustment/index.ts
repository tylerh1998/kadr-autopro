import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendViaResend } from "../_shared/resend.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const body = await req.json();
    const { inventory_item_id, new_quantity_on_hand, notes, system_issue } = body;

    if (!inventory_item_id || new_quantity_on_hand === undefined || new_quantity_on_hand === null) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: inventory_item_id and new_quantity_on_hand' 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch the inventory item directly from Supabase
    const { data: inventoryItem, error: fetchError } = await supabaseAdmin
      .from('InventoryItem')
      .select('*')
      .eq('id', inventory_item_id)
      .maybeSingle();
    
    if (fetchError || !inventoryItem) {
      return new Response(JSON.stringify({ error: 'Inventory item not found' }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const old_quantity_on_hand = parseFloat(inventoryItem.quantity_on_hand || 0);
    const newQoh = parseFloat(new_quantity_on_hand);
    const quantity_change = newQoh - old_quantity_on_hand;
    const item_cost = parseFloat(inventoryItem.cost || 0);
    const value_change = Math.round(quantity_change * item_cost * 100) / 100;

    const descriptionMsg = notes || `Manual QOH adjustment from ${old_quantity_on_hand} to ${new_quantity_on_hand}.`;

    // Perform atomic update via RPC
    const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
      p_item_id: inventory_item_id,
      p_qoh: newQoh,
      p_qoo: parseFloat(inventoryItem.quantity_on_order || 0),
      p_ro_number: null,
      p_supplier_inv: null,
      p_source_action: 'processQOHAdjustment',
      p_tx_type: 'QOH Adjusted',
      p_description: descriptionMsg,
      p_user_id: user.id || null,
      p_user_name: user.email || null,
      p_source_record_id: null
    });

    if (rpcError) {
      console.error('Failed to update inventory item via RPC:', rpcError);
      return new Response(JSON.stringify({ 
        error: `Failed to update inventory item: ${rpcError.message}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Generate a unique ID for referencing the adjustment transaction
    const adjustmentTxId = crypto.randomUUID();

    if (system_issue) {
      const mountainDateTime = new Date().toLocaleString('en-US', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const emailBody = `
        <p><strong>Part #:</strong> ${inventoryItem.part_number || ''}</p>
        <p><strong>Date:</strong> ${mountainDateTime}</p>
        <p><strong>Adjusted By:</strong> ${user.email || ''}</p>
        <p><strong>Current QOH:</strong> ${old_quantity_on_hand}</p>
        <p><strong>New QOH:</strong> ${new_quantity_on_hand}</p>
        <p><strong>Notes:</strong> ${notes || ''}</p>
      `;

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";
      if (resendApiKey) {
        await sendViaResend(
          resendApiKey,
          `Ken's Auto & Diesel Repair <${fromEmail}>`,
          ['tyler@kensauto.ca'],
          'QOH Adjustment - System Issue',
          emailBody
        ).catch(err => console.error("Failed to send email:", err));
      }
    }

    // Create GL transactions only if there is a value change
    let glPosted = false;
    if (value_change !== 0) {
      const absoluteValueChange = Math.round(Math.abs(value_change) * 100) / 100;
      const adjustmentDescription = `Inventory QOH Adjustment - ${inventoryItem.part_number}`;
      const transactionDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      const glTransactions = [];

      if (value_change > 0) {
        // Inventory increased - Debit 1200 (Asset increases), Credit 5003 (Expense/contra-account)
        glTransactions.push({
          id: crypto.randomUUID(),
          account_number: '1200',
          transaction_date: transactionDate,
          description: adjustmentDescription,
          reference: adjustmentTxId,
          debit_amount: absoluteValueChange,
          credit_amount: 0,
          source_type: 'adjustment',
          source_id: adjustmentTxId
        });

        glTransactions.push({
          id: crypto.randomUUID(),
          account_number: '5003',
          transaction_date: transactionDate,
          description: adjustmentDescription,
          reference: adjustmentTxId,
          debit_amount: 0,
          credit_amount: absoluteValueChange,
          source_type: 'adjustment',
          source_id: adjustmentTxId
        });
      } else {
        // Inventory decreased - Credit 1200 (Asset decreases), Debit 5003 (Expense increases)
        glTransactions.push({
          id: crypto.randomUUID(),
          account_number: '1200',
          transaction_date: transactionDate,
          description: adjustmentDescription,
          reference: adjustmentTxId,
          debit_amount: 0,
          credit_amount: absoluteValueChange,
          source_type: 'adjustment',
          source_id: adjustmentTxId
        });

        glTransactions.push({
          id: crypto.randomUUID(),
          account_number: '5003',
          transaction_date: transactionDate,
          description: adjustmentDescription,
          reference: adjustmentTxId,
          debit_amount: absoluteValueChange,
          credit_amount: 0,
          source_type: 'adjustment',
          source_id: adjustmentTxId
        });
      }

      const { error: glError } = await supabaseAdmin
        .from('GLTransaction')
        .insert(glTransactions);

      if (glError) {
        console.error('Failed to post GL transactions:', glError);
      } else {
        glPosted = true;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'QOH adjusted successfully',
      inventory_tx_id: adjustmentTxId,
      value_change: value_change,
      gl_posted: glPosted
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in processQOHAdjustment:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
