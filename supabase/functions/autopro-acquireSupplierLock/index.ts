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

    let user = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = { email: authUser.email, id: authUser.id };
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const { supplierId } = await req.json();

    if (!supplierId) {
      return res({ success: false, error: 'supplierId is required' });
    }

    const escapedEmail = String(user.email || '').replaceAll('"', '\\"');

    const { data: lockedSupplier, error: updateError } = await supabase
      .from('Supplier')
      .update({ LockedByUser: user.email })
      .eq('id', supplierId)
      .or(`LockedByUser.is.null,LockedByUser.eq."",LockedByUser.eq."${escapedEmail}"`)
      .select('id, name, LockedByUser')
      .maybeSingle();

    if (updateError) {
      return res({ success: false, error: updateError.message || 'Failed to acquire supplier lock' });
    }

    if (lockedSupplier) {
      return res({
        success: true,
        lockAcquired: true,
        supplierId: lockedSupplier.id,
        lockedByUser: user.email
      });
    }

    const { data: supplier, error: readError } = await supabase
      .from('Supplier')
      .select('id, name, LockedByUser')
      .eq('id', supplierId)
      .maybeSingle();

    if (readError) {
      return res({ success: false, error: readError.message || 'Failed to read supplier lock status' });
    }

    if (!supplier) {
      return res({ success: false, error: 'Supplier not found' });
    }

    const lockedByUser = supplier.LockedByUser || '';

    return res({
      success: false,
      lockAcquired: false,
      lockedByUser,
      message: lockedByUser
        ? `Edit lock was not obtained. ${lockedByUser} locked this supplier before your lock completed.`
        : 'Edit lock was not obtained.'
    });
  } catch (error: any) {
    console.error('Error in acquireSupplierLock:', error);
    return res({ success: false, error: error.message || 'Failed to acquire supplier lock' });
  }
});
