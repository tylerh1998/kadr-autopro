import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const PAGE_SIZE = 1000;
const ACTIVE_WORK_ORDER_SELECT = 'id, stage, status, wo_date, created_date, wo_number, ro_number, parts_total, labor_total, shop_supply_total, total_amount, tax_amount, line_items, tech_time';
const RECENT_INVOICE_SELECT = 'id, total_amount, tax_amount, invoice_date';
const EMPLOYEE_SELECT = 'full_name, email, pay_rate';
const PROJECT_SELECT = 'id, work_order, name';
const PROJECT_TIME_SESSION_SELECT = 'project_id, user_email, user_name, total_hours';

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('Supabase_project_url');
  const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false }
  });
};

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseClient();

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

    // Fetch WorkOrderStatus
    const statuses = await base44.entities.WorkOrderStatus.list();
    const statusMap = new Map(statuses.map(s => [s.id, s.name]));

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

    // Create lookup maps for WorkPRO data
    const woToProjectMap = new Map(); // Maps normalized RO/WO to array of Project IDs
    
    projects.forEach(p => {
        // Map both raw and normalized work_order/name to the project ID
        // This ensures we catch "RO-1234" even if we search for "1234"
        const refs = [p.work_order, p.name].filter(Boolean);
        
        refs.forEach(ref => {
             // Map raw
             if (!woToProjectMap.has(ref)) woToProjectMap.set(ref, []);
             if (!woToProjectMap.get(ref).includes(p.id)) woToProjectMap.get(ref).push(p.id);

             // Map normalized
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
        // Ensure values are numbers
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
            continue; // We generally don't include estimates in WIP value/aging, or do we?
            // "Inventory value in WIP" usually implies committed stock (Work Orders).
            // "Age report" usually implies active WOs.
            // I'll exclude Estimates from WIP calculations but keep count.
        }

        summary.totalWorkOrders++;

        // Revenue Breakdown
        // Using fields for consistency - Force number conversion
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
        
        // Calculate Other Charges as residual: Total - Tax - (Parts + Labor + Supplies)
        // Note: total_amount includes tax.
        const subtotalCalculated = partsRev + laborRev + suppliesRev;
        const otherRev = Math.max(0, (totalAmount - taxAmount) - subtotalCalculated);

        summary.wipRevenue.parts += partsRev;
        summary.wipRevenue.labor += laborRev;
        summary.wipRevenue.shopSupplies += suppliesRev;
        summary.wipRevenue.otherCharges += otherRev;
        summary.wipRevenue.total += (totalAmount - taxAmount); // Pre-tax total

        // Inventory Value (Cost Analysis)
        let woPartsCost = 0;
        if (doc.line_items) {
            try {
                const items = JSON.parse(doc.line_items);
                items.forEach(item => {
                    const qty = Number(item.qty) || 0;
                    const cost = Number(item.cost_ea) || Number(item.cost) || 0; // Handle different naming conventions
                    const totalCost = qty * cost;

                    // If it's a part (usually has part_number), add to Inventory Value
                    // We assume line items are primarily parts or labor.
                    // If it has a cost, we count it.
                    // We might want to separate Labor Cost if possible.
                    // Often labor lines have 'type' or are identified.
                    // But for "Inventory Value in WIP", we specifically want PARTS cost.
                    // Checking if item has `part_number` or `inventory_item_id` is a good heuristic.
                    
                    const isLabor = item.type === 'labor' || (!item.part_number && item.description?.toLowerCase().includes('labor'));
                    
                    if (!isLabor) {
                         summary.inventoryValueInWIP += totalCost;
                         summary.wipCost.parts += totalCost;
                         woPartsCost += totalCost;
                    }
                    // Note: We ignore line item cost for labor here, as we calculate actuals below
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
        
        // Try matching both raw and normalized numbers
        let projectIds = [];
        
        const tryMatch = (ref) => {
            if (!ref) return;
            // Try raw
            if (woToProjectMap.has(ref)) {
                projectIds.push(...woToProjectMap.get(ref));
            }
            // Try normalized
            const norm = normalize(ref);
            if (norm && woToProjectMap.has(norm)) {
                projectIds.push(...woToProjectMap.get(norm));
            }
        };

        tryMatch(roNum);
        tryMatch(woNum);
        
        // Deduplicate project IDs
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

        // Aggregate by Status
        const statusVal = doc.status;
        // Check if statusVal is an ID in our map, otherwise assume it's the name itself
        const statusName = statusMap.get(statusVal) || statusVal || 'Unassigned';

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

    return Response.json(summary);

  } catch (error) {
    console.error('Work Order Summary Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});