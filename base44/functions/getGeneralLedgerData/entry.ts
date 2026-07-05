import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data: accounts, error: rpcError } = await supabase.rpc('get_general_ledger_data', {
      start_date: startDate,
      end_date: endDate
    });

    if (rpcError) {
      throw new Error(`Failed to fetch General Ledger data from Supabase RPC: ${rpcError.message}`);
    }

    // Map RPC data to ensure numbers are correctly typed (Supabase returns numeric/bigint as strings depending on client config)
    const formattedAccounts = (accounts || []).map(acc => ({
      ...acc,
      own_balance: Number(acc.own_balance) || 0,
      transactionCount: Number(acc.transactionCount) || 0
    }));

    return Response.json({
      success: true,
      accounts: formattedAccounts
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});