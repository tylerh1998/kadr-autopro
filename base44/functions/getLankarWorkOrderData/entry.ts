import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { woid } = body;

    if (!woid) {
      return Response.json({ error: 'woid is required' }, { status: 400 });
    }

    const infoResult = await supabase
      .from('LankarWOInfo')
      .select('*')
      .eq('woid', woid)
      .maybeSingle();

    if (infoResult.error) {
      return Response.json({ error: infoResult.error.message }, { status: 500 });
    }

    if (!infoResult.data) {
      return Response.json({ error: 'Lankar work order not found' }, { status: 404 });
    }

    const linesResult = await supabase
      .from('LankarWOLines')
      .select('*')
      .eq('woid', woid)
      .order('linenum', { ascending: true });

    if (linesResult.error) {
      return Response.json({ error: linesResult.error.message }, { status: 500 });
    }

    let customer = null;
    if (infoResult.data.cusid) {
      const customerResult = await supabase
        .from('Customer')
        .select('*')
        .eq('cusid', infoResult.data.cusid)
        .maybeSingle();

      if (!customerResult.error) {
        customer = customerResult.data || null;
      }
    }

    let vehicle = null;
    if (infoResult.data.vehid) {
      const vehicleResult = await supabase
        .from('Vehicle')
        .select('*')
        .eq('vehid', infoResult.data.vehid)
        .maybeSingle();

      if (!vehicleResult.error) {
        vehicle = vehicleResult.data || null;
      }
    }

    return Response.json({
      success: true,
      data: {
        info: infoResult.data,
        lines: linesResult.data || [],
        customer,
        vehicle
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});