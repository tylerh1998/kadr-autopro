import React, { useState, useEffect } from "react";
import { Remittance } from "@/components/paypro/lib/payrollEntities";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, X, Columns3, Printer, ChevronDown, ChevronUp } from "lucide-react";

// Static Column Configuration for Remittances
const remittanceColumnsConfig = [
  {
    id: 'remittance_date',
    label: 'Remittance Date',
    renderCell: (rem) => rem.remittance_date ? rem.remittance_date.split('T')[0] : 'N/A',
    sortField: 'remittance_date',
    isNumeric: false,
    defaultVisible: true,
  },
  {
    id: 'period',
    label: 'Period',
    renderCell: (rem) => {
      const start = rem.period_start ? rem.period_start.split('T')[0] : 'N/A';
      const end = rem.period_end ? rem.period_end.split('T')[0] : 'N/A';
      return `${start} - ${end}`;
    },
    sortField: 'period_start',
    isNumeric: false,
    defaultVisible: true,
  },
  {
    id: 'total_gross_pay',
    label: 'Gross Pay',
    renderCell: (rem) => `$${(rem.total_gross_pay || 0).toFixed(2)}`,
    sortField: 'total_gross_pay',
    isNumeric: true,
    defaultVisible: true,
  },
  {
    id: 'total_income_tax',
    label: 'Income Tax',
    renderCell: (rem) => `$${(rem.total_income_tax || 0).toFixed(2)}`,
    sortField: 'total_income_tax',
    isNumeric: true,
    defaultVisible: true,
  },
  {
    id: 'total_cpp',
    label: 'CPP Total',
    renderCell: (rem) => {
        const total = (rem.total_cpp_employee || 0) + (rem.total_cpp_employer || 0);
        return `$${total.toFixed(2)}`;
    },
    sortField: null, // Computed
    isNumeric: true,
    defaultVisible: true,
    isCombinedField: true,
  },
  {
    id: 'total_ei',
    label: 'EI Total',
    renderCell: (rem) => {
        const total = (rem.total_ei_employee || 0) + (rem.total_ei_employer || 0);
        return `$${total.toFixed(2)}`;
    },
    sortField: null, // Computed
    isNumeric: true,
    defaultVisible: true,
    isCombinedField: true,
  },
  {
    id: 'total_remittance',
    label: 'Total Remitted',
    renderCell: (rem) => `$${(rem.total_remittance || 0).toFixed(2)}`,
    sortField: 'total_remittance',
    isNumeric: true,
    defaultVisible: true,
  },
  {
    id: 'status',
    label: 'Status',
    renderCell: (rem) => <Badge className="bg-green-100 text-green-800">{rem.status || 'Completed'}</Badge>,
    sortField: 'status',
    isNumeric: false,
    defaultVisible: true,
  },
];

export default function RemittancesReport() {
  // Filter States
  const [pendingDateFrom, setPendingDateFrom] = useState('');
  const [pendingDateTo, setPendingDateTo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [sortField, setSortField] = useState('remittance_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [visibleColumnIds, setVisibleColumnIds] = useState(
    remittanceColumnsConfig.filter(col => col.defaultVisible).map(col => col.id)
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Data Fetching
  const { data: remittances = [], isLoading } = useQuery({
    queryKey: ['paypro', 'remittances'],
    queryFn: () => Remittance.list('-remittance_date'),
  });

  // Default filters
  useEffect(() => {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const defaultFrom = threeMonthsAgo.toISOString().split('T')[0];
    const defaultTo = today.toISOString().split('T')[0];

    setPendingDateFrom(defaultFrom);
    setPendingDateTo(defaultTo);
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 ml-1 inline" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 ml-1 inline" />
      : <ArrowDown className="w-4 h-4 ml-1 inline" />;
  };

  const applyFilters = () => {
    setDateFrom(pendingDateFrom);
    setDateTo(pendingDateTo);
  };

  const clearFilters = () => {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const defaultFrom = threeMonthsAgo.toISOString().split('T')[0];
    const defaultTo = today.toISOString().split('T')[0];

    setPendingDateFrom(defaultFrom);
    setPendingDateTo(defaultTo);
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setFiltersOpen(false);
  };

  const filteredAndSortedRemittances = remittances
    .filter(rem => {
      if (dateFrom && new Date(rem.remittance_date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(rem.remittance_date) > new Date(dateTo)) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal, bVal;

      if (sortField === 'remittance_date' || sortField === 'period_start') {
         aVal = new Date(a[sortField] || a.created_date);
         bVal = new Date(b[sortField] || b.created_date);
      } else {
         aVal = a[sortField] || 0;
         bVal = b[sortField] || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const calculateTotals = () => {
    const totals = {};
    visibleColumnIds.forEach(colId => {
      const config = remittanceColumnsConfig.find(c => c.id === colId);
      if (config && config.isNumeric) {
          if (colId === 'total_cpp') {
            totals[colId] = filteredAndSortedRemittances.reduce((sum, r) => sum + (r.total_cpp_employee || 0) + (r.total_cpp_employer || 0), 0);
          } else if (colId === 'total_ei') {
            totals[colId] = filteredAndSortedRemittances.reduce((sum, r) => sum + (r.total_ei_employee || 0) + (r.total_ei_employer || 0), 0);
          } else {
            totals[colId] = filteredAndSortedRemittances.reduce((sum, r) => sum + (r[config.sortField] || 0), 0);
          }
      }
    });
    return totals;
  };

  const totals = calculateTotals();

  const handleExportCSV = () => {
    const visibleColumns = remittanceColumnsConfig.filter(col => visibleColumnIds.includes(col.id));
    const headers = visibleColumns.map(col => col.label);

    const rows = filteredAndSortedRemittances.map(rem => {
      return visibleColumns.map(col => {
        let val = col.renderCell(rem);
        // Extract text from React elements if needed
        if (React.isValidElement(val)) {
            val = val.props.children; // Simple extraction for Badge or basic elements
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remittances_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const visibleColumns = remittanceColumnsConfig.filter(col => visibleColumnIds.includes(col.id));

    const printHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Remittances Report - ${new Date().toLocaleDateString('en-CA')}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { -webkit-print-color-adjust: exact; font-family: sans-serif; }
        .text-xs { font-size: 0.75rem; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .font-bold { font-weight: 700; }
        .border { border: 1px solid #e2e8f0; }
        .p-1 { padding: 0.25rem; }
        .w-full { width: 100%; }
        .border-collapse { border-collapse: collapse; }
        .bg-gray-100 { background-color: #f3f4f6; }
        .bg-gray-700 { background-color: #374151; }
        .text-white { color: #fff; }
        .mb-4 { margin-bottom: 1rem; }
        .p-2 { padding: 0.5rem; }
      </style>
    </head>
    <body class="p-8">
      <div class="max-w-full mx-auto bg-white">
        <div class="flex justify-center items-center mb-6">
           <img src="https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg" style="max-height: 100px;" />
        </div>
        <div class="bg-gray-700 text-white p-2 text-center font-bold text-sm mb-4">
          REMITTANCES REPORT - Generated ${new Date().toLocaleDateString('en-US')}
        </div>

        <table class="w-full border-collapse border text-xs">
          <thead>
            <tr class="bg-gray-100">
              ${visibleColumns.map(col => `<th class="border p-1 ${col.isNumeric ? 'text-right' : 'text-left'}">${col.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${filteredAndSortedRemittances.map(rem => `
              <tr>
                ${visibleColumns.map(col => {
                    let val = col.renderCell(rem);
                    if (React.isValidElement(val)) val = val.props.children;
                    return `<td class="border p-1 ${col.isNumeric ? 'text-right' : ''}">${val}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
             <tr class="bg-gray-100 font-bold">
               ${visibleColumns.map((col, idx) => {
                   const total = col.isNumeric ? `$${totals[col.id]?.toFixed(2) || '0.00'}` : '';
                   return `<td class="border p-1 ${col.isNumeric ? 'text-right' : ''}">${idx === 0 ? 'Totals:' : total}</td>`;
               }).join('')}
             </tr>
          </tfoot>
        </table>
      </div>
    </body>
    </html>
    `;
    const w = window.open("", "_blank");
    w.document.write(printHTML);
    w.document.close();
    w.onload = () => w.print();
  };

  const handleColumnToggle = (columnId, checked) => {
    setVisibleColumnIds(prev => checked ? [...prev, columnId] : prev.filter(id => id !== columnId));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Remittances Report</h2>
        </div>
        <div className="flex gap-3">
          <Button onClick={handlePrint} disabled={filteredAndSortedRemittances.length === 0} variant="outline" className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button onClick={handleExportCSV} disabled={filteredAndSortedRemittances.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
            <Download className="w-4 h-4 mr-2" /> Export to CSV
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm mb-6 dark:bg-slate-900 dark:border-slate-800">
        <CardHeader className="cursor-pointer" onClick={() => setFiltersOpen(!filtersOpen)}>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 dark:text-slate-100">
              <Filter className="w-5 h-5" /> Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              {!filtersOpen && (dateFrom || dateTo) && <Badge variant="secondary" className="bg-blue-100 text-blue-800">Active</Badge>}
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen); }} className="dark:text-slate-300 dark:hover:bg-slate-800">
                {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {filtersOpen && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Date From</Label>
                <Input type="date" value={pendingDateFrom} onChange={(e) => setPendingDateFrom(e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Date To</Label>
                <Input type="date" value={pendingDateTo} onChange={(e) => setPendingDateTo(e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
               <Button variant="outline" size="sm" onClick={clearFilters} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><X className="w-4 h-4 mr-2" /> Clear</Button>
               <Button size="sm" onClick={applyFilters} className="bg-blue-600">Apply Filters</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="dark:text-slate-100">Remittance Data</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30">
                  <Columns3 className="w-4 h-4 mr-2" /> Customize Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 dark:bg-slate-900 dark:border-slate-700">
                <div className="space-y-2">
                   <h4 className="font-semibold mb-2 dark:text-slate-100">Select Columns</h4>
                   {remittanceColumnsConfig.map(col => (
                     <div key={col.id} className="flex items-center space-x-2">
                       <Checkbox id={col.id} checked={visibleColumnIds.includes(col.id)} onCheckedChange={(c) => handleColumnToggle(col.id, c)} />
                       <Label htmlFor={col.id} className="dark:text-slate-300">{col.label}</Label>
                     </div>
                   ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
           {isLoading ? (
             <div className="flex justify-center h-40 items-center"><Loader2 className="animate-spin h-8 w-8 text-blue-800 dark:text-blue-400" /></div>
           ) : (
             <Table>
               <TableHeader>
                 <TableRow>
                   {visibleColumnIds.map(colId => {
                     const col = remittanceColumnsConfig.find(c => c.id === colId);
                     if (!col) return null;
                     return <TableHead key={colId} className={`cursor-pointer dark:text-slate-300 ${col.isNumeric ? 'text-right' : ''}`} onClick={() => handleSort(col.sortField)}>
                       {col.label} {col.sortField && getSortIcon(col.sortField)}
                     </TableHead>
                   })}
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredAndSortedRemittances.map(rem => (
                   <TableRow key={rem.id}>
                     {visibleColumnIds.map(colId => {
                       const col = remittanceColumnsConfig.find(c => c.id === colId);
                       if (!col) return null;
                       return <TableCell key={colId} className={`dark:text-slate-200 ${col.isNumeric ? 'text-right' : ''}`}>{col.renderCell(rem)}</TableCell>
                     })}
                   </TableRow>
                 ))}
                 {filteredAndSortedRemittances.length === 0 && <TableRow><TableCell colSpan={visibleColumnIds.length} className="text-center py-8 dark:text-slate-400">No records found</TableCell></TableRow>}
               </TableBody>
               {filteredAndSortedRemittances.length > 0 && (
                 <TableFooter>
                   <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold">
                     {visibleColumnIds.map((colId, idx) => {
                       const col = remittanceColumnsConfig.find(c => c.id === colId);
                       if (!col) return null;
                       return <TableCell key={colId} className={`dark:text-slate-100 ${col.isNumeric ? 'text-right' : ''}`}>
                         {col.isNumeric ? `$${totals[colId]?.toFixed(2) || '0.00'}` : (idx === 0 ? 'Totals:' : '')}
                       </TableCell>
                     })}
                   </TableRow>
                 </TableFooter>
               )}
             </Table>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
