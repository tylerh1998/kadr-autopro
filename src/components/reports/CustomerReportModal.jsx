import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { base44 } from "@/api/base44Client";

export default function CustomerReportModal() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState([]);

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
      case 'allTime':
          setDateFrom("");
          setDateTo("");
          return;
      default:
        return;
    }

    setDateFrom(format(start, "yyyy-MM-dd"));
    setDateTo(format(end, "yyyy-MM-dd"));
  };

  useEffect(() => {
    setDateRange('thisYear');
  }, []);

  useEffect(() => {
    // If dates are cleared (all time) or both set, load data
    if ((dateFrom && dateTo) || (!dateFrom && !dateTo)) {
      loadReportData();
    }
  }, [dateFrom, dateTo]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await base44.functions.invoke('getCustomerReportData', { 
        dateFrom, 
        dateTo 
      });

      if (error) throw new Error(error);

      if (data && data.data) {
        setReportData(data.data);
      }
    } catch (error) {
      console.error("Error loading customer report data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate totals for footer
  const totalSales = reportData.reduce((sum, item) => sum + item.totalSales, 0);
  const totalCount = reportData.reduce((sum, item) => sum + item.workOrderCount, 0);
  const totalAvg = totalCount > 0 ? totalSales / totalCount : 0;

  return (
    <div className="space-y-6 h-full flex flex-col">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 bg-slate-50 p-4 rounded-lg items-end shrink-0">
            <div className="space-y-2 min-w-[150px]">
               <Label>Quick Select</Label>
               <Select onValueChange={setDateRange} defaultValue="thisYear">
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
                   <SelectItem value="allTime">All Time</SelectItem>
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
            <Button onClick={loadReportData} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Run Report
            </Button>
          </div>

          {/* Report Table */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Customer Sales Report
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow className="bg-slate-50">
                    <TableHead>Customer Name</TableHead>
                    <TableHead className="text-right"># Work Orders</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Avg. WO Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.workOrderCount}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        ${item.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        ${item.averageTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {reportData.length === 0 && !isLoading && (
                      <TableRow>
                          <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                            No data found for the selected period
                          </TableCell>
                      </TableRow>
                  )}
                  {isLoading && (
                      <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            <div className="flex justify-center items-center gap-2 text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading report data...
                            </div>
                          </TableCell>
                      </TableRow>
                  )}
                </TableBody>
                {/* Footer with totals */}
                {!isLoading && reportData.length > 0 && (
                    <tfoot className="sticky bottom-0 bg-slate-100 z-10 font-bold border-t">
                        <TableRow>
                            <TableCell>Totals</TableCell>
                            <TableCell className="text-right">{totalCount}</TableCell>
                            <TableCell className="text-right text-green-700">
                                ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-blue-700">
                                ${totalAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                        </TableRow>
                    </tfoot>
                )}
              </Table>
            </CardContent>
          </Card>
    </div>
  );
}