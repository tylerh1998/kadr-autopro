import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildPayStubPdf } from "../_shared/payStubPdf.ts";

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

    const { stubId } = await req.json().catch(() => ({}));
    if (!stubId) {
      return res({ error: 'stubId is required' });
    }

    const { data: stub, error: stubError } = await supabase
      .from('PayPro_PayStub')
      .select('*')
      .eq('id', stubId)
      .maybeSingle();
    if (stubError) throw stubError;
    if (!stub) return res({ error: 'Pay stub not found' });

    // employee_id is the business key (e.g. EMP001), matching PayPro_Employee.employee_id -
    // not the system id.
    const { data: employee, error: employeeError } = await supabase
      .from('PayPro_Employee')
      .select('*')
      .eq('employee_id', stub.employee_id)
      .maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee) return res({ error: 'Employee not found' });

    const { data: taxYearConstant } = await supabase
      .from('PayPro_TaxYearConstant')
      .select('*')
      .eq('year', stub.year)
      .maybeSingle();

    const { pdfDataUri, filename } = buildPayStubPdf(stub, employee, taxYearConstant, { employerCopy: false });

    return res({ data: { pdfDataUri, filename } });
  } catch (error: any) {
    console.error('Error generating pay stub PDF:', error);
    return res({ error: error.message || 'Internal server error' });
  }
});
