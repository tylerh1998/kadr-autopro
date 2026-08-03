import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, Printer, ExternalLink } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { createPageUrl } from "@/utils";

export default function OtherChargesBreakdownReport() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);

  const handlePrint = () => {
    if (!reportData) return;

    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Other Charges Breakdown Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .period { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .summary { display: flex; gap: 20px; margin-bottom: 20px; }
          .summary-box { padding: 10px; border: 1px solid #ccc; border-radius: 4px; flex: 1; }
          .summary-label { font-size: 11px; color: #666; }
          .summary-value { font-size: 18px; font-weight: bold; }
          .total-row { background-color: #f5f5f5; font-weight: bold; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Other Charges Breakdown Report</h1>
        <p class="period">${reportData.startDate} to ${reportData.endDate}</p>
        
        <div class="summary">
          <div class="summary-box">
            <div class="summary-label">Invoices in Period</div>
            <div class="summary-value">${reportData.invoiceCount}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Charge Types</div>
            <div class="summary-value">${reportData.charges.length}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Grand Total</div>
            <div class="summary-value">$${reportData.grandTotal.toFixed(2)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>GL Account</th>
              <th class="text-center">Count</th>
              <th class="text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.charges.map(charge => `
              <tr>
                <td>${charge.description}</td>
                <td>${charge.gl_account || '-'}</td>
                <td class="text-center">${charge.count}</td>
                <td class="text-right">$${charge.total_amount.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3">Grand Total</td>
              <td class="text-right">$${reportData.grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const response = await supabase.functions.invoke('autopro-getOtherChargesBreakdown', {
        body: { startDate, endDate }
      });

      if (response.error) { setError(response.error.message); return; }

      if (response.data?.success) {
        setReportData(response.data);
      } else {
        setError(response.data?.error || 'Failed to generate report');
      }
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Date Range Selection */}
      <div className="flex items-end gap-4 p-4 bg-slate-50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <Button onClick={handleGenerateReport} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Generate Report
            </>
          )}
        </Button>
        {reportData && (
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Report Results */}
      {reportData && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">Invoices in Period</p>
              <p className="text-2xl font-bold text-blue-800">{reportData.invoiceCount}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">Charge Types</p>
              <p className="text-2xl font-bold text-green-800">{reportData.charges.length}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600">Grand Total</p>
              <p className="text-2xl font-bold text-purple-800">${reportData.grandTotal.toFixed(2)}</p>
            </div>
          </div>

          {/* Charges Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>GL Account</TableHead>
                  <TableHead className="text-center">Count</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.charges.length > 0 ? (
                  reportData.charges.map((charge, index) => (
                    <TableRow 
                      key={index} 
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedCharge(charge)}
                    >
                      <TableCell className="font-medium">{charge.description}</TableCell>
                      <TableCell>{charge.gl_account || '-'}</TableCell>
                      <TableCell className="text-center">{charge.count}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ${charge.total_amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-slate-500">
                      No other charges found for this period.
                    </TableCell>
                  </TableRow>
                )}
                {reportData.charges.length > 0 && (
                  <TableRow className="bg-slate-100 font-bold">
                    <TableCell colSpan={3}>Grand Total</TableCell>
                    <TableCell className="text-right">${reportData.grandTotal.toFixed(2)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={!!selectedCharge} onOpenChange={(open) => !open && setSelectedCharge(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Charge Details: {selectedCharge?.description}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RO #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCharge?.details?.map((detail, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{detail.ro_number}</TableCell>
                    <TableCell>{detail.customer_name}</TableCell>
                    <TableCell>{detail.date}</TableCell>
                    <TableCell className="capitalize">{detail.stage?.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right">${detail.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const url = `${createPageUrl('WorkOrderEdit')}?id=${detail.ro_number}`;
                          const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
                          window.open(url, '_blank', windowFeatures);
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}