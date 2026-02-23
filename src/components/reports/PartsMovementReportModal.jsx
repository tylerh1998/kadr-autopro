import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Search } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { base44 } from "@/api/base44Client";

export default function PartsMovementReportModal() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState([]);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

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
  }, [dateFrom, dateTo, debouncedSearch]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await base44.functions.invoke('getPartsMovementReport', { 
        dateFrom, 
        dateTo,
        search: debouncedSearch
      });

      if (error) throw new Error(error);

      if (data && data.data) {
        setReportData(data.data);
      }
    } catch (error) {
      console.error("Error loading parts movement report:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 bg-slate-50 p-4 rounded-lg items-end shrink-0">
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
            
            <div className="space-y-2 flex-1 min-w-[200px]">
                <Label>Search Parts</Label>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by Part #, Description, Category..." 
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
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
                <Package className="w-5 h-5 text-blue-600" />
                Parts Movement Report
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow className="bg-slate-50">
                    <TableHead>Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">List Price</TableHead>
                    <TableHead className="text-right"># of Sales</TableHead>
                    <TableHead className="text-right">Amt of Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium">{item.partNumber}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-right">
                        ${(item.listPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        {item.salesCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        ${(item.totalSalesAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {reportData.length === 0 && !isLoading && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                            No parts found matching criteria
                          </TableCell>
                      </TableRow>
                  )}
                  {isLoading && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            <div className="flex justify-center items-center gap-2 text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading report data...
                            </div>
                          </TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
    </div>
  );
}