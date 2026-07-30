import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("PARTSTECH_API_KEY");
    if (!apiKey) {
      throw new Error("Missing PARTSTECH_API_KEY environment variable.");
    }

    // Since Deno.env doesn't directly give us the project URL cleanly in all environments,
    // we can construct it if SUPABASE_URL is available.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      throw new Error("Missing SUPABASE_URL environment variable.");
    }

    const body = await req.json();
    const { ro_number, vehicle, userInfo } = body;

    if (!ro_number) {
      return new Response(JSON.stringify({ error: "Missing ro_number parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip "RO" or "WO-" prefix for the PO number
    const poNumber = String(ro_number).replace(/^(RO|WO-?)/i, '').trim();

    // Construct the webhook callback URL
    // e.g. https://<project>.supabase.co/functions/v1/autopro-partstech-callback?wo_id=RO12345
    const callbackUrl = `${supabaseUrl}/functions/v1/autopro-partstech-callback?wo_id=${encodeURIComponent(ro_number)}`;

    // Construct the PartsTech Punchout URL
    const baseUrl = "https://app.partstech.com/punchout";
    const params = new URLSearchParams({
      apiKey: apiKey,
      callbackUrl: callbackUrl,
      returnUrl: callbackUrl,
      poNumber: poNumber,
    });

    if (vehicle) {
      if (vehicle.vin) params.append("vin", vehicle.vin);
      if (vehicle.year) params.append("year", vehicle.year.toString());
      if (vehicle.make) params.append("make", vehicle.make);
      if (vehicle.model) params.append("model", vehicle.model);
    }
    
    const iframeUrl = `${baseUrl}?${params.toString()}`;

    // Return the URL directly to the frontend so it can embed the iframe
    return new Response(JSON.stringify({ success: true, data: { url: iframeUrl } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Session creation error:", error);
    return new Response(JSON.stringify({ error: error?.message || error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
