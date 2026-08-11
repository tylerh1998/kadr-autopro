import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { logAndSendSms } from '../_shared/twilio.ts';

// Native port of base44/functions/sendTextReminders/entry.ts (2026-08-10).
// See "Plans and Context/implementation_plan.md" for the full plan/context.
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
  const cronSecret = Deno.env.get('AUTOPRO_CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const testMode = Deno.env.get('REMINDER_TEST_MODE') !== 'false';
  const allowlistPhoneDigits = (Deno.env.get('REMINDER_ALLOWLIST_PHONE') || '+17808714320').replace(/\D/g, '');

  try {
    const { data: appointments, error: apptError } = await supabase.from('Appointment').select('*');
    if (apptError) throw apptError;

    const now = new Date();
    const todayStr = new Date(now.getTime() + MST_OFFSET_MS).toISOString().split('T')[0];

    const remindersToSend = (appointments || []).filter((appt: any) => {
      if (!appt.reminders_text || !appt.reminders_phone || !appt.start_time || appt.reminder_days_before === null || appt.reminder_days_before === undefined || appt.reminder_days_before < 0) return false;
      const appointmentMstTime = new Date(new Date(appt.start_time).getTime() + MST_OFFSET_MS);
      const reminderDate = new Date(appointmentMstTime);
      reminderDate.setDate(reminderDate.getDate() - appt.reminder_days_before);
      return reminderDate.toISOString().split('T')[0] === todayStr;
    });

    const results = [];

    for (const appt of remindersToSend) {
      const recipientPhone = appt.reminders_phone as string;
      const recipientDigits = recipientPhone.replace(/\D/g, '');

      // Idempotency guard - see autopro-sendAppointmentReminders for the same rationale.
      const { data: existingLog } = await supabase
        .from('SentEmailLog')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('status', 'sent')
        .eq('to_email', recipientPhone)
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
      const vehicleDesc = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your vehicle';

      const messageBody = `Ken's Auto Appointment Reminder\n${appointmentDateStr} at ${appointmentTime}\n${vehicleDesc}\nPlease call or text us at 780-847-3002 to reschedule or confirm. Please do not reply directly to this message.`;

      // Test-mode allowlist gate - default-deny (fails closed).
      if (testMode && recipientDigits !== allowlistPhoneDigits) {
        const nowIso = new Date().toISOString();
        await supabase.from('SentEmailLog').insert({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          to_email: recipientPhone,
          from_email: 'system generated message',
          subject: `Appointment Reminder for ${appointmentDateStr}`,
          body: `[TEST MODE - not sent] ${messageBody}`,
          body_preview: 'Skipped - test mode',
          status: 'skipped_test_mode',
          sent_date: nowIso,
          customer_id: appt.customer_id || null,
          appointment_id: appt.id,
          created_date: nowIso,
        });
        results.push({ appointment_id: appt.id, status: 'skipped_test_mode', recipient: recipientPhone });
        continue;
      }

      const sendResult = await logAndSendSms(supabase, {
        to: recipientPhone,
        body: messageBody,
        subject: `Appointment Reminder for ${appointmentDateStr}`,
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
