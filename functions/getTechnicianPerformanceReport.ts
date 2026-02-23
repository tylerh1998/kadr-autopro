import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    // 1. Setup & Auth
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { dateFrom, dateTo } = await req.json();
        
        // Helper to fetch directly from WorkPro (Base44 App) to avoid invoke/DNS issues
        const workProApiKey = Deno.env.get("WORKPRO_API_KEY");
        const workProAppId = Deno.env.get("WORKPRO_APP_ID") || '68b3caadfc9d9a1ea34d2018';

        const fetchWorkPro = async (entity, params = {}, retries = 3) => {
            const baseUrl = `https://app.base44.com/api/apps/${workProAppId}/entities/${entity}`;
            const url = new URL(baseUrl);
            
            if (params._limit) url.searchParams.append('limit', params._limit);
            if (params._sort) url.searchParams.append('sort', params._sort);

            for (let i = 0; i < retries; i++) {
                try {
                    const res = await fetch(url.toString(), {
                        headers: {
                            'api_key': workProApiKey,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!res.ok) {
                        const txt = await res.text();
                        console.error(`WorkPro ${entity} fetch failed: ${res.status} ${txt}`);
                        if (res.status >= 400 && res.status < 500 && res.status !== 429) return [];
                        throw new Error(`Status ${res.status}`);
                    }
                    
                    const json = await res.json();
                    return Array.isArray(json) ? json : (json.records || []);
                } catch (err) {
                    console.error(`WorkPro ${entity} fetch attempt ${i+1} failed: ${err.message}`);
                    if (i === retries - 1) throw err;
                    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                }
            }
            return [];
        };

        // 3. Fetch Data (Sequential)
        console.log("Fetching TimeRecords...");
        const timeRecords = await fetchWorkPro('TimeRecord', { _limit: 5000, _sort: '-clock_in_time' });
        
        console.log("Fetching ProjectTimeSessions...");
        const projectSessions = await fetchWorkPro('ProjectTimeSession', { _limit: 5000, _sort: '-start_time' });
        
        console.log("Fetching UnassignedTime...");
        // UnassignedTime might fail if entity doesn't exist or permissions issue
        let unassignedSessions = [];
        try {
            unassignedSessions = await fetchWorkPro('UnassignedTime', { _limit: 5000, _sort: '-start_time' });
        } catch (e) {
            console.warn("UnassignedTime fetch failed, ignoring:", e.message);
        }

        console.log("Fetching Base44 Entities...");
        const [employees, cashFlowSummary] = await Promise.all([
            base44.entities.Employee.list(),
            base44.entities.CashFlowSummary.list()
        ]);

        // 4. Filter WorkPro Data by Date (Mountain Time aware)
        const isInRange = (isoString) => {
            if (!isoString) return false;
            const date = new Date(isoString);
            const mtDate = new Intl.DateTimeFormat('en-CA', { 
                timeZone: 'America/Edmonton',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(date);
            return mtDate >= dateFrom && mtDate <= dateTo;
        };

        const filteredTimeRecords = timeRecords.filter(r => isInRange(r.clock_in_time));
        const filteredSessions = projectSessions.filter(s => isInRange(s.start_time));
        const filteredUnassigned = unassignedSessions.filter(s => isInRange(s.start_time));

        // 5. Index WorkOrders for matching
        let workOrders = [];
        
        console.log("Fetching WorkOrders...");
        // Fetch recent WOs to cover active ones
        workOrders = await base44.entities.WorkOrder.list('-last_updated', 3000);

        // Map WorkOrders by various keys for robust matching
        const woMap = {}; 
        workOrders.forEach(wo => {
            if (wo.id) woMap[wo.id] = wo; // Exact ID match
            if (wo.ro_number) {
                const ro = wo.ro_number.toString();
                woMap[ro] = wo; // "12345"
                woMap[`RO${ro}`] = wo; // "RO12345"
                // If RO is stored as "RO12345", map "12345" too
                if (ro.toUpperCase().startsWith("RO")) {
                    woMap[ro.substring(2)] = wo;
                }
            }
        });

        // 6. Calculate Utilization
        const techUtilizationMap = {};
        const techs = employees.filter(e => e.employee_type === 'tech' || e.position === 'Technician');
        
        techs.forEach(tech => {
            techUtilizationMap[tech.full_name] = {
                name: tech.full_name,
                payRate: tech.pay_rate || 0,
                clockedHours: 0,
                projectHours: 0,
                unassignedHours: 0,
                utilizationRate: 0
            };
        });

        filteredTimeRecords.forEach(r => {
            if (techUtilizationMap[r.employee_name]) {
                techUtilizationMap[r.employee_name].clockedHours += (r.total_hours || 0);
            }
        });

        filteredSessions.forEach(s => {
            if (techUtilizationMap[s.user_name]) {
                techUtilizationMap[s.user_name].projectHours += (s.total_hours || 0);
            }
        });

        filteredUnassigned.forEach(s => {
            if (techUtilizationMap[s.user_name]) {
                techUtilizationMap[s.user_name].unassignedHours += (s.total_hours || 0);
            }
        });

        Object.values(techUtilizationMap).forEach(tech => {
            if (filteredUnassigned.length === 0) {
                tech.unassignedHours = Math.max(0, tech.clockedHours - tech.projectHours);
            }
            tech.utilizationRate = tech.clockedHours > 0 
                ? (tech.projectHours / tech.clockedHours) * 100 
                : 0;
        });

        const utilizationList = Object.values(techUtilizationMap).sort((a, b) => b.utilizationRate - a.utilizationRate);

        // 7. Calculate Efficiency (Revenue Attribution)
        const efficiencyMap = {}; 
        techs.forEach(tech => {
            const rawRate = tech.pay_rate;
            const cleanRate = typeof rawRate === 'string' ? rawRate.replace(/[$,]/g, '') : rawRate;
            const payRate = parseFloat(cleanRate) || 0;
            
            efficiencyMap[tech.full_name] = {
                name: tech.full_name,
                payRate: payRate,
                billedHours: 0,
                laborRevenue: 0,
                cost: techUtilizationMap[tech.full_name].projectHours * payRate,
                projectHours: techUtilizationMap[tech.full_name].projectHours
            };
        });

        // Structure: { [wo_id]: { totalHours: 0, techHours: { [techName]: hours }, wo: WorkOrder } }
        const woAggregats = {}; 
        
        // Helper to find WO from session
        const findWorkOrder = (session) => {
            // 1. Try by Project ID (Exact Match to WO ID)
            if (session.project_id && woMap[session.project_id]) {
                return woMap[session.project_id];
            }
            
            // 2. Try by RO Number extracted from name
            if (session.project_name) {
                // Try exact match first (e.g. if name IS the RO number)
                if (woMap[session.project_name]) return woMap[session.project_name];

                // Regex extraction: "RO 1234..." -> "1234"
                const match = session.project_name.match(/RO\s*#?\s*(\d+)/i);
                if (match) {
                    const extracted = match[1];
                    if (woMap[extracted]) return woMap[extracted];
                }
            }
            return null;
        };

        filteredSessions.forEach(s => {
            const wo = findWorkOrder(s);
            if (!wo) return; // Skip if no linked WO found
            
            if (!woAggregats[wo.id]) {
                woAggregats[wo.id] = { totalHours: 0, techHours: {}, wo: wo };
            }
            
            const stats = woAggregats[wo.id];
            stats.totalHours += (s.total_hours || 0);
            
            if (!stats.techHours[s.user_name]) {
                stats.techHours[s.user_name] = 0;
            }
            stats.techHours[s.user_name] += (s.total_hours || 0);
        });

        // Distribute Revenue
        Object.values(woAggregats).forEach(stats => {
            if (stats.totalHours === 0) return;
            
            const wo = stats.wo;
            let woTotalBilledHours = 0;
            try {
                const lines = JSON.parse(wo.line_items || '[]');
                lines.forEach(line => {
                    // Sum up billed hours (hrs field)
                    if (line.hrs > 0) woTotalBilledHours += parseFloat(line.hrs);
                });
            } catch (e) {}

            const woLaborRevenue = wo.labor_total || 0;

            Object.keys(stats.techHours).forEach(techName => {
                if (efficiencyMap[techName]) {
                    const techHoursOnWo = stats.techHours[techName];
                    const proportionalShare = techHoursOnWo / stats.totalHours; 

                    efficiencyMap[techName].laborRevenue += (woLaborRevenue * proportionalShare);
                    efficiencyMap[techName].billedHours += (woTotalBilledHours * proportionalShare);
                }
            });
        });

        const efficiencyList = Object.values(efficiencyMap).sort((a, b) => b.laborRevenue - a.laborRevenue);

        // 8. Progress Bar Logic
        const cf = cashFlowSummary[0] || {};
        const payrollTarget = (cf.est_first_payroll || 0) + (cf.est_second_payroll || 0) + (cf.est_payroll_remit || 0);
        
        const now = new Date();
        const currentMonthStart = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit' 
        }).format(now); 
        // Note: format returns YYYY-MM
        
        const currentMonthLabourSales = workOrders.reduce((sum, wo) => {
            // Using invoice_date for sales attribution
            if (wo.invoice_date && wo.invoice_date.startsWith(currentMonthStart)) {
                return sum + (wo.labor_total || 0);
            }
            return sum;
        }, 0);

        return Response.json({
            utilization: utilizationList,
            efficiency: efficiencyList,
            progress: {
                target: payrollTarget,
                current: currentMonthLabourSales
            }
        });

    } catch (error) {
        console.error("Function Error:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});