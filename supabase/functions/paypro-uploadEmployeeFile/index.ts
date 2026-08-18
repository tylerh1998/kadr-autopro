import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024; // matches kadr-employee-files bucket's file_size_limit
const DATA_URL_PREFIX = "data:application/pdf;base64,";

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
      .select('email, paypro_user')
      .eq('mykadr_user_id', mykadrUserId)
      .maybeSingle();

    if (employeeError || !employee || employee.paypro_user !== true) {
      return res({ error: 'You do not have access to the payroll module.' });
    }

    const { body } = await req.json().catch(() => ({ body: {} }));
    const { employee_id, file_content, file_name, document_date, notes } = body || {};

    if (!employee_id || !file_content || !file_name || !document_date) {
      return res({ error: 'employee_id, file_content, file_name, and document_date are required' });
    }

    if (typeof file_content !== 'string' || !file_content.startsWith(DATA_URL_PREFIX)) {
      return res({ error: 'Only PDF files are supported.' });
    }

    const base64Body = file_content.slice(DATA_URL_PREFIX.length);
    let bytes: Uint8Array;
    try {
      const binary = atob(base64Body);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return res({ error: 'File content is not valid base64.' });
    }

    if (bytes.byteLength === 0) {
      return res({ error: 'Uploaded file is empty.' });
    }
    if (bytes.byteLength > MAX_BYTES) {
      return res({ error: 'File exceeds the 10MB size limit.' });
    }

    const storagePath = `${employee_id}/${crypto.randomUUID()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('kadr-employee-files')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });

    if (uploadError) throw uploadError;

    const nowIso = new Date().toISOString();
    const row = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      employee_id,
      file_url: storagePath,
      file_name,
      document_date,
      notes: notes ?? null,
      upload_date: nowIso.split('T')[0],
      created_date: nowIso,
      updated_date: nowIso,
      created_by: employee.email ?? null,
      created_by_id: mykadrUserId,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('PayPro_EmployeeFile')
      .insert(row)
      .select()
      .single();

    if (insertError) throw insertError;

    return res({ data: inserted });
  } catch (error) {
    console.error('Error uploading employee file:', error);
    return res({ error: error.message });
  }
});
