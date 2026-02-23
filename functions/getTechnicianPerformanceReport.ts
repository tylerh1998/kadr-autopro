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

        console.log(`TimeRecords: fetched ${timeRecords.length}, filtered ${filteredTimeRecords.length}`);
        console.log(`Sessions: fetched ${projectSessions.length}, filtered ${filteredSessions.length}`);

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
            
            if (!session.project_name) return null;
            const name = session.project_name.trim();

            // 2. Exact match in map (for "12345", "RO12345")
            if (woMap[name]) return woMap[name];

            // 3. Try by RO Number extracted from name
            // Matches: "RO 123...", "RO#123...", "Work Order 123...", "RO-123"
            const roMatch = name.match(/(?:RO|Work\s*Order|WO)[\s#.:-]*(\d+)/i);
            if (roMatch) {
                const extracted = roMatch[1];
                if (woMap[extracted]) return woMap[extracted];
            }
            
            // 4. Starts with digits (e.g. "12345 - Brake Job")
            const startMatch = name.match(/^(\d+)\b/);
            if (startMatch) {
                 const extracted = startMatch[1];
                 if (woMap[extracted]) return woMap[extracted];
            }

            return null;
        };

        let matchedSessionsCount = 0;
        filteredSessions.forEach(s => {
            const wo = findWorkOrder(s);
            if (!wo) {
                // console.log(`No WO found for session: ${s.project_name}`); // Uncomment to debug
                return; 
            }
            matchedSessionsCount++;
            
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
        
        console.log(`Matched ${matchedSessionsCount} out of ${filteredSessions.length} sessions to Work Orders.`);

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

            // Ensure labor_total is a number
            let woLaborRevenue = 0;
            if (wo.labor_total) {
                if (typeof wo.labor_total === 'number') woLaborRevenue = wo.labor_total;
                else if (typeof wo.labor_total === 'string') woLaborRevenue = parseFloat(wo.labor_total.replace(/[$,]/g, '')) || 0;
            }

            // Tech Name Normalization Helper
            // WorkPro might say "John Doe" while Employee entity says "John Doe " or "John"
            // For now, we rely on exact match or try case-insensitive
            
            Object.keys(stats.techHours).forEach(techName => {
                let targetTech = efficiencyMap[techName];
                
                // If not found, try case insensitive match
                if (!targetTech) {
                     const match = Object.values(efficiencyMap).find(t => t.name.toLowerCase() === techName.toLowerCase());
                     if (match) targetTech = match;
                }

                if (targetTech) {
                    const techHoursOnWo = stats.techHours[techName];
                    const proportionalShare = techHoursOnWo / stats.totalHours; 

                    targetTech.laborRevenue += (woLaborRevenue * proportionalShare);
                    targetTech.billedHours += (woTotalBilledHours * proportionalShare);
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