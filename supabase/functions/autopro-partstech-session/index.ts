import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
    const poNumber = ro_number.replace(/^(RO|WO-?)/i, '').trim();

    // Construct the webhook callback URL
    // e.g. https://<project>.supabase.co/functions/v1/autopro-partstech-callback?wo_id=RO12345
    const callbackUrl = `${supabaseUrl}/functions/v1/autopro-partstech-callback?wo_id=${encodeURIComponent(ro_number)}`;

    // Prepare PartsTech Payload
    const partsTechPayload: any = {
      callbackUrl,
      poNumber: poNumber, // Attempt to pass PO Number natively
    };

    if (vehicle) {
      partsTechPayload.vehicle = vehicle;
    }

    if (userInfo) {
      partsTechPayload.userInfo = userInfo;
    }

    // Make request to PartsTech session endpoint
    const response = await fetch("https://api.partstech.com/v1/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(partsTechPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PartsTech API Error:", response.status, errorText);
      throw new Error(`PartsTech API returned ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();

    return new Response(JSON.stringify({ success: true, data: responseData }), {
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
