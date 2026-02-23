import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

export default async function(req) {
    // 1. Setup & Auth
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
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
        // We fetch a generous limit of recent records and filter in memory since we can't easily rely on deep filtering via API 
        // without exact field knowledge, matching the frontend's previous strategy.
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
        // Helper to check if a UTC iso string falls within the YYYY-MM-DD range (Mountain Time)
        const isInRange = (isoString) => {
            if (!isoString) return false;
            // Create date object from UTC string
            const date = new Date(isoString);
            // Format to Mountain Time YYYY-MM-DD
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
        // Extract RO numbers from sessions to fetch only relevant WOs
        const roSet = new Set();
        filteredSessions.forEach(s => {
            if (s.project_name) {
                const match = s.project_name.match(/^(RO\d+)/i);
                if (match) roSet.add(match[1].toUpperCase());
                else roSet.add(s.project_name); // Fallback
            }
        });
        
        const roList = Array.from(roSet);
        let workOrders = [];
        
        // Fetch WOs from Base44
        if (roList.length > 0) {
             // Fetch in chunks if too many, or just fetch all recent if list is huge
             // For now, assuming < 2000 active WOs in a period
             // Using simple filter if possible, otherwise list recent
             // Since $in might be limited, let's fetch recent 2000 WOs sorted by updated date and filter in memory
             // This covers active WOs.
             const recentWOs = await base44.entities.WorkOrder.list('-last_updated', 3000);
             workOrders = recentWOs.filter(wo => roSet.has(wo.ro_number));
             
             // Also need WOs for the "Progress" bar (Current Month Labour Sales)
             // These might not have sessions, so we keep the full recent list or fetch separately?
             // We'll filter `recentWOs` for the progress bar calculation too.
             // Let's just use `recentWOs` as our source of truth.
             workOrders = recentWOs; 
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
            // Fuzzy match tech name if needed, assuming direct match for now
            if (techUtilizationMap[s.user_name]) {
                techUtilizationMap[s.user_name].projectHours += (s.total_hours || 0);
            }
        });

        filteredUnassigned.forEach(s => {
            if (techUtilizationMap[s.user_name]) {
                techUtilizationMap[s.user_name].unassignedHours += (s.total_hours || 0);
            }
        });

        // Finalize Utilization Stats
        Object.values(techUtilizationMap).forEach(tech => {
            if (filteredUnassigned.length === 0) {
                // Fallback if Unassigned entity empty
                tech.unassignedHours = Math.max(0, tech.clockedHours - tech.projectHours);
            }
            tech.utilizationRate = tech.clockedHours > 0 
                ? (tech.projectHours / tech.clockedHours) * 100 
                : 0;
        });

        const utilizationList = Object.values(techUtilizationMap).sort((a, b) => b.utilizationRate - a.utilizationRate);

        // 7. Calculate Efficiency (Revenue Attribution)
        const efficiencyMap = {}; // techName -> { billedHours, laborRevenue, cost }
        techs.forEach(tech => {
            efficiencyMap[tech.full_name] = {
                name: tech.full_name,
                billedHours: 0,
                laborRevenue: 0,
                cost: techUtilizationMap[tech.full_name].projectHours * (tech.pay_rate || 0),
                projectHours: techUtilizationMap[tech.full_name].projectHours
            };
        });

        // Group sessions by RO to find Total Project Hours per Work Order IN THIS PERIOD
        const woPeriodStats = {}; // roNumber -> { totalHours, techHours: { name: hours } }
        
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

        // Match with Base44 Work Orders and Attribute
        Object.keys(woPeriodStats).forEach(roNumber => {
            const wo = workOrders.find(w => w.ro_number === roNumber);
            if (!wo) return;

            const stats = woPeriodStats[roNumber];
            if (stats.totalHours === 0) return;

            // Calculate WO Total Billed Hours (from line items)
            let woTotalBilledHours = 0;
            try {
                const lines = JSON.parse(wo.line_items || '[]');
                lines.forEach(line => {
                    if (line.hrs > 0) woTotalBilledHours += parseFloat(line.hrs);
                });
            } catch (e) {}

            const woLaborRevenue = wo.labor_total || 0;

            // Attribute to each tech
            Object.keys(stats.techHours).forEach(techName => {
                if (efficiencyMap[techName]) {
                    const techHoursOnWo = stats.techHours[techName];
                    const proportionalShare = techHoursOnWo / stats.totalHours; // Share of effort IN THIS PERIOD

                    // Revenue Attribution
                    efficiencyMap[techName].laborRevenue += (woLaborRevenue * proportionalShare);
                    
                    // Billed Hours Attribution
                    efficiencyMap[techName].billedHours += (woTotalBilledHours * proportionalShare);
                }
            });
        });

        const efficiencyList = Object.values(efficiencyMap).sort((a, b) => b.laborRevenue - a.laborRevenue);

        // 8. Progress Bar Logic
        // Target = Payroll Est
        const cf = cashFlowSummary[0] || {};
        const payrollTarget = (cf.est_first_payroll || 0) + (cf.est_second_payroll || 0) + (cf.est_payroll_remit || 0);
        
        // Current Month Labour Sales (Invoiced in current calendar month)
        const now = new Date();
        const currentMonthStart = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit' 
        }).format(now) + '-01';
        
        // Find end of month roughly or just check >= start
        // Actually simplest is just substring match YYYY-MM
        const currentYYYYMM = currentMonthStart.substring(0, 7);

        const currentMonthLabourSales = workOrders.reduce((sum, wo) => {
            if (wo.invoice_date && wo.invoice_date.startsWith(currentYYYYMM)) {
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
}