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

    if (normalizedSearchTerm) {
      const rpcPayload = {
        p_search_term: normalizedSearchTerm,
        p_include_inactive: includeInactive,
        p_limit: safeLimit,
        p_offset: skip,
      };

      const { data, error } = await supabase.rpc('search_customers_ranked', rpcPayload);

      if (error) {
        console.error('Supabase search_customers_ranked rpc error:', error);
        return Response.json({
          error: 'Failed to fetch customers',
          details: error.message,
          success: false
        }, { status: 500 });
      }

      const records = data || [];
      const totalCount = records.length > 0 ? Number(records[0].total_count || 0) : 0;
      const totalPages = Math.ceil(totalCount / safeLimit);
      const cleanedRecords = records.map(({ total_count, match_rank, ...item }) => item);

      return Response.json({
        success: true,
        customers: cleanedRecords,
        pagination: {
          total: totalCount,
          page,
          limit: safeLimit,
          totalPages
        }
      });
    }

    // No search term - return paginated list of all customers
    let query = supabase
      .from('Customer')
      .select('*', { count: 'exact' });

    if (!includeInactive) {
      query = query.or('is_active.eq.true,is_active.is.null');
    }

    // Order by org_name first, then first_name, then last_name
    query = query.order('org_name', { ascending: true, nullsLast: true })
                 .order('first_name', { ascending: true, nullsLast: true })
                 .order('last_name', { ascending: true, nullsLast: true });
                 
    query = query.range(skip, skip + safeLimit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase Customer query error:', error);
      return Response.json({ error: 'Failed to fetch customers', details: error.message, success: false }, { status: 500 });
    }

    const totalPages = count ? Math.ceil(count / safeLimit) : 0;

    return Response.json({
      success: true,
      customers: data || [],
      pagination: {
        total: count || 0,
        page,
        limit: safeLimit,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error in searchCustomers:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});