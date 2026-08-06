import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeLikeValue = (value: string) => value.replace(/[% ,()]/g, (char) => {
  if (char === ' ') return '%20';
  return `\\${char}`;
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      const escapedSearch = escapeLikeValue(normalizedSearch);

      const { data: matchingCustomers, error: customerSearchError } = await supabase
        .from('Customer')
        .select('id')
        .or([
          `first_name.ilike.%${escapedSearch}%`,
          `last_name.ilike.%${escapedSearch}%`,
          `org_name.ilike.%${escapedSearch}%`
        ].join(','));

      if (customerSearchError) {
        console.error('autopro-getworkorderlist customer search error:', customerSearchError);
        return new Response(JSON.stringify({ error: 'Failed to search customers', details: customerSearchError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const customerIds = (matchingCustomers || []).map((customer: any) => customer.id).filter(Boolean);
      const searchClauses = [
        `ro_number.ilike.%${escapedSearch}%`,
        `wo_number.ilike.%${escapedSearch}%`,
        `est_number.ilike.%${escapedSearch}%`,
        `inv_number.ilike.%${escapedSearch}%`,
        `crinv_number.ilike.%${escapedSearch}%`,
        `description.ilike.%${escapedSearch}%`
      ];

      if (customerIds.length > 0) {
        searchClauses.push(`customer_id.in.(${customerIds.join(',')})`);
      }

      const searchFilter = searchClauses.join(',');
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }

    if (sort && typeof sort === 'string') {
      const sortMap: Record<string, { column: string; ascending: boolean; nullsFirst: boolean }[]> = {
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
      console.error('autopro-getworkorderlist count error:', countError);
      return new Response(JSON.stringify({ error: 'Failed to count work orders', details: countError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (Number.isFinite(Number(offset)) && Number.isFinite(Number(limit))) {
      query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    } else if (limit && Number.isFinite(Number(limit))) {
      query = query.limit(Number(limit));
    }

    let result: any = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      result = await query;

      if (!result.error) {
        break;
      }

      const details = `${result.error.message || ''} ${result.error.details || ''}`.toLowerCase();
      const isTransient = details.includes('connection reset') || details.includes('error sending request') || details.includes('sendrequest');

      if (!isTransient || attempt === 3) {
        console.error('autopro-getworkorderlist supabase error:', result.error);
        return new Response(JSON.stringify({ error: 'Failed to fetch work orders', details: result.error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sleep(attempt * 300);
    }

    const workOrders = result?.data || [];

    const customerIds = [...new Set(workOrders.map((wo: any) => wo.customer_id).filter(Boolean))];
    const vehicleIds = [...new Set(workOrders.map((wo: any) => wo.vehicle_id).filter(Boolean))];

    let customers: any[] = [];
    let vehicles: any[] = [];

    if (customerIds.length > 0) {
      const { data: custData, error: custError } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .in('id', customerIds);

      if (!custError && custData) {
        customers = custData;
      }
    }

    if (vehicleIds.length > 0) {
      const { data: vehData, error: vehError } = await supabase
        .from('Vehicle')
        .select('id, year, make, model, unit_number, vin')
        .in('id', vehicleIds);

      if (!vehError && vehData) {
        vehicles = vehData;
      }
    }

    const enrichedData = workOrders.map((wo: any) => {
      const customer = customers.find((c) => c.id === wo.customer_id) || null;
      const vehicle = vehicles.find((v) => v.id === wo.vehicle_id) || null;
      return {
        ...wo,
        Customer: customer,
        Vehicle: vehicle
      };
    });

    return new Response(JSON.stringify({ data: enrichedData, totalCount: totalCount || 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error('autopro-getworkorderlist error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
