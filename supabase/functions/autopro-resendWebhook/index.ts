import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendViaResend } from "../_shared/resend.ts";

// Native port of base44/functions/resendWebhook/entry.ts (2026-08-14).
// Inbound callback from Resend - updates SentEmailLog.status as delivery events arrive
// (sent/delivered/bounced/complained/delivery_delayed/opened/clicked). No frontend caller;
// Resend's own servers POST here. 1:1 port - logic, status mapping, and the bounced/complained
// failure-notification side effect are unchanged from the original base44 version. No signature
// verification existed in the original either; not added here to keep this a faithful port.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatMountainTime(isoTimestamp: string | undefined) {
  if (!isoTimestamp) return '';
  const date = new Date(isoTimestamp);
  // Mountain Time is UTC-7 (MST) or UTC-6 (MDT) - fixed -7h offset, matches the original
  // (and every other MST-offset helper in this codebase's comms functions), not a bug to fix here.
  const mtOffset = -7 * 60;
  const localDate = new Date(date.getTime() + mtOffset * 60 * 1000);
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const hours = String(localDate.getUTCHours()).padStart(2, '0');
  const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
  return ` (${month}/${day}/${year} ${hours}:${minutes} MT)`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log('--- Resend webhook received (native v1) ---');

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    const eventType = payload.type;
    const data = payload.data;
    const timestamp = payload.created_at;

    const trackingId = data?.email_id;

    if (!trackingId) {
      console.log('No email_id found in webhook payload - skipping');
      return new Response(JSON.stringify({ success: true, message: 'No email_id found, skipped' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Processing event: ${eventType} for tracking_id: ${trackingId}`);

    const { data: emailLogs, error: findError } = await supabase
      .from('SentEmailLog')
      .select('*')
      .eq('tracking_id', trackingId);
    if (findError) throw findError;

    console.log(`Found ${emailLogs?.length || 0} matching logs`);

    if (!emailLogs || emailLogs.length === 0) {
      console.log(`No email log found for tracking_id: ${trackingId} - skipping`);
      return new Response(JSON.stringify({ success: true, message: 'Email log not found, skipped' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emailLog = emailLogs[0];
    console.log(`Updating email log ${emailLog.id} (current status: ${emailLog.status})`);
    const updates: Record<string, string> = {};

    const timeStr = formatMountainTime(timestamp);

    switch (eventType) {
      case 'email.sent':
        updates.status = 'sent';
        updates.status_message = `Email successfully sent${timeStr}`;
        break;
      case 'email.delivered':
        updates.status = 'delivered';
        updates.status_message = `Email delivered successfully${timeStr}`;
        break;
      case 'email.bounced':
        updates.status = 'bounced';
        updates.status_message = `Bounced: ${data?.bounce?.type || 'Unknown'} - ${data?.bounce?.reason || 'No reason provided'}${timeStr}`;
        break;
      case 'email.complained':
        updates.status = 'complained';
        updates.status_message = `Spam complaint received from recipient${timeStr}`;
        break;
      case 'email.delivery_delayed':
        updates.status = 'delivery_delayed';
        updates.status_message = `Delivery delayed: ${data?.delay?.reason || 'Unknown reason'}${timeStr}`;
        break;
      case 'email.opened':
        updates.status = 'opened';
        updates.status_message = `Email opened by recipient${timeStr}`;
        break;
      case 'email.clicked':
        updates.status = 'clicked';
        updates.status_message = `Link clicked by recipient${timeStr}`;
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('SentEmailLog')
        .update({ ...updates, updated_date: new Date().toISOString() })
        .eq('id', emailLog.id);
      if (updateError) throw updateError;
      console.log(`Updated email log ${emailLog.id}:`, updates);

      if (updates.status === 'bounced' || updates.status === 'complained') {
        try {
          const resendApiKey = Deno.env.get('RESEND_API_KEY');
          const fromEmail = Deno.env.get('SES_FROM_EMAIL') || 'noreply@kensauto.ca';
          if (resendApiKey) {
            await sendViaResend(
              resendApiKey,
              fromEmail,
              ['shop@kensauto.ca'],
              `Email Delivery Failed (${updates.status}): ${emailLog.subject || 'No Subject'}`,
              `
An email delivery failure occurred.

Status: ${updates.status}
Reason: ${updates.status_message}

Details:
To: ${emailLog.to_email}
Subject: ${emailLog.subject}
Tracking ID: ${trackingId}
Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })}
              `,
            );
            console.log('Failure notification sent to shop@kensauto.ca');
          }
        } catch (notifyError) {
          console.error('Failed to send failure notification:', notifyError);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Webhook processed successfully' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
