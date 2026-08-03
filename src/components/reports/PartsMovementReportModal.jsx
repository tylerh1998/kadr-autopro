import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { supabase } from "@/lib/supabase";

export default function PartsMovementReportModal() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: 'totalQty', direction: 'desc' });

  const uniqueCategories = React.useMemo(() => {
    const cats = new Set(reportData.map(item => item.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [reportData]);

  const filteredData = React.useMemo(() => {
    let items = reportData;
    if (selectedCategory !== "all") {
      items = items.filter(item => item.category === selectedCategory);
    }
    return items;
  }, [reportData, selectedCategory]);

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

  // Automatic data loading removed; users must click "Run Report"

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_parts_movement_v2', {
        p_start_date: dateFrom,
        p_end_date: dateTo,
        p_search_term: debouncedSearch
      });

      if (error) throw error;

      if (data) {
        setReportData(data);
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
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        // Handle calculated totals for sorting
        if (sortConfig.key === 'totalQty') {
          valA = (a.invoiced_qty || 0) + (a.wip_qty || 0);
          valB = (b.invoiced_qty || 0) + (b.wip_qty || 0);
        }
        if (sortConfig.key === 'totalSalesAmount') {
          valA = (a.invoiced_amount || 0) + (a.wip_amount || 0);
          valB = (b.invoiced_amount || 0) + (b.wip_amount || 0);
        }

        if (valA < valB) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const totals = React.useMemo(() => {
    return filteredData.reduce((acc, item) => {
      acc.wipQty += (item.wip_qty || 0);
      acc.wipAmount += (item.wip_amount || 0);
      acc.invoicedQty += (item.invoiced_qty || 0);
      acc.invoicedAmount += (item.invoiced_amount || 0);
      acc.totalQty += (item.invoiced_qty || 0) + (item.wip_qty || 0);
      acc.totalAmount += (item.invoiced_amount || 0) + (item.wip_amount || 0);
      return acc;
    }, { wipQty: 0, wipAmount: 0, invoicedQty: 0, invoicedAmount: 0, totalQty: 0, totalAmount: 0 });
  }, [filteredData]);

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
            <div className="space-y-2 min-w-[200px]">
               <Label>Category Filter</Label>
               <Select onValueChange={setSelectedCategory} value={selectedCategory}>
                 <SelectTrigger>
                   <SelectValue placeholder="All Categories" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Categories</SelectItem>
                   {uniqueCategories.map(cat => (
                     <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                   ))}
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
            
            <div className="space-y-2 flex-1 min-w-[300px]">
                <div className="flex justify-between items-center">
                    <Label>Search Parts</Label>
                    <div className="flex gap-4 text-xs font-medium text-blue-600">
                      <button onClick={() => setDateRange('last30')} className="hover:underline hover:text-blue-800 transition-colors">Last 30</button>
                      <button onClick={() => setDateRange('thisMonth')} className="hover:underline hover:text-blue-800 transition-colors">This Month</button>
                      <button onClick={() => setDateRange('lastMonth')} className="hover:underline hover:text-blue-800 transition-colors">Last Month</button>
                      <button onClick={() => setDateRange('thisQuarter')} className="hover:underline hover:text-blue-800 transition-colors">This Qtr</button>
                      <button onClick={() => setDateRange('thisYear')} className="hover:underline hover:text-blue-800 transition-colors">This Year</button>
                      <button onClick={() => setDateRange('lastYear')} className="hover:underline hover:text-blue-800 transition-colors">Last Year</button>
                    </div>
                </div>
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
                    <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('listPrice')}>
                      <div className="flex items-center">List Price <SortIcon columnKey="listPrice" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 bg-amber-50" onClick={() => handleSort('wip_qty')}>
                      <div className="flex items-center justify-end">WIP Qty <SortIcon columnKey="wip_qty" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 bg-amber-50" onClick={() => handleSort('wip_amount')}>
                      <div className="flex items-center justify-end">WIP Amt <SortIcon columnKey="wip_amount" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 bg-green-50" onClick={() => handleSort('invoiced_qty')}>
                      <div className="flex items-center justify-end">Invoiced Qty <SortIcon columnKey="invoiced_qty" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 bg-green-50" onClick={() => handleSort('invoiced_amount')}>
                      <div className="flex items-center justify-end">Invoiced Amt <SortIcon columnKey="invoiced_amount" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 font-bold" onClick={() => handleSort('totalQty')}>
                      <div className="flex items-center justify-end">Total Qty <SortIcon columnKey="totalQty" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 font-bold" onClick={() => handleSort('totalSalesAmount')}>
                      <div className="flex items-center justify-end">Total Amt <SortIcon columnKey="totalSalesAmount" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium">{item.part_number}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>
                        ${(item.list_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right bg-amber-50/30 text-amber-700">
                        {Number(item.wip_qty || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right bg-amber-50/30 text-amber-700">
                        ${Number(item.wip_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right bg-green-50/30 text-green-700">
                        {Number(item.invoiced_qty || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right bg-green-50/30 text-green-700">
                        ${Number(item.invoiced_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        {(Number(item.invoiced_qty || 0) + Number(item.wip_qty || 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        ${(Number(item.invoiced_amount || 0) + Number(item.wip_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {reportData.length === 0 && !isLoading && (
                      <TableRow>
                          <TableCell colSpan={10} className="text-center text-slate-500 py-8">
                            No parts found matching criteria
                          </TableCell>
                      </TableRow>
                  )}
                  {isLoading && (
                      <TableRow>
                          <TableCell colSpan={10} className="text-center py-8">
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
                        <span className="text-slate-500 mr-2">Total WIP Qty:</span>
                        <span className="text-amber-700">{totals.wipQty.toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Total WIP Amt:</span>
                        <span className="text-amber-700">${totals.wipAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Total Inv Qty:</span>
                        <span className="text-green-700">{totals.invoicedQty.toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Total Inv Amt:</span>
                        <span className="text-green-700">${totals.invoicedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Grand Total Qty:</span>
                        <span className="text-blue-700">{totals.totalQty.toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-2">Grand Total Amt:</span>
                        <span className="text-blue-700">${totals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </CardFooter>
          </Card>
    </div>
  );
}