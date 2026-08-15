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
import { supabase } from "@/lib/supabase";
import { Progress } from "@/components/ui/progress";

export default function TechnicianPerformanceReportModal() {
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
    setDateRange('thisMonth');
  }, []);

  useEffect(() => {
    if (dateFrom && dateTo) {
      loadReportData();
    }
  }, [dateFrom, dateTo]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('autopro-getTechnicianPerformanceReport', {
        body: { dateFrom, dateTo }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data) {
        setReportData(data);
      }
    } catch (error) {
      console.error("Error loading report data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg items-end">
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

          {/* Progress Bar — hidden until target > 0 (populated once monthly payroll target data exists) */}
          {reportData.progress.target > 0 && (
          <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Monthly Payroll Target vs Labour Sales
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-bold text-blue-600 dark:text-blue-400">Current: ${reportData.progress.current.toFixed(2)}</span>
                        <span className="text-slate-500 dark:text-slate-400">Target: ${reportData.progress.target.toFixed(2)}</span>
                    </div>
                    <Progress value={(reportData.progress.current / (reportData.progress.target || 1)) * 100} className="h-3" />
                </div>
            </CardContent>
          </Card>
          )}

          {/* Utilization Report */}
          {/*
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
          */}

          {/* Efficiency Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Efficiency Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800">
                    <TableHead>Technician</TableHead>
                    <TableHead className="text-right">Project Hours</TableHead>
                    <TableHead className="text-right">Hours Billed</TableHead>
                    <TableHead className="text-right">Labour Revenue</TableHead>
                    <TableHead className="text-right">Rev / Proj. Hr</TableHead>
                    <TableHead className="text-right">Billing Efficiency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.efficiency.map((tech, idx) => {
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{tech.name}</TableCell>
                          <TableCell className="text-right">{tech.projectHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{tech.billedHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600 dark:text-green-400">${tech.laborRevenue.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold">
                            ${(tech.revPerHour || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${
                            (tech.billingEfficiency || 0) >= 100 ? 'text-green-600 dark:text-green-400' : (tech.billingEfficiency || 0) >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {(tech.billingEfficiency || 0).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                  })}
                   {reportData.efficiency.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-500 dark:text-slate-400">No data found</TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

    </div>
  );
}