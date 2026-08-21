import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL_SECONDS = 300; // opened once per click, not emailed/long-lived

// Decodes the JWT payload directly (no network call to auth.getUser(), which fails
// for this app's cross-project/SSO-issued tokens). The gateway (verify_jwt: true)
// already validated the signature before this function runs.
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

// Same gate as public.staff_strong_auth() -- RLS can't cover this function since it
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
    headers: { ...corsHeaders, "Content-Type": "application/json" }
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

    const { data: employee, error: employeeError } = await supabase
      .from('Employee')
      .select('paypro_user')
      .eq('mykadr_user_id', mykadrUserId)
      .maybeSingle();

    if (employeeError || !employee || employee.paypro_user !== true) {
      return res({ error: 'You do not have access to the payroll module.' });
    }

    const body = await req.json().catch(() => ({}));
    const { file_id } = body || {};
    if (!file_id) {
      return res({ error: 'file_id is required' });
    }

    const { data: fileRow, error: fileError } = await supabase
      .from('PayPro_EmployeeFile')
      .select('file_url')
      .eq('id', file_id)
      .maybeSingle();

    if (fileError || !fileRow || !fileRow.file_url) {
      return res({ error: 'File not found.' });
    }

    // Pre-existing rows (imported before 3B) still point at base44 URLs, not a
    // storage path - not something createSignedUrl can resolve (D3, deferred
    // migration). Give a clear error instead of a confusing storage 404.
    if (/^https?:\/\//i.test(fileRow.file_url)) {
      return res({ error: 'This file has not yet been migrated to the new storage system and cannot be previewed here.' });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from('kadr-employee-files')
      .createSignedUrl(fileRow.file_url, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return res({ error: signError?.message || 'Failed to create signed URL.' });
    }

    return res({ signedUrl: signed.signedUrl });
  } catch (error) {
    console.error('Error creating employee file signed URL:', error);
    return res({ error: error.message });
  }
});
