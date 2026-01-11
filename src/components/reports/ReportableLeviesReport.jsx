import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Printer, Search, Send } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subQuarters } from 'date-fns';

export default function ReportableLeviesReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfQuarter(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfQuarter(new Date()), 'yyyy-MM-dd')
  });
  const [summary, setSummary] = useState({ totalQty: 0, totalAmount: 0 });
  const [posting, setPosting] = useState(false);

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

  const handleLastQuarter = () => {
    const lastQuarterDate = subQuarters(new Date(), 1);
    setDateRange({
      startDate: format(startOfQuarter(lastQuarterDate), 'yyyy-MM-dd'),
      endDate: format(endOfQuarter(lastQuarterDate), 'yyyy-MM-dd')
    });
  };

  const handlePostToAP = async () => {
    if (!window.confirm("Are you sure you want to post these levies to Accounts Payable? This will create supplier invoice lines for the current quarter.")) {
      return;
    }

    setPosting(true);
    try {
      const response = await base44.functions.invoke('postLeviesToAP', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      if (response.data.success) {
        alert(response.data.message);
        fetchReport(); // Refresh data
      } else {
        alert('Failed to post to AP: ' + response.data.error);
      }
    } catch (error) {
      console.error('Error posting to AP:', error);
      alert('An error occurred while posting to AP.');
    } finally {
      setPosting(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print report.');

    const html = `
      <html>
        <head>
          <title>Reportable Levies Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .bg-slate-100 { background-color: #f1f5f9; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Reportable Levies Report</h1>
          <p><strong>Period:</strong> ${dateRange.startDate} to ${dateRange.endDate}</p>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>RO #</th>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Base Amount</th>
                <th class="text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(item => `
                <tr>
                  <td>${format(new Date(item.date_applied), 'MMM d, yyyy')}</td>
                  <td>${item.ro_number}</td>
                  <td>${item.description}</td>
                  <td class="text-right">${item.qty}</td>
                  <td class="text-right">$${parseFloat(item.base_amount).toFixed(2)}</td>
                  <td class="text-right">$${parseFloat(item.total_amount).toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="bg-slate-100 font-bold">
                <td colspan="3" class="text-right">Totals:</td>
                <td class="text-right">${summary.totalQty}</td>
                <td class="text-right"></td>
                <td class="text-right">$${summary.totalAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
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
          <Button variant="ghost" onClick={handleLastQuarter} className="mb-[2px] text-blue-600 hover:text-blue-800">
            Last Quarter
          </Button>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="default" 
            onClick={handlePostToAP} 
            disabled={loading || posting || data.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Post to AP
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Styles removed as they are now handled in the HTML report window */}

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