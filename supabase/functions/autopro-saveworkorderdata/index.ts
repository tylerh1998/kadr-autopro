import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let debugLog: string[] = [];
  const log = (msg: string) => { debugLog.push(msg); console.log(msg); };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    // Initialize Supabase Client with Service Role Key for writing
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    // Initialize Supabase Client with Anon Key for validating auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !data?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = data.user;

    // Parse the request body
    const body = await req.json();
    const { ro_number, data: payloadData } = body;

    if (!ro_number) {
      return new Response(JSON.stringify({ error: "Missing ro_number parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payloadData) {
      return new Response(JSON.stringify({ error: "Missing data parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedColumns = [
      "ro_number", "wo_number", "est_number", "inv_number", "crinv_number",
      "customer_id", "vehicle_id", "status", "kanban_order", "priority",
      "stage", "approval", "converted", "LockedByUser", "description",
      "odometer", "labor_rate", "parts_total", "labor_total", "shop_supply_total",
      "tax_amount", "total_amount", "est_date", "wo_date", "completed_date",
      "invoice_date", "internal_notes", "line_items", "payments", "amount_paid",
      "notes_to_customer", "po_number", "cvip", "default_taxable",
      "accounting_details", "tech_time", "last_updated", "last_updated_by",
      "completed_by", "created_at", "updated_at", "created_by", "created_date",
      "locked_timestamp", "session_id"
    ];

    const cleanPayload: any = {};
    for (const key of Object.keys(payloadData)) {
      if (allowedColumns.includes(key)) {
        cleanPayload[key] = payloadData[key];
      }
    }

    // Inject user identity and update timestamp
    const now = new Date().toISOString();
    const updatedData = {
      ...cleanPayload,
      last_updated: now,
      last_updated_by: user.email,
    };

    // If the status is being set to Completed, set completed_by
    if (payloadData.status === "Completed" && !payloadData.completed_by) {
      updatedData.completed_by = user.email;
    }

    // Clean up fields that might not be in the database columns or need serialization
    // In our buildWorkOrderSavePayload, line_items and payments are JSON.stringified.
    // If they are sent as strings, we parse them. The JSONB column accepts JSON objects/arrays directly.
    if (typeof updatedData.line_items === "string") {
      try {
        updatedData.line_items = JSON.parse(updatedData.line_items);
      } catch (_) {
        // keep as is
      }
    }
    if (typeof updatedData.payments === "string") {
      try {
        updatedData.payments = JSON.parse(updatedData.payments);
      } catch (_) {
        // keep as is
      }
    }
    if (typeof updatedData.accounting_details === "string") {
      try {
        updatedData.accounting_details = JSON.parse(updatedData.accounting_details);
      } catch (_) {
        // keep as is
      }
    }

    // Perform database update
    const { data: dbResult, error: dbError } = await supabaseAdmin
      .from("WorkOrder")
      .update(updatedData)
      .eq("ro_number", ro_number)
      .select();

    if (dbError) {
      log(`Database update error: ${dbError.message}`);
      return new Response(JSON.stringify({ error: `Failed to update work order: ${dbError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: dbResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    log(`Outer catch error: ${error?.message || error}`);
    return new Response(JSON.stringify({ error: error?.message || error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
