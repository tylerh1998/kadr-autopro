import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { endDate } = await req.json();
    const isValidDateString = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

    if (!isValidDateString(endDate)) {
      return res({ success: false, error: 'A valid endDate is required' });
    }

    const parseDateOnly = (dateStr: string) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };

    const formatDateOnly = (date: Date) => date.toISOString().split('T')[0];
    const getMonthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const getMonthEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatMonthLabel = (date: Date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    const roundAmount = (value: number) => Math.round((value || 0) * 100) / 100;

    const anchorDate = parseDateOnly(endDate);
    const month3Start = getMonthStart(anchorDate);
    const month2Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 1, 1));
    const month1Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 2, 1));

    const months = [
      { key: 'month1', label: formatMonthLabel(month1Start), start: formatDateOnly(month1Start), end: formatDateOnly(getMonthEnd(month1Start)) },
      { key: 'month2', label: formatMonthLabel(month2Start), start: formatDateOnly(month2Start), end: formatDateOnly(getMonthEnd(month2Start)) },
      { key: 'month3', label: formatMonthLabel(month3Start), start: formatDateOnly(month3Start), end: formatDateOnly(getMonthEnd(month3Start)) }
    ];

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
    const supplierRows = rows.map((row: any) => ({
      supplier_id: String(row.supplier_id || ''),
      supplier_name: row.supplier_name || 'Unknown Supplier',
      month1: roundAmount(Number(row.month1_ap)),
      month2: roundAmount(Number(row.month2_ap)),
      month3: roundAmount(Number(row.month3_ap)),
      average: roundAmount(Number(row.average_ap))
    }));

    // Sort by supplier name
    supplierRows.sort((a: any, b: any) => a.supplier_name.localeCompare(b.supplier_name));

    // Summary totals
    const summary = {
      month1: roundAmount(supplierRows.reduce((sum: number, row: any) => sum + row.month1, 0)),
      month2: roundAmount(supplierRows.reduce((sum: number, row: any) => sum + row.month2, 0)),
      month3: roundAmount(supplierRows.reduce((sum: number, row: any) => sum + row.month3, 0)),
      average: 0
    };
    summary.average = roundAmount((summary.month1 + summary.month2 + summary.month3) / 3);

    return res({
      success: true,
      data: {
        endDate,
        months,
        supplierRows,
        summary
      }
    });
  } catch (error: any) {
    console.error('Error generating three month AP report:', error);
    return res({
      success: false,
      error: error.message || 'Failed to generate three month AP report'
    });
  }
});
