import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const PAGE_SIZE = 1000;
const SALES_ANALYSIS_SELECT = 'id, invoice_date, ro_number, wo_number, total_amount, parts_total, labor_total, shop_supply_total, line_items, tech_time';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    // 1. Fetch Invoiced Work Orders
    const workOrders = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(SALES_ANALYSIS_SELECT)
        .in('stage', ['invoice', 'credit_invoice'])
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .order('invoice_date', { ascending: true, nullsFirst: false })
        .range(from, to)
    );

    // 2. Fetch Employees (for pay rates)
    const employees = await base44.entities.Employee.list();
    const employeeMap = new Map(employees.map(e => [e.full_name?.toLowerCase(), e]));
    const employeeEmailMap = new Map(employees.map(e => [e.email?.toLowerCase(), e]));

    // 3. Fetch WorkPRO Data (Projects and Time Sessions)
    // We try to fetch all to do in-memory matching as filtered queries might be too many
    let projects = [];
    let timeSessions = [];
    
    // Helper for normalizing RO/WO numbers
    const normalize = (str) => String(str || '').replace(/\D/g, '');

    try {
        console.log("SalesAnalysis: Starting direct WorkPRO fetch...");
        
        const WORKPRO_APP_ID = Deno.env.get("WORKPRO_APP_ID") || '68b3caadfc9d9a1ea34d2018';
        const WORKPRO_API_KEY = Deno.env.get("WORKPRO_API_KEY");
        const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

        if (!WORKPRO_API_KEY) {
            console.error("WORKPRO_API_KEY is not set");
        } else {
            const headers = { 
                'api_key': WORKPRO_API_KEY,
                'Content-Type': 'application/json'
            };

            // A. Fetch ALL recent projects directly
            // Using a high limit to capture as much as possible for analysis period
            // If the analysis period is very old, this might miss data if limit is hit. 
            // But usually analysis is recent. 
            // Ideally we could filter by date created > startDate but Projects created_date might differ from Invoice Date.
            // Let's stick to grabbing recent 5000 for now.
            const projectsUrl = `${API_BASE_URL}/Project?limit=5000&sort=-created_date`;
            const pRes = await fetch(projectsUrl, { headers });
            
            if (pRes.ok) {
                const pData = await pRes.json();
                projects = Array.isArray(pData) ? pData : (pData?.records || []);
                console.log(`SalesAnalysis: Fetched ${projects.length} total projects direct.`);
            } else {
                console.error(`Failed to fetch projects direct: ${pRes.status} ${await pRes.text()}`);
            }

            // B. Fetch ALL recent time sessions directly
            const sessionsUrl = `${API_BASE_URL}/ProjectTimeSession?limit=5000&sort=-created_date`;
            const sRes = await fetch(sessionsUrl, { headers });
            
            if (sRes.ok) {
                const sData = await sRes.json();
                timeSessions = Array.isArray(sData) ? sData : (sData?.records || []);
                console.log(`SalesAnalysis: Fetched ${timeSessions.length} total sessions direct.`);
            } else {
                console.error(`Failed to fetch sessions direct: ${sRes.status} ${await sRes.text()}`);
            }
        }

    } catch (e) {
        console.warn("Failed to fetch WorkPRO data for labor cost:", e);
    }

    // Create lookup maps for WorkPRO data
    // Map WO ID (or RO Number) to Project IDs using robust matching
    const woToProjectMap = new Map();
    
    projects.forEach(p => {
        // Map both raw and normalized work_order/name to the project ID
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

    // Map Project ID to Sessions
    const projectToSessionsMap = new Map();
    timeSessions.forEach(s => {
        if (s.project_id) {
            if (!projectToSessionsMap.has(s.project_id)) projectToSessionsMap.set(s.project_id, []);
            projectToSessionsMap.get(s.project_id).push(s);
        }
    });

    // 4. Aggregate Data
    let totalRevenue = 0;
    let partsRevenue = 0;
    let laborRevenue = 0;
    let shopSuppliesRevenue = 0;
    let partsCost = 0;
    let laborCost = 0;
    let invoiceCount = 0;
    let otherCharges = {};

    const dailyBreakdown = {};

    for (const wo of workOrders) {
        invoiceCount++;
        const revenue = wo.total_amount || 0; // Or sum parts+labor+supplies to be safe (excluding tax?) Usually Sales Analysis is Pre-Tax.
        // Let's use pre-tax components
        const woPartsRev = wo.parts_total || 0;
        const woLaborRev = wo.labor_total || 0;
        const woSuppliesRev = wo.shop_supply_total || 0;
        
        // Sum revenue (excluding tax)
        const woSubtotal = woPartsRev + woLaborRev + woSuppliesRev;
        
        totalRevenue += woSubtotal;
        partsRevenue += woPartsRev;
        laborRevenue += woLaborRev;
        shopSuppliesRevenue += woSuppliesRev;

        // Parts Cost
        let woPartsCost = 0;
        if (wo.line_items) {
            try {
                const lineItems = JSON.parse(wo.line_items);
                lineItems.forEach(item => {
                    const qty = Number(item.qty) || 0;
                    const cost = Number(item.cost_ea) || 0;
                    woPartsCost += (qty * cost);
                });
            } catch (e) {
                console.error("Error parsing line items for WO", wo.id);
            }
        }
        partsCost += woPartsCost;

        // Labor Cost Calculation
        let woLaborCost = 0;
        
        // A. Manual Logs
        if (wo.tech_time) {
            try {
                const manualLogs = JSON.parse(wo.tech_time);
                manualLogs.forEach(log => {
                    const hours = parseFloat(log.hours) || 0;
                    const techName = log.tech_name?.toLowerCase();
                    const emp = employeeMap.get(techName); // Try match by name
                    if (emp && emp.pay_rate) {
                        woLaborCost += hours * emp.pay_rate;
                    }
                });
            } catch (e) {
                console.error("Error parsing tech_time for WO", wo.id);
            }
        }

        // B. WorkPRO Logs
        const roNum = wo.ro_number;
        const woNum = wo.wo_number;
        
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
                // Session usually has 'user_name' or similar? 
                // The Profitability component uses `workpro_user_name`. 
                // Let's check `getProjectTimeSessions` output structure in mind. 
                // Assuming session object has `employee_name` or `user_email`.
                // Checking previous file content `WorkOrderProfitability.js`: 
                // it maps `log.workpro_user_name` or `log.email`.
                // `workProProxy` usually returns the raw record. 
                // `TimeRecord` entity in WorkPRO has `employee_name`.
                // `ProjectTimeSession` likely has `employee_name` or linked employee.
                // Let's try `employee_name`.
                
                const empName = session.employee_name?.toLowerCase();
                let emp = employeeMap.get(empName);
                
                if (!emp && session.user_email) {
                    emp = employeeEmailMap.get(session.user_email.toLowerCase());
                }

                if (emp && emp.pay_rate) {
                    woLaborCost += hours * emp.pay_rate;
                }
            });
        });

        laborCost += woLaborCost;

        // Daily Breakdown
        const date = wo.invoice_date;
        if (!dailyBreakdown[date]) {
            dailyBreakdown[date] = { date, revenue: 0, cost: 0, profit: 0, count: 0 };
        }
        dailyBreakdown[date].revenue += woSubtotal;
        dailyBreakdown[date].cost += (woPartsCost + woLaborCost);
        dailyBreakdown[date].profit += (woSubtotal - (woPartsCost + woLaborCost));
        dailyBreakdown[date].count++;
    }

    const grossProfit = totalRevenue - (partsCost + laborCost);
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const avgTicket = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;

    // Convert daily breakdown to array sorted by date
    const chartData = Object.values(dailyBreakdown).sort((a, b) => new Date(a.date) - new Date(b.date));

    return Response.json({
        summary: {
            totalRevenue,
            partsRevenue,
            laborRevenue,
            shopSuppliesRevenue,
            totalCost: partsCost + laborCost,
            partsCost,
            laborCost,
            grossProfit,
            margin,
            invoiceCount,
            avgTicket
        },
        chartData
    });

  } catch (error) {
    console.error('Sales Analysis Report Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});