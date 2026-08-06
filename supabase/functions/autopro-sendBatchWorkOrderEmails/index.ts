import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function getWorkOrderNumber(workOrder: any) {
  return workOrder?.inv_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.ro_number || '';
}

function buildHtml({ customerName, total, paid, balance, portalUrl }: { customerName: string; total: number; paid: number; balance: number; portalUrl: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <p style="font-size: 16px; margin-bottom: 20px;">Hello ${customerName},</p>
      <p style="font-size: 16px; margin-bottom: 20px;">Please find your work order details below:</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Total:</td>
            <td style="padding: 8px 0; text-align: right;">$${Number(total || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Paid:</td>
            <td style="padding: 8px 0; text-align: right;">$${Number(paid || 0).toFixed(2)}</td>
          </tr>
          <tr style="border-top: 2px solid #dee2e6;">
            <td style="padding: 8px 0; font-weight: 700; font-size: 18px;">Balance Due:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 18px; color: #2563eb;">$${Number(balance || 0).toFixed(2)}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 16px; margin-bottom: 10px;">You can also view it online by following this link:</p>
      <p style="margin-bottom: 30px;"><a href="${portalUrl}" style="color: #2563eb; text-decoration: none;">${portalUrl}</a></p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">View Work Order</a>
      </div>
      <p style="font-size: 16px; margin-top: 30px;">Thank you,<br>Ken's Auto & Diesel Repair</p>
    </div>
  `;
}

async function sendViaResend(resendApiKey: string, fromAddress: string, recipients: string[], subject: string, htmlBody: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject: subject,
      html: htmlBody
    })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to send email via Resend');
  }
  return result;
}

// Sends one email per selected work order via Resend API, logging each to SentEmailLog
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

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

    const { to, customer, workOrders } = await req.json();

    if (!to || !customer || !Array.isArray(workOrders) || workOrders.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const customerName = customer.org_name && String(customer.org_name).trim() !== ''
      ? customer.org_name
      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    const fromAddress = `Ken's Auto & Diesel Repair <${fromEmail}>`;
    const results = [];

    for (const workOrder of workOrders) {
      const number = getWorkOrderNumber(workOrder);
      const total = Number(workOrder.total_amount || 0);
      const paid = Number(workOrder.amount_paid || 0);
      const balance = total - paid;
      const portalUrl = workOrder.portal_url;
      const label = `Invoice #${number}`;

      if (!portalUrl) {
        results.push({
          work_order_id: workOrder.id,
          label,
          success: false,
          message: 'Missing portal URL'
        });
        continue;
      }

      const subject = `Invoice #${number} from Ken's Auto & Diesel Repair`;
      const htmlBody = buildHtml({ customerName, total, paid, balance, portalUrl });

      const nowIso = new Date().toISOString();
      const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      let logIdToUpdate: string | null = null;

      try {
        const logInsert = await supabaseAdmin
          .from('SentEmailLog')
          .insert({
            id: newLogId,
            to_email: to,
            from_email: fromEmail,
            subject,
            body_preview: subject,
            body: htmlBody,
            status: 'pending',
            sent_date: nowIso,
            customer_id: workOrder.customer_id || customer.id || null,
            work_order_id: workOrder.id || null,
            tracking_id: null,
            portal_url: portalUrl,
            created_date: nowIso,
            created_by: userEmail,
            created_by_id: authData.user.id,
          })
          .select('id')
          .single();

        if (!logInsert.error) {
          logIdToUpdate = logInsert.data.id;
        }

        const sendResult = await sendViaResend(resendApiKey, fromAddress, [to], subject, htmlBody);

        if (logIdToUpdate) {
          await supabaseAdmin
            .from('SentEmailLog')
            .update({ status: 'sent', tracking_id: sendResult.id, updated_date: new Date().toISOString() })
            .eq('id', logIdToUpdate);
        }

        results.push({
          work_order_id: workOrder.id,
          label,
          success: true,
          message: 'Email sent successfully'
        });
      } catch (error) {
        if (logIdToUpdate) {
          await supabaseAdmin
            .from('SentEmailLog')
            .update({ status: 'failed', status_message: error.message || 'Unknown error', updated_date: new Date().toISOString() })
            .eq('id', logIdToUpdate)
            .then(({ error: updateErr }: any) => { if (updateErr) console.error('Failed to update log on error:', updateErr.message); });
        }
        results.push({
          work_order_id: workOrder.id,
          label,
          success: false,
          message: error.message
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error in autopro-sendBatchWorkOrderEmails:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
