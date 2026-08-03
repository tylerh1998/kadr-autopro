import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import twilio from "npm:twilio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

const twilioClient = new twilio(accountSid, authToken);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  let logId = null;

  try {
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

    const { to, message, subject, customer_id, work_order_id, portal_url } = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'Missing "to" or "message" parameter' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();
    const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const logInsert = await supabaseAdmin
      .from('SentEmailLog')
      .insert({
        id: newLogId,
        to_email: to,
        from_email: 'system generated message',
        subject: subject || 'SMS Message',
        body: message,
        body_preview: message,
        status: 'pending',
        sent_date: nowIso,
        customer_id: customer_id || null,
        work_order_id: work_order_id || null,
        portal_url: portal_url || null,
        tracking_id: null,
        created_date: nowIso,
        created_by: userEmail,
        created_by_id: authData.user.id,
      })
      .select('id')
      .single();

    if (logInsert.error) {
      console.error('Failed to create SMS log entry:', logInsert.error);
      return new Response(JSON.stringify({ error: 'Failed to create SMS log entry', details: logInsert.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    logId = logInsert.data.id;

    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });

    await supabaseAdmin
      .from('SentEmailLog')
      .update({
        status: 'sent',
        tracking_id: result.sid,
        updated_date: new Date().toISOString(),
      })
      .eq('id', logId);

    return new Response(JSON.stringify({
      success: true,
      sid: result.sid,
      status: result.status
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    if (logId) {
      try {
        await supabaseAdmin
          .from('SentEmailLog')
          .update({
            status: 'failed',
            status_message: error.message || 'SMS Send Failed',
            updated_date: new Date().toISOString(),
          })
          .eq('id', logId);
      } catch (updateError) {
        console.error('Failed to update SMS log status:', updateError);
      }
    }

    console.error('Twilio Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
