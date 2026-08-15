// Shared Resend-sending + SentEmailLog logging helper, used by every autopro-* function
// that sends email. Extracted 2026-08-10 from 4 near-identical copies (autopro-sendEmailViaSMTP,
// autopro-sendStatementEmail, autopro-sendARReceiptEmail, autopro-sendBatchWorkOrderEmails) - see
// "Plans and Context/implementation_plan.md" for the full audit. sendViaResend below is a verbatim
// lift of what those functions already ran in production; behavior is unchanged.

export async function sendViaResend(
  resendApiKey: string,
  fromAddress: string,
  recipients: string[],
  subject: string,
  htmlBody: string,
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject: subject,
      html: htmlBody,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to send email via Resend');
  }
  return result;
}

export interface LogAndSendEmailParams {
  to_email: string;
  from_email: string;
  from_display_name?: string;
  subject: string;
  body: string; // HTML body - stored as-is and sent as-is
  body_preview?: string;
  customer_id?: string | null;
  work_order_id?: string | null;
  appointment_id?: string | null;
  portal_url?: string | null;
  created_by?: string | null;
  created_by_id?: string | null;
}

export interface LogAndSendEmailResult {
  success: boolean;
  id?: string; // Resend message id
  logId?: string;
  error?: string;
}

// Inserts a `pending` SentEmailLog row, sends via Resend, updates the row to `sent`/`failed`.
// Centralizes the exact row shape every native email function should use - every optional
// column is populated consistently (some duplicated call sites this replaces had drifted,
// e.g. one omitted `tracking_id: null` at insert time).
export async function logAndSendEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: LogAndSendEmailParams,
): Promise<LogAndSendEmailResult> {
  const nowIso = new Date().toISOString();
  const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

  const logInsert = await supabase
    .from('SentEmailLog')
    .insert({
      id: newLogId,
      to_email: params.to_email,
      from_email: params.from_email,
      subject: params.subject,
      body: params.body,
      body_preview: params.body_preview ?? params.body.substring(0, 100),
      status: 'pending',
      sent_date: nowIso,
      customer_id: params.customer_id ?? null,
      work_order_id: params.work_order_id ?? null,
      appointment_id: params.appointment_id ?? null,
      portal_url: params.portal_url ?? null,
      tracking_id: null,
      created_date: nowIso,
      created_by: params.created_by ?? null,
      created_by_id: params.created_by_id ?? null,
    })
    .select('id')
    .single();

  if (logInsert.error) {
    return { success: false, error: `Failed to create email log entry: ${logInsert.error.message}` };
  }
  const logId = logInsert.data.id;

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    await supabase
      .from('SentEmailLog')
      .update({ status: 'failed', status_message: 'Resend API key is not configured.', updated_date: new Date().toISOString() })
      .eq('id', logId);
    return { success: false, error: 'Resend API key is not configured.', logId };
  }

  const fromAddress = params.from_display_name ? `${params.from_display_name} <${params.from_email}>` : params.from_email;

  try {
    const result = await sendViaResend(resendApiKey, fromAddress, [params.to_email], params.subject, params.body);
    await supabase
      .from('SentEmailLog')
      .update({ status: 'sent', tracking_id: result.id, updated_date: new Date().toISOString() })
      .eq('id', logId);
    return { success: true, id: result.id, logId };
  } catch (error) {
    await supabase
      .from('SentEmailLog')
      .update({ status: 'failed', status_message: error.message || 'Unknown error', updated_date: new Date().toISOString() })
      .eq('id', logId);
    return { success: false, error: error.message, logId };
  }
}
