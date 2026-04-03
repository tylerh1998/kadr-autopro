import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

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

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false },
    });

    let searchTerm = '';
    let page = 1;
    let limit = 50;
    let includeInactive = false;
    
    try {
      const body = await req.json();
      searchTerm = body.searchTerm || '';
      if (body.page !== undefined) page = Number(body.page);
      if (body.limit !== undefined) limit = Number(body.limit);
      if (body.includeInactive !== undefined) includeInactive = Boolean(body.includeInactive);
    } catch {
      console.log('No JSON body, using defaults');
    }

    const skip = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const normalizedSearchTerm = searchTerm.trim();

    let vehicles = [];
    let totalCount = 0;

    if (normalizedSearchTerm) {
      const rpcPayload = {
        p_search_term: normalizedSearchTerm,
        p_include_inactive: includeInactive,
        p_limit: safeLimit,
        p_offset: skip,
      };

      const { data, error } = await supabase.rpc('search_vehicles_ranked', rpcPayload);

      if (error) {
        console.error('Supabase search_vehicles_ranked rpc error:', error);
        return Response.json({
          error: 'Failed to fetch vehicles',
          details: error.message,
          success: false
        }, { status: 500 });
      }

      const records = data || [];
      totalCount = records.length > 0 ? Number(records[0].total_count || 0) : 0;
      vehicles = records.map(({ total_count, match_rank, ...item }) => item);
    } else {
      // No search term - return paginated list of all vehicles
      let query = supabase
        .from('Vehicle')
        .select('*', { count: 'exact' });

      if (!includeInactive) {
        query = query.or('is_active.eq.true,is_active.is.null');
      }

      query = query.order('year', { ascending: false, nullsLast: true })
                   .order('make', { ascending: true, nullsLast: true })
                   .order('model', { ascending: true, nullsLast: true });
                   
      query = query.range(skip, skip + safeLimit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Supabase Vehicle query error:', error);
        return Response.json({ error: 'Failed to fetch vehicles', details: error.message, success: false }, { status: 500 });
      }

      vehicles = data || [];
      totalCount = count || 0;
    }

    const totalPages = Math.ceil(totalCount / safeLimit);

    // Fetch corresponding customers
    const customerIds = [...new Set(vehicles.map(v => v.customer_id).filter(Boolean))];
    let customers = [];
    if (customerIds.length > 0) {
      const { data: customerData, error: customerError } = await supabase
        .from('Customer')
        .select('*')
        .in('id', customerIds);
      
      if (!customerError) {
        customers = customerData || [];
      }
    }

    // Map customer names into the vehicle records as it was done previously
    const customerMap = new Map(customers.map(c => [c.id, c]));
    vehicles = vehicles.map(v => {
      const c = customerMap.get(v.customer_id);
      const customer_name = c ? (c.org_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : 'Unknown';
      return { ...v, customer_name };
    });

    return Response.json({
      success: true,
      vehicles,
      customers,
      pagination: {
        total: totalCount,
        page,
        limit: safeLimit,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error in searchVehicles:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});