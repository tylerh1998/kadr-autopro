import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Printer, Search } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

export default function ReportableLeviesReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [summary, setSummary] = useState({ totalQty: 0, totalAmount: 0 });

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('getReportableLeviesReport', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      if (response.data.success) {
        setData(response.data.data);
        calculateSummary(response.data.data);
      } else {
        alert('Failed to fetch report: ' + response.data.error);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      alert('An error occurred while fetching the report.');
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (items) => {
    const totalQty = items.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);
    const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
    setSummary({ totalQty, totalAmount });
  };

  useEffect(() => {
    fetchReport();
  }, []); // Fetch on mount with default range

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div className="flex items-end gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Start Date</label>
            <Input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">End Date</label>
            <Input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-40"
            />
          </div>
          <Button onClick={fetchReport} disabled={loading} className="mb-[2px]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Run Report
          </Button>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 4px; }
        }
      `}</style>

      <div className="print-only hidden mb-4">
        <h1 className="text-2xl font-bold">Reportable Levies Report</h1>
        <p className="text-sm text-gray-500">Period: {dateRange.startDate} to {dateRange.endDate}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>RO #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Base Amount</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                    <p className="text-sm text-slate-500 mt-2">Loading report data...</p>
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No reportable levies found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{format(new Date(item.date_applied), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{item.ro_number}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right">${parseFloat(item.base_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${parseFloat(item.total_amount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <TableCell colSpan={3} className="text-right">Totals:</TableCell>
                    <TableCell className="text-right">{summary.totalQty}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right">${summary.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}