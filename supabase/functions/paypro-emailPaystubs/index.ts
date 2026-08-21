import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildPayStubPdf } from "../_shared/payStubPdf.ts";
import { sendViaResend } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Decodes the JWT payload directly (no network call to auth.getUser()) - the gateway
// (verify_jwt: true) already validated the signature before this function runs.
const decodeJwtPayload = (token: string): any => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

// Same gate as public.staff_strong_auth() - RLS can't cover this function since it
// uses the service-role client, so the check has to be reimplemented here.
const hasStrongAuth = (claims: any): boolean => {
  if (!claims) return false;
  if (claims.aal === 'aal2') return true;
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.some((entry: any) => {
    const method = (entry?.method || '').toLowerCase();
    return method.includes('webauthn') || method.includes('passkey');
  });
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'Not Set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const res = (data: any) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res({ error: 'Authentication required' });
    }

    const claims = decodeJwtPayload(authHeader.substring(7));
    const mykadrUserId = claims?.sub;
    if (!mykadrUserId) {
      return res({ error: 'Invalid session token' });
    }
    if (!hasStrongAuth(claims)) {
      return res({ error: 'This action requires multi-factor authentication.' });
    }

    const { data: caller, error: callerError } = await supabase
      .from('Employee')
      .select('paypro_user')
      .eq('mykadr_user_id', mykadrUserId)
      .maybeSingle();
    if (callerError || !caller || caller.paypro_user !== true) {
      return res({ error: 'You do not have access to the payroll module.' });
    }

    const { payStubIds } = await req.json().catch(() => ({}));
    if (!payStubIds || !Array.isArray(payStubIds) || payStubIds.length === 0) {
      return res({ error: 'payStubIds is required and must be a non-empty array' });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return res({ error: 'Resend API key is not configured.' });
    }

    // Default-safe: test mode is ON unless explicitly disabled, same convention as
    // autopro-sendAppointmentReminders. Skipped sends are surfaced in this function's own
    // response, never in SentEmailLog - payroll email is never allowed to touch that table
    // (requirement #10), so there's no skipped_test_mode row to write here either.
    const testMode = Deno.env.get('PAYSTUB_TEST_MODE') !== 'false';
    const allowlistEmail = (Deno.env.get('PAYSTUB_ALLOWLIST_EMAIL') || 'tyler@kensauto.ca').toLowerCase();

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const stubId of payStubIds) {
      try {
        const { data: stub, error: stubError } = await supabase
          .from('PayPro_PayStub')
          .select('*')
          .eq('id', stubId)
          .maybeSingle();
        if (stubError) throw stubError;
        if (!stub) throw new Error(`Pay stub ${stubId} not found`);

        // employee_id is the business key (e.g. EMP001), matching PayPro_Employee.employee_id -
        // not the system id.
        const { data: employee, error: employeeError } = await supabase
          .from('PayPro_Employee')
          .select('*')
          .eq('employee_id', stub.employee_id)
          .maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee) throw new Error(`Employee ${stub.employee_id} not found`);

        // Re-check server-side even though EmailPaystubsModal.jsx already pre-filters this
        // client-side - never trust the client's filter alone for a payroll send.
        if (!employee.email) {
          throw new Error(`Employee ${employee.first_name} ${employee.last_name} has no email address`);
        }

        if (testMode && employee.email.toLowerCase() !== allowlistEmail) {
          skipped++;
          continue;
        }

        const { data: taxYearConstant } = await supabase
          .from('PayPro_TaxYearConstant')
          .select('*')
          .eq('year', stub.year)
          .maybeSingle();

        // In-process, not a second HTTP round-trip to the sibling PDF functions - same
        // Deno process, same deploy, just a function call (D3).
        const { pdfDataUri } = buildPayStubPdf(stub, employee, taxYearConstant, { employerCopy: false });
        const pdfBase64 = pdfDataUri.split(',')[1];

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Your Paystub is Ready</h2>
            <p>Hi ${employee.first_name},</p>
            <p>Your paystub for the pay period ending <strong>${formatDate(stub.pay_period_end)}</strong> is attached to this email.</p>
            <p><strong>Net Pay:</strong> $${(stub.net_pay || 0).toFixed(2)}<br>
               <strong>Pay Date:</strong> ${formatDate(stub.pay_date)}</p>
            <p>If you have any questions, please contact payroll.</p>
            <br/>
            <p>Best regards,<br><strong>Ken's Auto & Diesel Repair</strong></p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0 20px;" />
            <p style="color: #dc2626; font-size: 11px; line-height: 1.4; text-align: justify;">
              This communication is intended for the use of the recipient to which it is addressed, and may contain confidential, personal and or privileged information. Please contact us immediately if you are not the intended recipient of this communication, and do not copy, distribute, or take action relying on it. Any communication received in error, or subsequent reply, should be deleted or destroyed.
            </p>
          </div>
        `;

        await sendViaResend(
          resendApiKey,
          "Ken's Auto Payroll <payroll@kensauto.ca>",
          [employee.email],
          `Paystub for ${formatDate(stub.pay_period_end)}`,
          htmlContent,
          [{ filename: `Paystub_${formatDate(stub.pay_period_end).replace(/ /g, '_')}.pdf`, content: pdfBase64 }],
        );

        sent++;
      } catch (err: any) {
        console.error(`Error processing stub ${stubId}:`, err);
        failed++;
        errors.push(`Stub ${stubId}: ${err.message}`);
      }
    }

    return res({ data: { sent, skipped, failed, errors } });
  } catch (error: any) {
    console.error('Error sending paystub emails:', error);
    return res({ error: error.message || 'Internal server error' });
  }
});
