import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      auth: { persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { match, orMatch, limit, offset, sort, searchTerm } = body;

    let countQuery = supabase
      .from('WorkOrder')
      .select('id', { count: 'exact', head: true });

    let query = supabase
      .from('WorkOrder')
      .select('id, ro_number, wo_number, est_number, inv_number, crinv_number, customer_id, vehicle_id, status, kanban_order, priority, stage, approval, converted, LockedByUser, description, odometer, labor_rate, parts_total, labor_total, shop_supply_total, tax_amount, total_amount, est_date, wo_date, completed_date, invoice_date, amount_paid, po_number, cvip, default_taxable, last_updated, last_updated_by, completed_by');

    if (match && typeof match === 'object') {
      query = query.match(match);
      countQuery = countQuery.match(match);
    }

    if (orMatch && typeof orMatch === 'string') {
      query = query.or(orMatch);
      countQuery = countQuery.or(orMatch);
    }

    if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim()) {
      const normalizedSearch = searchTerm.trim();

      const { data: matchingCustomers, error: customerSearchError } = await supabase
        .from('Customer')
        .select('id')
        .or([
          `first_name.ilike.%${normalizedSearch}%`,
          `last_name.ilike.%${normalizedSearch}%`,
          `org_name.ilike.%${normalizedSearch}%`
        ].join(','));

      if (customerSearchError) {
        console.error('getworkorderlist customer search error:', customerSearchError);
        return Response.json({ error: 'Failed to search customers', details: customerSearchError.message }, { status: 500 });
      }

      const customerIds = (matchingCustomers || []).map((customer) => customer.id).filter(Boolean);
      const searchClauses = [
        `ro_number.ilike.%${normalizedSearch}%`,
        `wo_number.ilike.%${normalizedSearch}%`,
        `est_number.ilike.%${normalizedSearch}%`,
        `inv_number.ilike.%${normalizedSearch}%`,
        `crinv_number.ilike.%${normalizedSearch}%`,
        `description.ilike.%${normalizedSearch}%`
      ];

      if (customerIds.length > 0) {
        searchClauses.push(`customer_id.in.(${customerIds.join(',')})`);
      }

      const searchFilter = searchClauses.join(',');
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }

    if (sort && typeof sort === 'string') {
      const sortMap = {
        number_desc: [
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'inv_number', ascending: false, nullsFirst: false },
          { column: 'crinv_number', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ],
        number_asc: [
          { column: 'invoice_date', ascending: true, nullsFirst: false },
          { column: 'inv_number', ascending: true, nullsFirst: false },
          { column: 'crinv_number', ascending: true, nullsFirst: false },
          { column: 'ro_number', ascending: true, nullsFirst: false }
        ],
        customer_az: [
          { column: 'customer_id', ascending: true, nullsFirst: false },
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ],
        customer_za: [
          { column: 'customer_id', ascending: false, nullsFirst: false },
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ],
        date_newest: [
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ],
        date_oldest: [
          { column: 'invoice_date', ascending: true, nullsFirst: false },
          { column: 'ro_number', ascending: true, nullsFirst: false }
        ],
        amount_highest: [
          { column: 'total_amount', ascending: false, nullsFirst: false },
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ],
        amount_lowest: [
          { column: 'total_amount', ascending: true, nullsFirst: false },
          { column: 'invoice_date', ascending: false, nullsFirst: false },
          { column: 'ro_number', ascending: false, nullsFirst: false }
        ]
      };

      const orderConfig = sortMap[sort] || sortMap.number_desc;
      orderConfig.forEach(({ column, ascending, nullsFirst }) => {
        query = query.order(column, { ascending, nullsFirst });
      });
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('getworkorderlist count error:', countError);
      return Response.json({ error: 'Failed to count work orders', details: countError.message }, { status: 500 });
    }

    if (Number.isFinite(Number(offset)) && Number.isFinite(Number(limit))) {
      query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    } else if (limit && Number.isFinite(Number(limit))) {
      query = query.limit(Number(limit));
    }

    let result = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      result = await query;

      if (!result.error) {
        break;
      }

      const details = `${result.error.message || ''} ${result.error.details || ''}`.toLowerCase();
      const isTransient = details.includes('connection reset') || details.includes('error sending request') || details.includes('sendrequest');

      if (!isTransient || attempt === 3) {
        console.error('getworkorderlist supabase error:', result.error);
        return Response.json({ error: 'Failed to fetch work orders', details: result.error.message }, { status: 500 });
      }

      await sleep(attempt * 300);
    }

    const workOrders = result?.data || [];
    
    const customerIds = [...new Set(workOrders.map(wo => wo.customer_id).filter(Boolean))];
    const vehicleIds = [...new Set(workOrders.map(wo => wo.vehicle_id).filter(Boolean))];

    let customers = [];
    let vehicles = [];

    // Fetch Customers
    if (customerIds.length > 0) {
      const { data: custData, error: custError } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .in('id', customerIds);
      
      if (!custError && custData) {
        customers = custData;
      }
    }

    // Fetch Vehicles
    if (vehicleIds.length > 0) {
      const { data: vehData, error: vehError } = await supabase
        .from('Vehicle')
        .select('id, year, make, model, unit_number, vin')
        .in('id', vehicleIds);
      
      if (!vehError && vehData) {
        vehicles = vehData;
      }
    }

    // Embed data into work orders
    const enrichedData = workOrders.map(wo => {
      const customer = customers.find(c => c.id === wo.customer_id) || null;
      const vehicle = vehicles.find(v => v.id === wo.vehicle_id) || null;
      return {
        ...wo,
        Customer: customer,
        Vehicle: vehicle
      };
    });

    return Response.json({ data: enrichedData, totalCount: totalCount || 0 });
  } catch (error) {
    console.error('getworkorderlist error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});