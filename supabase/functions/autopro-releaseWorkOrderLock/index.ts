import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let userEmail: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          userEmail = authUser.email ?? null;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    if (!userEmail) {
      return res({ success: false, error: 'Unable to resolve authenticated user from request' });
    }

    const { roNumber } = await req.json();

    if (!roNumber) {
      return res({ success: false, error: 'roNumber is required' });
    }

    // set_workorder_lock's own 'release' branch is already ownership-scoped (only clears if
    // still held by this user, or already null) - safe to call without a separate check-then-act.
    const { data: releasedWorkOrder, error: rpcError } = await supabase.rpc('set_workorder_lock', {
      p_ro_number: roNumber,
      p_action: 'release',
      p_locked_by_user: userEmail,
    });

    if (rpcError) {
      return res({ success: false, error: rpcError.message || 'Failed to release work order lock' });
    }

    return res({
      success: true,
      lockReleased: !releasedWorkOrder?.LockedByUser,
      roNumber
    });
  } catch (error: any) {
    console.error('Error in releaseWorkOrderLock:', error);
    return res({ success: false, error: error.message || 'Failed to release work order lock' });
  }
});
