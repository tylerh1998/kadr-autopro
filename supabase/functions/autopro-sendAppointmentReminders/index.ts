import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { logAndSendEmail } from '../_shared/resend.ts';

// Native port of base44/functions/sendAppointmentReminders/entry.ts (2026-08-10).
// See "Plans and Context/implementation_plan.md" for the full plan/context.
// Fixed MST offset (no DST adjustment) - deliberately matches the original, not a bug.
const MST_OFFSET_MS = -7 * 60 * 60 * 1000;

function formatMstDate(date: Date) {
  const mstDate = new Date(date.getTime() + MST_OFFSET_MS);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[mstDate.getUTCDay()]}, ${months[mstDate.getUTCMonth()]} ${mstDate.getUTCDate()}, ${mstDate.getUTCFullYear()}`;
}
function formatMstTime(date: Date) {
  const mstDate = new Date(date.getTime() + MST_OFFSET_MS);
  let hours = mstDate.getUTCHours();
  const minutes = mstDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);
  return `${hours}:${minutesStr} ${ampm}`;
}

Deno.serve(async (req) => {
  // System-invoked (pg_cron), not user-invoked - shared-secret gate instead of a user JWT.
  const cronSecret = Deno.env.get('AUTOPRO_CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Default-safe: test mode is ON unless explicitly disabled. While on, only the allowlisted
  // recipient actually gets sent to - everything else is logged as skipped, not sent.
  const testMode = Deno.env.get('REMINDER_TEST_MODE') !== 'false';
  const allowlistEmail = (Deno.env.get('REMINDER_ALLOWLIST_EMAIL') || 'tyler@kensauto.ca').toLowerCase();
  const fromEmail = Deno.env.get('SES_FROM_EMAIL') || 'noreply@kensauto.ca';

  try {
    const { data: appointments, error: apptError } = await supabase.from('Appointment').select('*');
    if (apptError) throw apptError;

    const now = new Date();
    const todayStr = new Date(now.getTime() + MST_OFFSET_MS).toISOString().split('T')[0];

    const remindersToSend = (appointments || []).filter((appt: any) => {
      if (!appt.reminders_email || !appt.start_time || appt.reminder_days_before === null || appt.reminder_days_before === undefined || appt.reminder_days_before < 0) return false;
      const appointmentMstTime = new Date(new Date(appt.start_time).getTime() + MST_OFFSET_MS);
      const reminderDate = new Date(appointmentMstTime);
      reminderDate.setDate(reminderDate.getDate() - appt.reminder_days_before);
      return reminderDate.toISOString().split('T')[0] === todayStr;
    });

    const results = [];

    for (const appt of remindersToSend) {
      let customer = null;
      if (appt.customer_id) {
        const { data } = await supabase.from('Customer').select('*').eq('id', appt.customer_id).maybeSingle();
        customer = data;
      }
      const recipientEmail = appt.reminder_email_address || customer?.email || null;

      if (!recipientEmail) {
        results.push({ appointment_id: appt.id, status: 'skipped_no_email' });
        continue;
      }

      // Idempotency guard - neither original base44 function had one; running this on a
      // schedule instead of an unknown manual trigger makes a same-day double-send a real risk.
      const { data: existingLog } = await supabase
        .from('SentEmailLog')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('status', 'sent')
        .gte('sent_date', `${todayStr}T00:00:00`)
        .limit(1)
        .maybeSingle();
      if (existingLog) {
        results.push({ appointment_id: appt.id, status: 'skipped_already_sent' });
        continue;
      }

      let vehicle = null;
      if (appt.vehicle_id) {
        const { data } = await supabase.from('Vehicle').select('*').eq('id', appt.vehicle_id).maybeSingle();
        vehicle = data;
      }

      const appointmentDateTime = new Date(appt.start_time);
      const appointmentTime = formatMstTime(appointmentDateTime);
      const appointmentDateStr = formatMstDate(appointmentDateTime);
      const vehicleDesc = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A';
      const subject = `Appointment Reminder for ${appointmentDateStr}`;

      // Test-mode allowlist gate - default-deny (fails closed): anything not an exact match
      // is skipped, not sent. See implementation_plan.md Risk #1/#7.
      if (testMode && recipientEmail.toLowerCase() !== allowlistEmail) {
        const nowIso = new Date().toISOString();
        await supabase.from('SentEmailLog').insert({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          to_email: recipientEmail,
          from_email: fromEmail,
          subject,
          body: `[TEST MODE - not sent] Would have reminded for ${appointmentDateStr} at ${appointmentTime}, vehicle: ${vehicleDesc}`,
          body_preview: 'Skipped - test mode',
          status: 'skipped_test_mode',
          sent_date: nowIso,
          customer_id: appt.customer_id || null,
          appointment_id: appt.id,
          created_date: nowIso,
        });
        results.push({ appointment_id: appt.id, status: 'skipped_test_mode', recipient: recipientEmail });
        continue;
      }

      const htmlBody = `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello ${customer?.first_name || 'Valued Customer'},</p>
          <p style="font-size: 16px; margin-bottom: 20px;">This is a friendly reminder about your upcoming appointment with Ken's Auto & Diesel Repair.</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb;">
            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b;">Appointment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Date:</td><td style="padding: 8px 0; color: #1e293b;">${appointmentDateStr}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Time:</td><td style="padding: 8px 0; color: #1e293b;">${appointmentTime}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Vehicle:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${vehicleDesc}</td></tr>
              ${appt.notes ? `<tr><td style="padding: 8px 0; color: #64748b; font-weight: 600; vertical-align: top;">Notes:</td><td style="padding: 8px 0; color: #1e293b;">${appt.notes}</td></tr>` : ''}
            </table>
          </div>
          <p style="font-size: 16px; margin-top: 20px;">If you need to reschedule, please call us at <strong style="color: #2563eb;">780-847-3002</strong>.</p>
          <p style="font-size: 16px; margin-top: 30px; color: #64748b;">Thank you,<br><strong style="color: #1e293b;">Ken's Auto & Diesel Repair</strong></p>
        </div>
      `;

      const sendResult = await logAndSendEmail(supabase, {
        to_email: recipientEmail,
        from_email: fromEmail,
        from_display_name: "Ken's Auto & Diesel Repair",
        subject,
        body: htmlBody,
        customer_id: appt.customer_id || null,
        appointment_id: appt.id,
      });

      results.push({ appointment_id: appt.id, status: sendResult.success ? 'sent' : 'failed', error: sendResult.error });
    }

    return new Response(JSON.stringify({ success: true, test_mode: testMode, processed: remindersToSend.length, results }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
