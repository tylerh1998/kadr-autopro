import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { appliedStartDate, appliedEndDate } = await req.json();

    if (!appliedStartDate || !appliedEndDate) {
      return Response.json({
        success: false,
        error: 'Missing required parameters: appliedStartDate, appliedEndDate'
      }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data: transactions, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('*')
      .gte('transaction_date', appliedStartDate)
      .lte('transaction_date', appliedEndDate)
      .order('transaction_date', { ascending: false })
      .order('created_date', { ascending: false });

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
    }

    return Response.json({
      success: true,
      transactions: transactions || []
    });
  } catch (error) {
    console.error('Error in getGLJournalData:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});