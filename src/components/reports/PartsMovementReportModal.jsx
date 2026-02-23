import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { base44 } from "@/api/base44Client";

export default function PartsMovementReportModal() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'salesCount', direction: 'desc' });

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

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    let sortableItems = [...reportData];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        // Handle null/undefined
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        // String comparison
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toString().toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [reportData, sortConfig]);

  const totals = React.useMemo(() => {
    return reportData.reduce((acc, item) => {
      acc.salesCount += (item.salesCount || 0);
      acc.totalSalesAmount += (item.totalSalesAmount || 0);
      return acc;
    }, { salesCount: 0, totalSalesAmount: 0 });
  }, [reportData]);

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-4 h-4 ml-1 text-slate-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-4 h-4 ml-1 text-blue-600" /> 
      : <ArrowDown className="w-4 h-4 ml-1 text-blue-600" />;
  };

  return (
    <div className="space-y-6 h-full flex flex-col min-h-0">
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
          <Card className="flex-1 flex flex-col overflow-hidden min-h-0 shadow-sm border-slate-200">
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
                    <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('partNumber')}>
                      <div className="flex items-center">Part # <SortIcon columnKey="partNumber" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('description')}>
                      <div className="flex items-center">Description <SortIcon columnKey="description" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('category')}>
                      <div className="flex items-center">Category <SortIcon columnKey="category" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('listPrice')}>
                      <div className="flex items-center justify-end">List Price <SortIcon columnKey="listPrice" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('salesCount')}>
                      <div className="flex items-center justify-end"># of Sales <SortIcon columnKey="salesCount" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalSalesAmount')}>
                      <div className="flex items-center justify-end">Amt of Sales <SortIcon columnKey="totalSalesAmount" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((item, idx) => (
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
                          <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                            No parts found matching criteria
                          </TableCell>
                      </TableRow>
                  )}
                  {isLoading && (
                      <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
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
            <CardFooter className="bg-slate-100 border-t p-4 shrink-0">
                <div className="w-full flex justify-end gap-8 text-sm font-bold">
                    <div>
                        <span className="text-slate-500 mr-2">Total Quantity:</span>
                        <span className="text-blue-700">{totals.salesCount.toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Total Sales Amount:</span>
                        <span className="text-green-700">${totals.totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </CardFooter>
          </Card>
    </div>
  );
}