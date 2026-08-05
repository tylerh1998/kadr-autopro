import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res({ success: false, error: 'Authentication required' });
    }

    const claims = decodeJwtPayload(authHeader.substring(7));
    const mykadrUserId = claims?.sub;
    const jwtEmail = claims?.email;
    if (!mykadrUserId) {
      return res({ success: false, error: 'Invalid session token' });
    }

    const { data: employee, error: employeeError } = await supabase
      .from('Employee')
      .select('full_name, email')
      .eq('mykadr_user_id', mykadrUserId)
      .single();

    if (employeeError || !employee) {
      return res({
        success: false,
        error: 'Your myKADR account is not linked to an Employee record. Please ask your administrator to add you in the Employee table.'
      });
    }

    const userDisplay = employee.full_name || employee.email || jwtEmail || mykadrUserId;

    const payload = await req.json().catch(() => ({}));
    const {
      cp_id,
      customer_id,
      statement_date,
      transactions,
      aged_balances,
      total_balance_due,
      is_sample
    } = payload;

    if (!cp_id || !customer_id || !statement_date) {
      return res({ success: false, error: 'cp_id, customer_id, and statement_date are required' });
    }

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const row: Record<string, any> = {
      id,
      cp_id,
      customer_id,
      statement_date,
      transactions: transactions ?? [],
      aged_balances: aged_balances ?? {},
      total_balance_due: total_balance_due ?? 0,
      created_date: nowIso,
      updated_date: nowIso,
      created_by: userDisplay,
      created_by_id: mykadrUserId
    };

    if (is_sample === true) {
      row.is_sample = true;
    }

    const { error: insertError } = await supabase
      .from('CustomerPortalStatement')
      .insert(row);

    if (insertError) throw insertError;

    return res({ success: true, cp_id });
  } catch (error) {
    console.error('Error creating statement:', error);
    return res({ success: false, error: error.message });
  }
});
