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
        // Collect all RO numbers to query efficiently
        const roNumbers = new Set();
        activeDocs.forEach(doc => {
            if (doc.ro_number) roNumbers.add(doc.ro_number);
            if (doc.wo_number) roNumbers.add(doc.wo_number);
            // Also try stripped versions just in case
            if (doc.ro_number) roNumbers.add(doc.ro_number.replace(/\D/g, ''));
        });

        const roList = Array.from(roNumbers).filter(Boolean);

        if (roList.length > 0) {
            // Fetch Projects matching these ROs
            // Batch the project fetching to avoid URL length limits
            const chunkArray = (arr, size) => {
                return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
                    arr.slice(i * size, i * size + size)
                );
            };

            const roBatches = chunkArray(roList, 30); // 30 ROs per batch to be safe
            console.log(`WorkOrderSummary: Fetching projects in ${roBatches.length} batches.`);

            for (const batch of roBatches) {
                try {
                    const projectsRes = await base44.functions.invoke('workProProxy', { 
                        entityName: 'Project', 
                        method: 'list', 
                        limit: 1000,
                        params: {
                            query: { work_order: { "$in": batch } }
                        }
                    });

                    if (projectsRes.data?.success) {
                        projects = [...projects, ...projectsRes.data.data];
                    }
                } catch (err) {
                    console.error("Error fetching project batch:", err);
                }
            }

            if (projects.length > 0) {
                const projectIds = projects.map(p => p.id);
                console.log(`WorkOrderSummary: Found ${projects.length} projects. IDs: ${JSON.stringify(projectIds.slice(0, 5))}...`);

                if (projectIds.length > 0) {
                    // Fetch Sessions matching these Projects
                    // Batch the session fetching to avoid URL length limits if many projects
                    const chunkArray = (arr, size) => {
                        return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
                            arr.slice(i * size, i * size + size)
                        );
                    };

                    const batches = chunkArray(projectIds, 50); // 50 IDs per batch
                    console.log(`WorkOrderSummary: Fetching sessions in ${batches.length} batches.`);

                    for (const batch of batches) {
                        try {
                            const sessionsRes = await base44.functions.invoke('workProProxy', { 
                                entityName: 'ProjectTimeSession', 
                                method: 'list', 
                                limit: 5000,
                                params: {
                                    query: { project_id: { "$in": batch } }
                                }
                            });

                            if (sessionsRes.data?.success) {
                                timeSessions = [...timeSessions, ...sessionsRes.data.data];
                            }
                        } catch (err) {
                            console.error("Error fetching session batch:", err);
                        }
                    }
                }
            }

            console.log(`WorkOrderSummary: Querying for ${roList.length} ROs. Found ${projects.length} projects and ${timeSessions.length} sessions.`);

            // Debug: Log some mappings
            const sampleWO = activeDocs.find(d => d.wo_number || d.ro_number);
            if (sampleWO) {
                const ro = sampleWO.ro_number || sampleWO.wo_number;
                const matchingProjects = projects.filter(p => p.work_order === ro || p.work_order === ro.replace(/\D/g, ''));
                console.log(`Debug WO ${ro}: Found ${matchingProjects.length} projects.`);
                matchingProjects.forEach(p => {
                    const pSessions = timeSessions.filter(s => s.project_id === p.id);
                    const totalHours = pSessions.reduce((sum, s) => sum + (parseFloat(s.total_hours) || 0), 0);
                    console.log(`  - Project ${p.id}: ${pSessions.length} sessions, ${totalHours} hours`);
                });
            }

            }
            } catch (e) {
            console.warn("Failed to fetch WorkPRO data for labor cost:", e);
            }

    // Create lookup maps for WorkPRO data
    const woToProjectMap = new Map();
    projects.forEach(p => {
        if (p.work_order) {
            if (!woToProjectMap.has(p.work_order)) woToProjectMap.set(p.work_order, []);
            woToProjectMap.get(p.work_order).push(p.id);
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
        const roNum = doc.ro_number || doc.wo_number;
        const projectIds = woToProjectMap.get(roNum) || [];
        
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