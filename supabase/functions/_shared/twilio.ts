// Shared Twilio-sending + SentEmailLog logging helper for autopro-* functions that send SMS.
// Extracted 2026-08-10 from autopro-sendSms's already-proven logic - see
// "Plans and Context/implementation_plan.md" for the full audit. Behavior is unchanged.

import twilio from 'npm:twilio';

export interface TwilioSetup {
  // deno-lint-ignore no-explicit-any
  client: any;
  fromNumber: string;
}

// Returns null if any of the three required Twilio secrets are missing - callers should
// treat a null return as "Twilio is not configured" and fail gracefully, not throw.
export function createTwilioClient(): TwilioSetup | null {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromNumber) return null;
  return { client: twilio(accountSid, authToken), fromNumber };
}

export async function sendViaTwilio(setup: TwilioSetup, to: string, body: string, mediaUrl?: string[]) {
  const options: any = { from: setup.fromNumber, to };
  if (body) options.body = body;
  if (mediaUrl && mediaUrl.length > 0) options.mediaUrl = mediaUrl;
  return await setup.client.messages.create(options);
}

export interface LogAndSendSmsParams {
  to: string; // phone number
  body: string;
  subject?: string;
  customer_id?: string | null;
  work_order_id?: string | null;
  appointment_id?: string | null;
  portal_url?: string | null;
  created_by?: string | null;
  created_by_id?: string | null;
}

export interface LogAndSendSmsResult {
  success: boolean;
  sid?: string; // Twilio message SID
  logId?: string;
  error?: string;
}

// Inserts a `pending` SentEmailLog row (same shared table SMS and email both log to),
// sends via Twilio, updates the row to `sent`/`failed`. Mirrors logAndSendEmail's shape.
export async function logAndSendSms(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: LogAndSendSmsParams,
): Promise<LogAndSendSmsResult> {
  const setup = createTwilioClient();
  if (!setup) {
    return { success: false, error: 'Missing Twilio configuration (SID, Token, or Phone Number)' };
  }

  const nowIso = new Date().toISOString();
  const newLogId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

  const logInsert = await supabase
    .from('SentEmailLog')
    .insert({
      id: newLogId,
      to_email: params.to,
      from_email: 'system generated message',
      subject: params.subject ?? 'SMS Message',
      body: params.body,
      body_preview: params.body,
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
    return { success: false, error: `Failed to create SMS log entry: ${logInsert.error.message}` };
  }
  const logId = logInsert.data.id;

  try {
    const result = await sendViaTwilio(setup, params.to, params.body);
    await supabase
      .from('SentEmailLog')
      .update({ status: 'sent', tracking_id: result.sid, updated_date: new Date().toISOString() })
      .eq('id', logId);
    return { success: true, sid: result.sid, logId };
  } catch (error) {
    await supabase
      .from('SentEmailLog')
      .update({ status: 'failed', status_message: error.message || 'SMS Send Failed', updated_date: new Date().toISOString() })
      .eq('id', logId);
    return { success: false, error: error.message, logId };
  }
}
