import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, TrendingUp, Clock, Users, Loader2, BarChart3, Calculator } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Progress } from "@/components/ui/progress";

export default function TechnicianPerformanceReportModal({ open, onClose }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState({
    utilization: [],
    efficiency: [],
    progress: { target: 0, current: 0 }
  });

  // Helper to convert UTC to Mountain Time date string
  const toMountainTimeDate = (utcDateString) => {
    if (!utcDateString) return "";
    const date = new Date(utcDateString);
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  };

  const setDateRange = (range) => {
    const today = new Date();
    let start, end;

    switch (range) {
      case 'last30':
        end = today;
        start = subDays(today, 30);
        break;
      case 'thisMonth':
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case 'lastMonth':
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case 'thisQuarter':
        start = startOfQuarter(today);
        end = endOfQuarter(today);
        break;
      case 'thisYear':
        start = startOfYear(today);
        end = endOfYear(today);
        break;
      case 'lastYear':
        start = startOfYear(subMonths(today, 12));
        end = endOfYear(subMonths(today, 12));
        break;
      default:
        return;
    }

    setDateFrom(format(start, "yyyy-MM-dd"));
    setDateTo(format(end, "yyyy-MM-dd"));
  };

  useEffect(() => {
    if (open) {
        setDateRange('thisMonth');
    }
  }, [open]);

  useEffect(() => {
    if (open && dateFrom && dateTo) {
      loadReportData();
    }
  }, [open, dateFrom, dateTo]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      // Fetch Data
      const [
        timeRecordsRes, 
        projectSessionsRes, 
        unassignedRes,
        employees,
        workOrders,
        cashFlowSummary
      ] = await Promise.all([
        base44.functions.invoke('workProProxy', { entityName: 'TimeRecord', method: 'filter', params: { _limit: 5000, _sort: '-clock_in_time' } }),
        base44.functions.invoke('workProProxy', { entityName: 'ProjectTimeSession', method: 'filter', params: { _limit: 5000, _sort: '-start_time' } }),
        base44.functions.invoke('workProProxy', { entityName: 'UnassignedTime', method: 'filter', params: { _limit: 5000, _sort: '-start_time' } }),
        base44.entities.Employee.list(),
        base44.entities.WorkOrder.list('-wo_date', 2000), // Get recent WOs
        base44.entities.CashFlowSummary.list()
      ]);

      const timeRecords = timeRecordsRes.data?.data || [];
      const projectSessions = projectSessionsRes.data?.data || [];
      const unassignedSessions = unassignedRes.data?.data || []; // Might be empty if entity doesn't exist
      const cfSummary = cashFlowSummary[0] || {};

      // Filter by Date Range
      const filterByDate = (record, dateField) => {
        if (!record[dateField]) return false;
        const date = toMountainTimeDate(record[dateField]);
        return date >= dateFrom && date <= dateTo;
      };

      const filteredTimeRecords = timeRecords.filter(r => filterByDate(r, 'clock_in_time'));
      const filteredSessions = projectSessions.filter(s => filterByDate(s, 'start_time'));
      const filteredUnassigned = unassignedSessions.filter(s => filterByDate(s, 'start_time'));

      // --- Calculate Utilization ---
      const techUtilizationMap = {};
      
      // Initialize with employees
      const techs = employees.filter(e => e.employee_type === 'tech' || e.position === 'Technician');
      techs.forEach(tech => {
        techUtilizationMap[tech.full_name] = {
            name: tech.full_name,
            payRate: tech.pay_rate || 0,
            clockedHours: 0,
            projectHours: 0,
            unassignedHours: 0
        };
      });

      filteredTimeRecords.forEach(r => {
        if (techUtilizationMap[r.employee_name]) {
            techUtilizationMap[r.employee_name].clockedHours += (r.total_hours || 0);
        }
      });

      filteredSessions.forEach(s => {
        // Map user_name to tech name (assuming match)
        // If not found, check partial match or ignore
        let techName = s.user_name;
        if (techUtilizationMap[techName]) {
            techUtilizationMap[techName].projectHours += (s.total_hours || 0);
        }
      });

      filteredUnassigned.forEach(s => {
        let techName = s.user_name;
        if (techUtilizationMap[techName]) {
            techUtilizationMap[techName].unassignedHours += (s.total_hours || 0);
        }
      });

      // Calculate Unassigned if not tracked explicitly or add logic
      Object.values(techUtilizationMap).forEach(tech => {
         if (filteredUnassigned.length === 0) {
             // Fallback calculation
             tech.unassignedHours = Math.max(0, tech.clockedHours - tech.projectHours);
         }
         const total = tech.projectHours + tech.unassignedHours; // Denominator? Or just Clocked Hours?
         // Utilization usually = Project Hours / Clocked Hours * 100
         tech.utilizationRate = tech.clockedHours > 0 
            ? (tech.projectHours / tech.clockedHours) * 100 
            : 0;
      });

      const utilizationList = Object.values(techUtilizationMap).sort((a, b) => b.utilizationRate - a.utilizationRate);


      // --- Calculate Efficiency ---
      // 1. Group Project Sessions by Project Name (RO Number)
      const projectSessionsByRO = {};
      filteredSessions.forEach(s => {
        if (!s.project_name) return;
        // Clean RO Number - WorkPRO might have "RO50382 - Description"
        // Assume project_name STARTS with RO number or IS the RO number
        const roMatch = s.project_name.match(/^(RO\d+)/i);
        const roNumber = roMatch ? roMatch[1].toUpperCase() : s.project_name; // Fallback to full name if no match

        if (!projectSessionsByRO[roNumber]) {
            projectSessionsByRO[roNumber] = { totalHours: 0, techHours: {} };
        }
        projectSessionsByRO[roNumber].totalHours += (s.total_hours || 0);
        if (!projectSessionsByRO[roNumber].techHours[s.user_name]) {
            projectSessionsByRO[roNumber].techHours[s.user_name] = 0;
        }
        projectSessionsByRO[roNumber].techHours[s.user_name] += (s.total_hours || 0);
      });

      // 2. Map WOs to Project Sessions
      const efficiencyMap = {}; // techName -> { billedHours, laborRevenue, cost }
      
      // Initialize
      techs.forEach(tech => {
        efficiencyMap[tech.full_name] = {
            billedHours: 0,
            laborRevenue: 0,
            cost: techUtilizationMap[tech.full_name].projectHours * (tech.pay_rate || 0),
            projectHours: techUtilizationMap[tech.full_name].projectHours,
            name: tech.full_name
        };
      });

      // Iterate WOs in date range (or that have sessions in date range?)
      // User says "versus the techincian project hours for the period reported".
      // We should look at WOs that match the PROJECT sessions in the period.
      // Or WOs that were active in the period.
      // Let's iterate the WOs found in projectSessionsByRO.
      // Also iterate WOs that are "open vs closed" in period? 
      // Simplified approach: Iterate all WOs fetched. If they have project sessions in this period, attribute revenue.
      // BUT, revenue is total for the WO. If the WO spans months, do we count full revenue?
      // Usually "Sales Billed" means invoices generated in the period.
      // Let's filter WOs by `invoice_date` (if closed) or `wo_date` (if open) falling in range?
      // Or just filter WOs that have an `invoice_date` in the range?
      // "labour revenue sales amount billed (open vs closed)"
      // implies we count revenue for Open WOs too? (Work in Progress revenue?)
      // Let's filter WOs by `last_updated` or just check if they are in the list.
      // Better: Iterate ALL WOs. If `invoice_date` is in range OR (`status` != 'Completed' AND `wo_date` <= rangeEnd).
      // For simplicity and alignment with "Sales Amount Billed", let's stick to WOs with activity in the period or invoiced in period.
      
      // Actually, to attribute revenue to the tech based on THEIR hours in THIS period:
      // We should attribute `(Tech Hours in Period / Total WO Hours) * Total WO Revenue`?
      // No, that assumes all revenue was earned in this period.
      // Let's look at WOs that have an `invoice_date` in the selected range (Closed) OR are Open.
      // This is getting complex. Let's stick to the user's "Sales Amount Billed" - implies Invoiced.
      // But they said "open vs closed".
      // Let's just iterate ALL fetched WOs. 
      // If WO is in `projectSessionsByRO` (meaning work was done in this period):
      //    We attribute revenue. 
      //    But wait, if work was done, but not billed yet?
      //    The user wants "Labour Revenue Sales Amount Billed".
      //    Maybe "Billed" means "Invoiced".
      //    And "Open" means "Estimated/Approved but not invoiced".
      //    Let's calculate "Potential Revenue" for Open and "Actual Revenue" for Closed.
      //    And sum them up?
      //    Let's just sum `labor_total` for all WOs touched in this period.
      
      const processedWOs = new Set();
      
      // Process WOs that have sessions
      Object.entries(projectSessionsByRO).forEach(([roNumber, sessionData]) => {
         const wo = workOrders.find(w => w.ro_number === roNumber);
         if (!wo) return;

         processedWOs.add(roNumber);

         // Calculate total billed hours from line items
         let totalBilledHours = 0;
         try {
             const lines = JSON.parse(wo.line_items || '[]');
             lines.forEach(line => {
                 // Check if it's labor? Usually `hrs` > 0
                 if (line.hrs > 0) totalBilledHours += parseFloat(line.hrs);
             });
         } catch (e) {}

         // Attribute to techs
         Object.entries(sessionData.techHours).forEach(([techName, hours]) => {
             if (efficiencyMap[techName]) {
                 const ratio = sessionData.totalHours > 0 ? (hours / sessionData.totalHours) : 0;
                 // Attribute proportional revenue/billed hours
                 efficiencyMap[techName].laborRevenue += (wo.labor_total || 0) * ratio;
                 efficiencyMap[techName].billedHours += totalBilledHours * ratio;
             }
         });
      });

      const efficiencyList = Object.values(efficiencyMap).sort((a, b) => b.laborRevenue - a.laborRevenue);


      // --- Progress Bar ---
      // Target: Payroll Total
      // `est_first_payroll` + `est_second_payroll` + `est_payroll_remit`
      const payrollTarget = (cfSummary.est_first_payroll || 0) + (cfSummary.est_second_payroll || 0) + (cfSummary.est_payroll_remit || 0);

      // Progress: Current calendar month's labour sales
      // Filter WOs by current month (regardless of selected range?) "current calendar month's labour sales"
      const now = new Date();
      const currentMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const currentMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      
      const currentMonthWOs = workOrders.filter(wo => {
         // Use invoice_date if converted, or wo_date? 
         // "Sales" usually implies Invoiced.
         // But let's check `invoice_date`.
         if (wo.invoice_date) {
             const d = toMountainTimeDate(wo.invoice_date);
             return d >= currentMonthStart && d <= currentMonthEnd;
         }
         return false;
      });

      const currentMonthLabourSales = currentMonthWOs.reduce((sum, wo) => sum + (wo.labor_total || 0), 0);

      setReportData({
        utilization: utilizationList,
        efficiency: efficiencyList,
        progress: {
            target: payrollTarget,
            current: currentMonthLabourSales
        }
      });

    } catch (error) {
      console.error("Error loading report data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Technician Performance Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 bg-slate-50 p-4 rounded-lg items-end">
            <div className="space-y-2 min-w-[150px]">
               <Label>Quick Select</Label>
               <Select onValueChange={setDateRange} defaultValue="thisMonth">
                 <SelectTrigger>
                   <SelectValue placeholder="Select Range" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="last30">Last 30 Days</SelectItem>
                   <SelectItem value="thisMonth">This Month</SelectItem>
                   <SelectItem value="lastMonth">Last Month</SelectItem>
                   <SelectItem value="thisQuarter">This Quarter</SelectItem>
                   <SelectItem value="thisYear">This Year</SelectItem>
                   <SelectItem value="lastYear">Last Year</SelectItem>
                 </SelectContent>
               </Select>
            </div>
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button onClick={loadReportData} disabled={isLoading || !dateFrom || !dateTo}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Run Report
            </Button>
          </div>

          {/* Progress Bar */}
          <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">
                    Monthly Payroll Target vs Labour Sales
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-bold text-blue-600">Current: ${reportData.progress.current.toFixed(2)}</span>
                        <span className="text-slate-500">Target: ${reportData.progress.target.toFixed(2)}</span>
                    </div>
                    <Progress value={(reportData.progress.current / (reportData.progress.target || 1)) * 100} className="h-3" />
                </div>
            </CardContent>
          </Card>

          {/* Utilization Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Technician Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Technician</TableHead>
                    <TableHead className="text-right">Clocked Hours</TableHead>
                    <TableHead className="text-right">Project Hours</TableHead>
                    <TableHead className="text-right">Unassigned Hours</TableHead>
                    <TableHead className="text-right">Utilization Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.utilization.map((tech, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{tech.name}</TableCell>
                      <TableCell className="text-right">{tech.clockedHours.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600">{tech.projectHours.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-orange-600">{tech.unassignedHours.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-bold ${
                        tech.utilizationRate >= 80 ? 'text-green-600' : tech.utilizationRate >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {tech.utilizationRate.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  {reportData.utilization.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500">No data found</TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Efficiency Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Efficiency Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Technician</TableHead>
                    <TableHead className="text-right">Project Hours</TableHead>
                    <TableHead className="text-right">Hours Billed</TableHead>
                    <TableHead className="text-right">Labour Revenue</TableHead>
                    <TableHead className="text-right">Cost (Est.)</TableHead>
                    <TableHead className="text-right">Efficiency (Rev/Cost)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.efficiency.map((tech, idx) => {
                      const efficiencyRatio = tech.cost > 0 ? (tech.laborRevenue / tech.cost) : 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{tech.name}</TableCell>
                          <TableCell className="text-right">{tech.projectHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{tech.billedHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600">${tech.laborRevenue.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-red-600">${tech.cost.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-bold ${
                            efficiencyRatio >= 3 ? 'text-green-600' : efficiencyRatio >= 2 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {efficiencyRatio.toFixed(2)}x
                          </TableCell>
                        </TableRow>
                      );
                  })}
                   {reportData.efficiency.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-500">No data found</TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>
      </DialogContent>
    </Dialog>
  );
}