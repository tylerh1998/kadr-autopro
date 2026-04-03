import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabase
      .from('WorkOrder')
      .update({ LockedByUser: null, locked_timestamp: null })
      .not('LockedByUser', 'is', null)
      .select('id');

    if (error) {
      console.error('Error flushing work order locks:', error);
      return Response.json({ success: false, error: error.message || 'Failed to flush work order locks' }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: `Flushed locks on ${data ? data.length : 0} work order(s)`,
      flushedCount: data ? data.length : 0
    });

  } catch (error) {
    console.error('Error in flushWorkOrderLocks:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});