import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // Webhooks are usually POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE configuration variables.");
    }

    // Initialize Supabase Client with Service Role Key for writing
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Extract wo_id from query params
    const url = new URL(req.url);
    const wo_id = url.searchParams.get("wo_id");

    if (!wo_id) {
      console.error("Missing wo_id in webhook callback URL");
      return new Response(JSON.stringify({ error: "Missing wo_id parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse payload from PartsTech
    const payload = await req.json();
    console.log(`Received webhook for WO: ${wo_id}`, JSON.stringify(payload));

    // Insert into PartsTechCart staging table
    const { error: dbError } = await supabaseAdmin
      .from("PartsTechCart")
      .insert({
        wo_id: wo_id,
        payload: payload,
        status: "pending"
      });

    if (dbError) {
      console.error(`Database insert error: ${dbError.message}`);
      throw dbError;
    }

    // Return 200 OK to acknowledge receipt
    return new Response(JSON.stringify({ success: true, message: "Cart received" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`Webhook error: ${error?.message || error}`);
    // PartsTech might retry if we return 500, but we log the error
    return new Response(JSON.stringify({ error: error?.message || error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
