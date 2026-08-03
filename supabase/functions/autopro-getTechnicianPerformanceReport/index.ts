import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const PAGE_SIZE = 1000;
const TECHNICIAN_WORK_ORDER_SELECT = 'id, ro_number, wo_number, est_number, inv_number, crinv_number, wo_date, tech_time, line_items, labor_total';
const EMPLOYEE_SELECT = 'full_name, position, employee_type, pay_rate';
const TIME_RECORD_SELECT = 'employee_name, clock_in_time, total_hours';
const PROJECT_TIME_SESSION_SELECT = 'project_id, project_name, user_name, user_email, start_time, total_hours';
const PROJECT_SELECT = 'id, work_order, name';
const UNASSIGNED_TIME_SELECT = 'user_name, start_time, total_hours';

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

    const { dateFrom, dateTo } = await req.json().catch(() => ({}));

    const [timeRecords, projectSessions, projects, unassignedSessions, employees] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('TimeRecord')
          .select(TIME_RECORD_SELECT)
          .order('clock_in_time', { ascending: false, nullsFirst: false })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('ProjectTimeSession')
          .select(PROJECT_TIME_SESSION_SELECT)
          .order('start_time', { ascending: false, nullsFirst: false })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('Project')
          .select(PROJECT_SELECT)
          .order('created_date', { ascending: false, nullsFirst: false })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('UnassignedTime')
          .select(UNASSIGNED_TIME_SELECT)
          .order('start_time', { ascending: false, nullsFirst: false })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('Employee')
          .select(EMPLOYEE_SELECT)
          .order('id', { ascending: true })
          .range(from, to)
      )
    ]);

    // Filter WorkPro Data by Date (Mountain Time aware)
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

    // Index WorkOrders for matching
    console.log("Fetching WorkOrders...");
    const workOrders = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(TECHNICIAN_WORK_ORDER_SELECT)
        .gte('wo_date', dateFrom)
        .lte('wo_date', dateTo)
        .order('wo_date', { ascending: false, nullsFirst: false })
        .range(from, to)
    );

    console.log(`Fetched ${workOrders.length} Work Orders for report period.`);

    // Map WorkOrders by various keys for robust matching
    const woMap = {};
    workOrders.forEach(wo => {
      if (wo.id) woMap[wo.id] = wo;

      const addWoToMap = (num) => {
        if (num) {
          const cleanedNum = num.toString().trim();
          if (cleanedNum) {
            woMap[cleanedNum] = wo;
            if (!cleanedNum.toUpperCase().startsWith("RO")) {
              woMap[`RO${cleanedNum}`] = wo;
            }
          }
        }
      };

      addWoToMap(wo.ro_number);
      addWoToMap(wo.wo_number);
      addWoToMap(wo.est_number);
      addWoToMap(wo.inv_number);
      addWoToMap(wo.crinv_number);
    });

    // Calculate Utilization
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
        techUtilizationMap[r.employee_name].clockedHours += parseFloat(r.total_hours) || 0;
      }
    });

    filteredSessions.forEach(s => {
      if (techUtilizationMap[s.user_name]) {
        techUtilizationMap[s.user_name].projectHours += parseFloat(s.total_hours) || 0;
      }
    });

    filteredUnassigned.forEach(s => {
      if (techUtilizationMap[s.user_name]) {
        techUtilizationMap[s.user_name].unassignedHours += parseFloat(s.total_hours) || 0;
      }
    });

    Object.values(techUtilizationMap).forEach(tech => {
      const totalAccountedHours = tech.projectHours + tech.unassignedHours;
      tech.utilizationRate = tech.clockedHours > 0
        ? (totalAccountedHours / tech.clockedHours) * 100
        : 0;
    });

    const utilizationList = Object.values(techUtilizationMap).sort((a, b) => b.utilizationRate - a.utilizationRate);

    // Calculate Efficiency (Revenue Attribution)
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

    const woAggregats = {};

    const projectMap = {};
    projects.forEach(p => {
      if (p.id && p.work_order) {
        projectMap[p.id] = p.work_order.toString();
      }
    });

    const findWorkOrder = (session) => {
      if (session.project_id && projectMap[session.project_id]) {
        const woNum = projectMap[session.project_id];
        if (woMap[woNum]) return woMap[woNum];
        if (woMap[`RO${woNum}`]) return woMap[`RO${woNum}`];
        if (woNum.toUpperCase().startsWith("RO") && woMap[woNum.substring(2)]) {
          return woMap[woNum.substring(2)];
        }
      }

      if (session.project_id && woMap[session.project_id]) {
        return woMap[session.project_id];
      }

      if (!session.project_name) return null;
      const name = session.project_name.trim();

      if (woMap[name]) return woMap[name];

      const roMatch = name.match(/(\d+)/);
      if (roMatch) {
        const extracted = roMatch[1];
        if (woMap[extracted]) return woMap[extracted];
        if (woMap[`RO${extracted}`]) return woMap[`RO${extracted}`];
      }

      const tokens = name.split(/[^a-zA-Z0-9]/);
      for (const token of tokens) {
        if (token && woMap[token]) return woMap[token];
      }

      return null;
    };

    let matchedSessionsCount = 0;
    const unmatchedExamples = [];

    filteredSessions.forEach(s => {
      const wo = findWorkOrder(s);
      if (!wo) {
        if (unmatchedExamples.length < 5 && s.project_name) unmatchedExamples.push(`${s.project_name} (ID: ${s.project_id})`);
        return;
      }
      matchedSessionsCount++;

      if (!woAggregats[wo.id]) {
        woAggregats[wo.id] = { totalHours: 0, techHours: {}, wo: wo };
      }

      const stats = woAggregats[wo.id];
      const sessionHours = parseFloat(s.total_hours) || 0;
      stats.totalHours += sessionHours;

      if (!stats.techHours[s.user_name]) {
        stats.techHours[s.user_name] = 0;
      }
      stats.techHours[s.user_name] += sessionHours;
    });

    // Process Manual Logs (from WorkOrders)
    workOrders.forEach(wo => {
      if (wo.tech_time) {
        try {
          const manualLogs = JSON.parse(wo.tech_time);
          if (Array.isArray(manualLogs)) {
            if (!woAggregats[wo.id]) {
              woAggregats[wo.id] = { totalHours: 0, techHours: {}, wo: wo };
            }
            const stats = woAggregats[wo.id];

            manualLogs.forEach(log => {
              const hours = parseFloat(log.hours) || 0;
              const techName = log.tech_name || 'Unknown';

              stats.totalHours += hours;

              if (!stats.techHours[techName]) {
                stats.techHours[techName] = 0;
              }
              stats.techHours[techName] += hours;
            });
          }
        } catch (e) {
          // ignore
        }
      }
    });

    console.log(`Matched ${matchedSessionsCount} out of ${filteredSessions.length} sessions to Work Orders.`);
    if (unmatchedExamples.length > 0) console.log("Unmatched Examples:", unmatchedExamples);

    // Distribute Revenue
    Object.values(woAggregats).forEach(stats => {
      if (stats.totalHours === 0) return;

      const wo = stats.wo;
      let woTotalBilledHours = 0;
      try {
        const lines = JSON.parse(wo.line_items || '[]');
        lines.forEach(line => {
          if (line.hrs > 0) {
            woTotalBilledHours += parseFloat(line.hrs);
          }
        });
      } catch (e) {}

      let woLaborRevenue = 0;
      if (wo.labor_total) {
        if (typeof wo.labor_total === 'number') {
          woLaborRevenue = wo.labor_total;
        } else if (typeof wo.labor_total === 'string') {
          woLaborRevenue = parseFloat(wo.labor_total.replace(/[$,]/g, '')) || 0;
        }
      }

      Object.keys(stats.techHours).forEach(techName => {
        let targetTech = efficiencyMap[techName];

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

    const efficiencyList = Object.values(efficiencyMap).map(tech => {
      const revPerHour = tech.projectHours > 0 ? tech.laborRevenue / tech.projectHours : 0;
      const billingEfficiency = tech.projectHours > 0 ? (tech.billedHours / tech.projectHours) * 100 : 0;
      return {
        ...tech,
        revPerHour,
        billingEfficiency
      };
    }).sort((a, b) => b.revPerHour - a.revPerHour);

    // Progress Bar Logic
    const { data: cashFlowSummaryRows, error: cfsError } = await supabase
      .from('CashFlowSummary')
      .select('est_first_payroll, est_second_payroll, est_payroll_remit')
      .limit(1);
    if (cfsError) throw cfsError;

    const cf = (cashFlowSummaryRows && cashFlowSummaryRows[0]) || {};
    const payrollTarget = (cf.est_first_payroll || 0) + (cf.est_second_payroll || 0) + (cf.est_payroll_remit || 0);

    const currentMonthStart = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit'
    }).format(new Date());
    // Note: format returns YYYY-MM

    const currentMonthLabourSales = workOrders.reduce((sum, wo) => {
      if (wo.wo_date && wo.wo_date.startsWith(currentMonthStart)) {
        let val = 0;
        if (typeof wo.labor_total === 'number') {
          val = wo.labor_total;
        } else if (typeof wo.labor_total === 'string') {
          val = parseFloat(wo.labor_total.replace(/[$,]/g, '')) || 0;
        }
        return sum + val;
      }
      return sum;
    }, 0);

    return new Response(JSON.stringify({
      utilization: utilizationList,
      efficiency: efficiencyList,
      progress: {
        target: payrollTarget,
        current: currentMonthLabourSales
      }
    }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
