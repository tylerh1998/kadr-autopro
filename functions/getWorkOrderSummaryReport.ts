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

    try {
        // Fetch ALL recent projects and sessions to avoid query syntax issues
        // and perform robust matching in memory.
        console.log("WorkOrderSummary: Fetching all recent WorkPRO projects and sessions...");
        
        const [projectsRes, sessionsRes] = await Promise.all([
            base44.functions.invoke('workProProxy', { 
                entityName: 'Project', 
                method: 'list', 
                limit: 3000,
                sort: '-created_date'
            }),
            base44.functions.invoke('workProProxy', { 
                entityName: 'ProjectTimeSession', 
                method: 'list', 
                limit: 5000,
                sort: '-created_date'
            })
        ]);

        if (projectsRes.data?.success) {
            projects = projectsRes.data.data;
        }
        if (sessionsRes.data?.success) {
            timeSessions = sessionsRes.data.data;
        }

        console.log(`WorkOrderSummary: Fetched ${projects.length} projects and ${timeSessions.length} sessions.`);

    } catch (e) {
        console.warn("Failed to fetch WorkPRO data for labor cost:", e);
    }

    // Create lookup maps for WorkPRO data
    // We match by cleaning up numbers (removing non-digits) to handle formatting differences
    // e.g. "RO-1234" vs "1234"
    // Helper function moved to top scope to avoid reference error
    const normalize = (str) => String(str || '').replace(/\D/g, '');
    
    const woToProjectMap = new Map(); // Maps normalized RO/WO to array of Project IDs
    
    projects.forEach(p => {
        const woRef = p.work_order || p.name; // Fallback to name if work_order is empty
        if (woRef) {
            const cleanRef = normalize(woRef);
            if (cleanRef) {
                if (!woToProjectMap.has(cleanRef)) woToProjectMap.set(cleanRef, []);
                woToProjectMap.get(cleanRef).push(p.id);
            }
        }
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
        
        // Try matching both numbers
        const cleanRo = normalize(roNum);
        const cleanWo = normalize(woNum);
        
        let projectIds = [];
        if (cleanRo && woToProjectMap.has(cleanRo)) {
            projectIds = [...projectIds, ...woToProjectMap.get(cleanRo)];
        }
        if (cleanWo && cleanWo !== cleanRo && woToProjectMap.has(cleanWo)) {
            projectIds = [...projectIds, ...woToProjectMap.get(cleanWo)];
        }
        
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