import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endDate } = await req.json();
    const isValidDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

    if (!isValidDateString(endDate)) {
      return Response.json({ error: 'A valid endDate is required' }, { status: 400 });
    }

    const parseDateOnly = (dateStr) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };

    const formatDateOnly = (date) => date.toISOString().split('T')[0];
    const getMonthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const getMonthEnd = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatMonthLabel = (date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    const roundAmount = (value) => Math.round((value || 0) * 100) / 100;

    const anchorDate = parseDateOnly(endDate);
    const month3Start = getMonthStart(anchorDate);
    const month2Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 1, 1));
    const month1Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 2, 1));

    const months = [
      { key: 'month1', label: formatMonthLabel(month1Start), start: formatDateOnly(month1Start), end: formatDateOnly(getMonthEnd(month1Start)) },
      { key: 'month2', label: formatMonthLabel(month2Start), start: formatDateOnly(month2Start), end: formatDateOnly(getMonthEnd(month2Start)) },
      { key: 'month3', label: formatMonthLabel(month3Start), start: formatDateOnly(month3Start), end: formatDateOnly(getMonthEnd(month3Start)) }
    ];

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data: rpcRows, error } = await supabase.rpc('get_three_month_ap_report_data', {
      m1_start: months[0].start, m1_end: months[0].end,
      m2_start: months[1].start, m2_end: months[1].end,
      m3_start: months[2].start, m3_end: months[2].end
    });

    if (error) {
      throw new Error(`RPC error: ${error.message}`);
    }

    const rows = rpcRows || [];

    // Format the result into the expected supplierRows array
    const supplierRows = rows.map(row => ({
      supplier_id: String(row.supplier_id || ''),
      supplier_name: row.supplier_name || 'Unknown Supplier',
      month1: roundAmount(Number(row.month1_ap)),
      month2: roundAmount(Number(row.month2_ap)),
      month3: roundAmount(Number(row.month3_ap)),
      average: roundAmount(Number(row.average_ap))
    }));

    // Sort by supplier name
    supplierRows.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));

    // Summary totals
    const summary = {
      month1: roundAmount(supplierRows.reduce((sum, row) => sum + row.month1, 0)),
      month2: roundAmount(supplierRows.reduce((sum, row) => sum + row.month2, 0)),
      month3: roundAmount(supplierRows.reduce((sum, row) => sum + row.month3, 0)),
      average: 0
    };
    summary.average = roundAmount((summary.month1 + summary.month2 + summary.month3) / 3);

    return Response.json({
      success: true,
      data: {
        endDate,
        months,
        supplierRows,
        summary
      }
    });
  } catch (error) {
    console.error('Error generating three month AP report:', error);
    return Response.json({ error: error.message || 'Failed to generate three month AP report' }, { status: 500 });
  }
});
