import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch Active Work Orders and Estimates
    // We want all open stuff.
    const activeDocs = await base44.entities.WorkOrder.filter({
      stage: { "$in": ["work_order", "estimate"] }
    });

    // Fetch Employees (for pay rates)
    const employees = await base44.entities.Employee.list();
    const employeeMap = new Map(employees.map(e => [e.full_name?.toLowerCase(), e]));
    const employeeEmailMap = new Map(employees.map(e => [e.email?.toLowerCase(), e]));

    // Fetch WorkPRO Data (Projects and Time Sessions) for Labor Cost
    let projects = [];
    let timeSessions = [];

    // Helper for normalizing RO/WO numbers
    const normalize = (str) => String(str || '').replace(/\D/g, '');

    try {
        console.log("WorkOrderSummary: Starting direct WorkPRO fetch...");
        
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

            // 1. Fetch ALL recent projects directly
            const projectsUrl = `${API_BASE_URL}/Project?limit=5000&sort=-created_date`;
            const pRes = await fetch(projectsUrl, { headers });
            
            if (pRes.ok) {
                const pData = await pRes.json();
                projects = Array.isArray(pData) ? pData : (pData?.records || []);
                console.log(`WorkOrderSummary: Fetched ${projects.length} total projects direct.`);
                
                // DEBUG: Log sample project data
                if (projects.length > 0) {
                    console.log("DEBUG SAMPLE PROJECTS:", JSON.stringify(projects.slice(0, 3).map(p => ({
                        id: p.id,
                        name: p.name,
                        work_order: p.work_order,
                        created_date: p.created_date
                    }))));
                }
            } else {
                console.error(`Failed to fetch projects direct: ${pRes.status} ${await pRes.text()}`);
            }

            // 2. Fetch ALL recent time sessions directly
            const sessionsUrl = `${API_BASE_URL}/ProjectTimeSession?limit=5000&sort=-created_date`;
            const sRes = await fetch(sessionsUrl, { headers });
            
            if (sRes.ok) {
                const sData = await sRes.json();
                timeSessions = Array.isArray(sData) ? sData : (sData?.records || []);
                console.log(`WorkOrderSummary: Fetched ${timeSessions.length} total sessions direct.`);
                
                // DEBUG: Log sample session data
                if (timeSessions.length > 0) {
                    console.log("DEBUG SAMPLE SESSIONS:", JSON.stringify(timeSessions.slice(0, 3).map(s => ({
                        id: s.id,
                        project_id: s.project_id,
                        hours: s.total_hours
                    }))));
                }
            } else {
                console.error(`Failed to fetch sessions direct: ${sRes.status} ${await sRes.text()}`);
            }
        }

    } catch (e) {
        console.warn("Failed to fetch WorkPRO data for labor cost:", e);
    }

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
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const recentInvoices = await base44.entities.WorkOrder.filter({
        stage: { "$in": ["invoice", "credit_invoice"] },
        invoice_date: { "$gte": thirtyDaysAgoStr }
    });

    let closedRevenue = 0;
    for (const inv of recentInvoices) {
        // Ensure values are numbers
        const total = parseFloat(inv.total_amount) || 0;
        const tax = parseFloat(inv.tax_amount) || 0;
        closedRevenue += (total - tax);
    }
    
    console.log(`Found ${recentInvoices.length} invoices in last 30 days. Total Closed Revenue: ${closedRevenue}`);

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
            "0-7 Days": 0,
            "8-14 Days": 0,
            "15-30 Days": 0,
            "30+ Days": 0
        },
        closedLast30Days: recentInvoices.length,
        closedRevenueLast30Days: closedRevenue
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

        // Aging
        const dateStr = doc.wo_date || doc.created_date;
        if (dateStr) {
            const docDate = new Date(dateStr);
            const diffTime = Math.abs(now - docDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays <= 7) summary.aging["0-7 Days"]++;
            else if (diffDays <= 14) summary.aging["8-14 Days"]++;
            else if (diffDays <= 30) summary.aging["15-30 Days"]++;
            else summary.aging["30+ Days"]++;
        }

        // Revenue Breakdown
        // Using fields for consistency - Force number conversion
        const partsRev = parseFloat(doc.parts_total) || 0;
        const laborRev = parseFloat(doc.labor_total) || 0;
        const suppliesRev = parseFloat(doc.shop_supply_total) || 0;
        const totalAmount = parseFloat(doc.total_amount) || 0;
        const taxAmount = parseFloat(doc.tax_amount) || 0;
        
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

        summary.wipCost.labor += woLaborCost;
        summary.totalLaborHours += woLaborHours;
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