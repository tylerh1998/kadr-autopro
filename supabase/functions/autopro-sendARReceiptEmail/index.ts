import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const parseArApplyTo = (value: any) => {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};

const parseAppliedData = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildAppliedDetails = async (supabase: any, payment: any) => {
  if (!payment.customer_id) return [];

  const { data: customerData, error: customerDataError } = await supabase.rpc('get_customer_ar_data', {
    customer_id_val: payment.customer_id
  });
  if (customerDataError) throw customerDataError;

  const rowMap = Object.fromEntries((customerData || []).map((row: any) => [row.transaction_id, row]));
  const paymentRow = rowMap[payment.id];
  const rpcAppliedData = parseAppliedData(paymentRow?.applied_data);
  const parsedAppliedData = rpcAppliedData.length
    ? rpcAppliedData
    : parseArApplyTo(payment.ar_applyto);

  return parsedAppliedData
    .map((item: any) => {
      const id = item?.id;
      const amountApplied = Number(item?.amount) || 0;
      if (!id) return null;

      const row = rowMap[id];
      if (!row) {
        return { id, reference: '', date: null, description: item?.description || '', amountApplied };
      }

      return {
        id,
        reference: row.reference || '',
        date: row.txn_date ? String(row.txn_date).slice(0, 10) : null,
        description: item?.description || row.description || '',
        amountApplied
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const dateA = a.date || '9999-12-31';
      const dateB = b.date || '9999-12-31';
      return dateA.localeCompare(dateB);
    });
};

const formatPaymentMethod = (method: string) => {
  if (!method) return 'Unknown';
  return method.replace(/_/g, ' ').split(' ').map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let logIdToUpdate: string | null = null;
  let toEmail: string | undefined, subject: string | undefined, body: string | undefined;

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

    let paymentId: string;
    ({ paymentId, toEmail, subject, body } = await req.json());

    if (!paymentId || !toEmail || !subject || !body) {
      return new Response(JSON.stringify({ error: 'paymentId, toEmail, subject, and body are required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('CustomerPayments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: customer, error: customerError } = await supabase
      .from('Customer')
      .select('*')
      .eq('id', payment.customer_id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appliedDetails = await buildAppliedDetails(supabase, payment);

    let appliedItemsHtml = '';
    if (appliedDetails.length > 0) {
      appliedItemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 0;">
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Reference</th>
            <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Description</th>
            <th style="padding: 4px 6px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Amount Applied</th>
          </tr>
          ${appliedDetails.map((d: any) => `
            <tr>
              <td style="padding: 4px 6px; border: 1px solid #ddd; font-size: 12px;">${d.reference}</td>
              <td style="padding: 4px 6px; border: 1px solid #ddd; font-size: 12px;">${d.description}</td>
              <td style="padding: 4px 6px; text-align: right; border: 1px solid #ddd; font-size: 12px;">$${d.amountApplied.toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    const customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    const paymentDateFormatted = new Date(payment.payment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.3;">
        <div style="background-color: #1e40af; color: white; padding: 8px; text-align: center;">
          <h1 style="margin: 0; font-size: 18px;">Payment Receipt</h1>
          <p style="margin: 0; font-size: 12px;">Ken's Auto & Diesel Repair</p>
        </div>
        <div style="padding: 8px; background-color: #f9fafb;">
          <p style="margin: 0 0 6px 0; font-size: 13px;">Hello ${customerName},</p>
          <p style="margin: 0 0 6px 0; font-size: 13px;">${body.replace(/\n\n+/g, '<br>').replace(/\n/g, ' ')}</p>
          <div style="background-color: white; padding: 6px 8px; border-radius: 4px; margin: 0 0 6px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Payment Date:</strong></td>
                <td style="text-align: right; font-size: 13px;">${paymentDateFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Payment Method:</strong></td>
                <td style="text-align: right; font-size: 13px;">${formatPaymentMethod(payment.payment_method)}</td>
              </tr>${payment.reference ? `
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Reference:</strong></td>
                <td style="text-align: right; font-size: 13px;">${payment.reference}</td>
              </tr>` : ''}
              <tr style="border-top: 2px solid #1e40af;">
                <td style="padding: 4px 0 0 0; font-size: 14px;"><strong>Total Payment:</strong></td>
                <td style="text-align: right; font-size: 14px; color: #1e40af; padding-top: 4px;"><strong>$${(payment.amount || 0).toFixed(2)}</strong></td>
              </tr>
            </table>
          </div>${appliedDetails.length > 0 ? `<p style="margin: 0 0 2px 0; font-size: 13px;"><strong>Applied To:</strong></p>${appliedItemsHtml}` : ''}
          <p style="margin: 8px 0 4px 0; font-size: 12px;">If you have any questions about this payment, please don't hesitate to contact us.</p>
          <p style="margin: 0; font-size: 12px;">Best regards,<br><strong>Ken's Auto & Diesel Repair</strong></p>
        </div>
        <div style="background-color: #374151; color: #9ca3af; padding: 6px; text-align: center; font-size: 10px;">
          <p style="margin: 0;">5002 49 Ave • PO Box 160 • Dewberry, AB T0B 1G0 | Phone: 780-847-3002 | Email: Shop@kensauto.ca</p>
        </div>
      </div>
    `;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY');
      return new Response(JSON.stringify({ error: 'Resend API key is not configured.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();
    const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const logInsert = await supabase
      .from('SentEmailLog')
      .insert({
        id: newLogId,
        to_email: toEmail,
        from_email: fromEmail,
        subject: subject,
        body_preview: body.substring(0, 255),
        body: htmlBody,
        status: 'pending',
        sent_date: nowIso,
        customer_id: customer.id,
        created_date: nowIso,
        created_by: userEmail,
        created_by_id: authData.user.id,
      })
      .select('id')
      .single();

    if (logInsert.error) {
      console.error('Failed to create SentEmailLog record:', logInsert.error);
    } else {
      logIdToUpdate = logInsert.data.id;
    }

    const fromAddress = `Ken's Auto & Diesel Repair <${fromEmail}>`;
    const emailResult = await sendViaResend(resendApiKey, fromAddress, [toEmail], subject, htmlBody);

    if (logIdToUpdate) {
      await supabase
        .from('SentEmailLog')
        .update({ status: 'sent', tracking_id: emailResult.id, updated_date: new Date().toISOString() })
        .eq('id', logIdToUpdate);
    }

    return new Response(JSON.stringify({ success: true, message: `Receipt sent to ${toEmail}`, id: emailResult.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error('Error in autopro-sendARReceiptEmail:', error);

    if (logIdToUpdate) {
      await supabase
        .from('SentEmailLog')
        .update({ status: 'failed', status_message: error.message || 'Unknown error', updated_date: new Date().toISOString() })
        .eq('id', logIdToUpdate)
        .then(({ error: updateErr }: any) => { if (updateErr) console.error('Failed to update log on error:', updateErr.message); });
    }

    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
