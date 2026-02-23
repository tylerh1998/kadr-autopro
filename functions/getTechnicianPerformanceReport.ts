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
        
        // 2. WorkPro Fetch Helper
        const workProApiKey = Deno.env.get("WORKPRO_API_KEY");
        const workProAppId = Deno.env.get("WORKPRO_APP_ID");

        const fetchWorkPro = async (entity, params = {}) => {
            const url = new URL(`https://api.workpro.io/v1/${entity}`);
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
            
            const res = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${workProApiKey}`,
                    'X-App-Id': workProAppId,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) return [];
            const json = await res.json();
            return Array.isArray(json) ? json : (json.data || json.records || []);
        };

        // 3. Fetch Data in Parallel
        const [
            timeRecords,
            projectSessions,
            unassignedSessions,
            employees,
            cashFlowSummary
        ] = await Promise.all([
            fetchWorkPro('TimeRecord', { _limit: 5000, _sort: '-clock_in_time' }),
            fetchWorkPro('ProjectTimeSession', { _limit: 5000, _sort: '-start_time' }),
            fetchWorkPro('UnassignedTime', { _limit: 5000, _sort: '-start_time' }),
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

        // 5. Identify Relevant Work Orders
        const roSet = new Set();
        filteredSessions.forEach(s => {
            if (s.project_name) {
                const match = s.project_name.match(/^(RO\d+)/i);
                if (match) roSet.add(match[1].toUpperCase());
                else roSet.add(s.project_name);
            }
        });
        
        const roList = Array.from(roSet);
        let workOrders = [];
        
        if (roList.length > 0) {
             const recentWOs = await base44.entities.WorkOrder.list('-last_updated', 3000);
             // Keep all recent WOs for progress bar, but we can also use them for efficiency matching
             workOrders = recentWOs; 
        } else {
             // Still fetch recent WOs for progress bar even if no sessions found
             workOrders = await base44.entities.WorkOrder.list('-last_updated', 3000);
        }

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
            efficiencyMap[tech.full_name] = {
                name: tech.full_name,
                billedHours: 0,
                laborRevenue: 0,
                cost: techUtilizationMap[tech.full_name].projectHours * (tech.pay_rate || 0),
                projectHours: techUtilizationMap[tech.full_name].projectHours
            };
        });

        const woPeriodStats = {}; 
        
        filteredSessions.forEach(s => {
            if (!s.project_name) return;
            const match = s.project_name.match(/^(RO\d+)/i);
            const roNumber = match ? match[1].toUpperCase() : s.project_name;
            
            if (!woPeriodStats[roNumber]) {
                woPeriodStats[roNumber] = { totalHours: 0, techHours: {} };
            }
            
            woPeriodStats[roNumber].totalHours += (s.total_hours || 0);
            
            if (!woPeriodStats[roNumber].techHours[s.user_name]) {
                woPeriodStats[roNumber].techHours[s.user_name] = 0;
            }
            woPeriodStats[roNumber].techHours[s.user_name] += (s.total_hours || 0);
        });

        Object.keys(woPeriodStats).forEach(roNumber => {
            const wo = workOrders.find(w => w.ro_number === roNumber);
            if (!wo) return;

            const stats = woPeriodStats[roNumber];
            if (stats.totalHours === 0) return;

            let woTotalBilledHours = 0;
            try {
                const lines = JSON.parse(wo.line_items || '[]');
                lines.forEach(line => {
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
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});