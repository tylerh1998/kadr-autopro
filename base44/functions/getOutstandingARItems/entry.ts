import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('Supabase_project_url');
  const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false }
  });
};

Deno.serve(async (req) => {
  try {
    // 1. Authenticate Request
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await req.json();

    if (!customerId) {
      return Response.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    // 2. Call the perfected SQL function
    // This handles all the math, timezone dates, and work order joins internally
    const { data, error } = await supabase.rpc('get_outstanding_ar_items', {
      customer_id_val: customerId
    });

    if (error) {
      console.error("SQL Error:", error);
      throw error;
    }

    // 3. Return the exact shape the UI expects
    return Response.json({
      success: true,
      items: data || []
    });

  } catch (error) {
    console.error('Error in getOutstandingARItems:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});
