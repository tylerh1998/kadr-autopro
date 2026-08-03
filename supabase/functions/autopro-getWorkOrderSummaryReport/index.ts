import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const PAGE_SIZE = 1000;
const ACTIVE_WORK_ORDER_SELECT = 'id, stage, status, wo_date, created_date, wo_number, ro_number, parts_total, labor_total, shop_supply_total, total_amount, tax_amount, line_items, tech_time';
const RECENT_INVOICE_SELECT = 'id, total_amount, tax_amount, invoice_date';
const EMPLOYEE_SELECT = 'full_name, email, pay_rate';
const PROJECT_SELECT = 'id, work_order, name';
const PROJECT_TIME_SESSION_SELECT = 'project_id, user_email, user_name, total_hours';

const fetchAllRows = async (queryFactory) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
};

const formatMountainDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton'
}).format(date);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const activeDocs = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(ACTIVE_WORK_ORDER_SELECT)
        .in('stage', ['work_order', 'estimate'])
        .order('stage', { ascending: true })
        .order('wo_date', { ascending: true, nullsFirst: false })
        .range(from, to)
    );

    const employees = await fetchAllRows((from, to) =>
      supabase
        .from('Employee')
        .select(EMPLOYEE_SELECT)
        .order('id', { ascending: true })
        .range(from, to)
    );
    const employeeMap = new Map(employees.map(e => [e.full_name?.toLowerCase(), e]));
    const employeeEmailMap = new Map(employees.map(e => [e.email?.toLowerCase(), e]));

    const [projects, timeSessions] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('Project')
          .select(PROJECT_SELECT)
          .order('created_date', { ascending: false, nullsFirst: false })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('ProjectTimeSession')
          .select(PROJECT_TIME_SESSION_SELECT)
          .order('created_date', { ascending: false, nullsFirst: false })
          .range(from, to)
      )
    ]);

    const normalize = (str) => String(str || '').replace(/\D/g, '');

    const woToProjectMap = new Map();

    projects.forEach(p => {
      const refs = [p.work_order, p.name].filter(Boolean);

      refs.forEach(ref => {
        if (!woToProjectMap.has(ref)) woToProjectMap.set(ref, []);
        if (!woToProjectMap.get(ref).includes(p.id)) woToProjectMap.get(ref).push(p.id);

        const norm = normalize(ref);
        if (norm !== ref && norm.length > 0) {
          if (!woToProjectMap.has(norm)) woToProjectMap.set(norm, []);
          if (!woToProjectMap.get(norm).includes(p.id)) woToProjectMap.get(norm).push(p.id);
        }
      });
    });

    const projectToSessionsMap = new Map();
    timeSessions.forEach(s => {
      if (s.project_id) {
        if (!projectToSessionsMap.has(s.project_id)) projectToSessionsMap.set(s.project_id, []);
        projectToSessionsMap.get(s.project_id).push(s);
      }
    });

    // Fetch Invoiced WOs from last 30 days for comparison
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = formatMountainDate(thirtyDaysAgo);

    const recentInvoices = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(RECENT_INVOICE_SELECT)
        .in('stage', ['invoice', 'credit_invoice'])
        .gte('invoice_date', thirtyDaysAgoStr)
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .range(from, to)
    );

    let closedRevenue = 0;
    for (const inv of recentInvoices) {
      const total = parseFloat(inv.total_amount) || 0;
      const tax = parseFloat(inv.tax_amount) || 0;
      closedRevenue += (total - tax);
    }

    console.log(`Found ${recentInvoices.length} invoices in last 30 days. Total Closed Revenue: ${closedRevenue}`);
    console.log('Generating WO Summary with updated aging buckets (v2)');

    let summary = {
      totalWorkOrders: 0,
      totalEstimates: 0,
      inventoryValueInWIP: 0,
      wipRevenue: {
        parts: 0,
        labor: 0,
        shopSupplies: 0,
        otherCharges: 0,
        total: 0
      },
      wipCost: {
        parts: 0,
        labor: 0
      },
      totalLaborHours: 0,
      aging: {
        "0-7 Days": { count: 0, amount: 0 },
        "8-14 Days": { count: 0, amount: 0 },
        "15-30 Days": { count: 0, amount: 0 },
        "31-45 Days": { count: 0, amount: 0 },
        "46-60 Days": { count: 0, amount: 0 },
        "60+ Days": { count: 0, amount: 0 }
      },
      closedLast30Days: recentInvoices.length,
      closedRevenueLast30Days: closedRevenue,
      statusBreakdown: {}
    };

    const now = new Date();

    for (const doc of activeDocs) {
      if (doc.stage === 'estimate') {
        summary.totalEstimates++;
        continue;
      }

      summary.totalWorkOrders++;

      const partsRev = parseFloat(doc.parts_total) || 0;
      const laborRev = parseFloat(doc.labor_total) || 0;
      const suppliesRev = parseFloat(doc.shop_supply_total) || 0;
      const totalAmount = parseFloat(doc.total_amount) || 0;
      const taxAmount = parseFloat(doc.tax_amount) || 0;
      const preTaxAmount = totalAmount - taxAmount;

      // Aging
      const dateStr = doc.wo_date || doc.created_date;
      if (dateStr) {
        const docDate = new Date(dateStr);
        const diffTime = Math.abs(now - docDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let bucket = "60+ Days";
        if (diffDays <= 7) bucket = "0-7 Days";
        else if (diffDays <= 14) bucket = "8-14 Days";
        else if (diffDays <= 30) bucket = "15-30 Days";
        else if (diffDays <= 45) bucket = "31-45 Days";
        else if (diffDays <= 60) bucket = "46-60 Days";

        if (summary.aging[bucket]) {
          summary.aging[bucket].count++;
          summary.aging[bucket].amount += preTaxAmount;
        }
      }

      const subtotalCalculated = partsRev + laborRev + suppliesRev;
      const otherRev = Math.max(0, (totalAmount - taxAmount) - subtotalCalculated);

      summary.wipRevenue.parts += partsRev;
      summary.wipRevenue.labor += laborRev;
      summary.wipRevenue.shopSupplies += suppliesRev;
      summary.wipRevenue.otherCharges += otherRev;
      summary.wipRevenue.total += (totalAmount - taxAmount);

      // Inventory Value (Cost Analysis)
      let woPartsCost = 0;
      if (doc.line_items) {
        try {
          const items = JSON.parse(doc.line_items);
          items.forEach(item => {
            const qty = Number(item.qty) || 0;
            const cost = Number(item.cost_ea) || Number(item.cost) || 0;
            const totalCost = qty * cost;

            const isLabor = item.type === 'labor' || (!item.part_number && item.description?.toLowerCase().includes('labor'));

            if (!isLabor) {
              summary.inventoryValueInWIP += totalCost;
              summary.wipCost.parts += totalCost;
              woPartsCost += totalCost;
            }
          });
        } catch (e) {
          console.error("Error parsing line items for WO", doc.id);
        }
      }

      // Calculate Actual Labor Cost & Hours
      let woLaborHours = 0;
      let woLaborCost = 0;

      // A. Manual Logs
      if (doc.tech_time) {
        try {
          const manualLogs = JSON.parse(doc.tech_time);
          manualLogs.forEach(log => {
            const hours = parseFloat(log.hours) || 0;
            woLaborHours += hours;

            const techName = log.tech_name?.toLowerCase();
            const emp = employeeMap.get(techName);
            if (emp && emp.pay_rate) {
              woLaborCost += hours * emp.pay_rate;
            }
          });
        } catch (e) {
          console.error("Error parsing tech_time for WO", doc.id);
        }
      }

      // B. WorkPRO Logs
      const roNum = doc.ro_number;
      const woNum = doc.wo_number;

      let projectIds = [];

      const tryMatch = (ref) => {
        if (!ref) return;
        if (woToProjectMap.has(ref)) {
          projectIds.push(...woToProjectMap.get(ref));
        }
        const norm = normalize(ref);
        if (norm && woToProjectMap.has(norm)) {
          projectIds.push(...woToProjectMap.get(norm));
        }
      };

      tryMatch(roNum);
      tryMatch(woNum);

      projectIds = [...new Set(projectIds)];

      projectIds.forEach(projectId => {
        const sessions = projectToSessionsMap.get(projectId) || [];
        sessions.forEach(session => {
          const hours = parseFloat(session.total_hours) || 0;
          woLaborHours += hours;

          const empName = session.user_name?.toLowerCase();
          let emp = employeeMap.get(empName);

          if (!emp && session.user_email) {
            emp = employeeEmailMap.get(session.user_email.toLowerCase());
          }

          if (emp && emp.pay_rate) {
            woLaborCost += hours * emp.pay_rate;
          }
        });
      });

      summary.wipCost.labor += woLaborCost;
      summary.totalLaborHours += woLaborHours;

      // Aggregate by Status — status column already stores the display value directly (see plan 0.3)
      const statusVal = doc.status;
      const statusName = statusVal || 'Unassigned';

      if (!summary.statusBreakdown[statusName]) {
        summary.statusBreakdown[statusName] = {
          partsCost: 0,
          partsRevenue: 0,
          laborCost: 0,
          laborRevenue: 0,
          otherCharges: 0,
          shopSupplies: 0,
          gst: 0,
          total: 0
        };
      }

      const breakdown = summary.statusBreakdown[statusName];
      breakdown.partsCost += woPartsCost;
      breakdown.partsRevenue += partsRev;
      breakdown.laborCost += woLaborCost;
      breakdown.laborRevenue += laborRev;
      breakdown.otherCharges += otherRev;
      breakdown.shopSupplies += suppliesRev;
      breakdown.gst += taxAmount;
      breakdown.total += totalAmount;
    }

    // Calculate Margins
    const totalWipRevenue = summary.wipRevenue.total;
    const totalWipCost = summary.wipCost.parts + summary.wipCost.labor;
    const wipGrossProfit = totalWipRevenue - totalWipCost;
    const wipMargin = totalWipRevenue > 0 ? (wipGrossProfit / totalWipRevenue) * 100 : 0;

    summary.margins = {
      grossProfit: wipGrossProfit,
      marginPercent: wipMargin
    };

    return new Response(JSON.stringify(summary), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error('Work Order Summary Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
