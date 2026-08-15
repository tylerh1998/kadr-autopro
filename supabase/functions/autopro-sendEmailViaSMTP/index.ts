import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendViaResend } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Sends email via Resend API with logging to SentEmailLog
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  let logIdToUpdate = null;
  let to, subject, body, from_name, work_order_id, customer_id, portal_url;

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

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY');
      return new Response(JSON.stringify({ error: 'Resend API key is not configured.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    ({ to, subject, body, from_name, work_order_id, customer_id, portal_url } = await req.json());

    // Support comma-separated recipients
    const recipients = to ? to.split(',').map((email) => email.trim()).filter(Boolean) : [];

    if (!to || recipients.length === 0 || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, body' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();
    const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    // Create log entry without tracking_id (will be set after Resend responds)
    const logInsert = await supabaseAdmin
      .from('SentEmailLog')
      .insert({
        id: newLogId,
        to_email: to,
        from_email: fromEmail,
        subject: subject,
        body_preview: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
        body: body,
        status: 'pending',
        sent_date: nowIso,
        customer_id: customer_id || null,
        work_order_id: work_order_id || null,
        tracking_id: null,
        portal_url: portal_url || null,
        created_date: nowIso,
        created_by: userEmail,
        created_by_id: authData.user.id,
      })
      .select('id')
      .single();

    if (logInsert.error) {
      console.error('Failed to create email log entry:', logInsert.error);
      return new Response(JSON.stringify({ error: 'Failed to create email log entry', details: logInsert.error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    logIdToUpdate = logInsert.data.id;

    // Build HTML body
    const htmlBody = `
        <div style="font-family: sans-serif; line-height: 1.6;">
            ${body}
        </div>
    `;

    const fromAddress = from_name ? `${from_name} <${fromEmail}>` : fromEmail;

    const result = await sendViaResend(resendApiKey, fromAddress, recipients, subject, htmlBody);

    // Update log with sent status and Resend's message ID
    await supabaseAdmin
      .from('SentEmailLog')
      .update({
        status: 'sent',
        tracking_id: result.id,
        updated_date: new Date().toISOString(),
      })
      .eq('id', logIdToUpdate);

    return new Response(JSON.stringify({ status: 'success', message: 'Email sent successfully', id: result.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error sending email via Resend:', error);

    // Update log to failed status if log was created
    if (logIdToUpdate) {
      await supabaseAdmin
        .from('SentEmailLog')
        .update({
          status: 'failed',
          status_message: error.message || 'Unknown error',
          updated_date: new Date().toISOString(),
        })
        .eq('id', logIdToUpdate)
        .then(({ error: updateErr }) => { if (updateErr) console.error("Failed to update log on error:", updateErr.message); });
    }

    // Send internal notification about the failure via a second Resend call
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";
      if (resendApiKey) {
        await sendViaResend(
          resendApiKey,
          fromEmail,
          ['shop@kensauto.ca'],
          `Email Sending Failed: ${subject || 'No Subject'}`,
          `<div style="font-family: sans-serif; line-height: 1.6;">
            <p>An email failed to send immediately via the API.</p>
            <p>Error: ${error.message}</p>
            <p>Details:<br>
            To: ${to}<br>
            Subject: ${subject}<br>
            Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })}</p>
          </div>`
        );
        console.log('Failure notification sent to shop@kensauto.ca');
      }
    } catch (notifyError) {
      console.error('Failed to send failure notification:', notifyError);
    }

    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
