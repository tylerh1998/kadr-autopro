import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, DollarSign, TrendingUp, TrendingDown, Printer } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import MarkPaidModal from '../components/taxes/MarkPaidModal';
import { getMountainTimeNow } from '@/components/utils/mountainTimeUtils';

export default function TaxesPage() {
  const { employee } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const returns = await base44.entities.GSTReturn.list('-created_date');
      setHistory(returns);
    } catch (error) {
      console.error('Error loading GST return history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('calculateGSTReturn', {
        period_start_date: startDate,
        period_end_date: endDate
      });

      if (response.data.error) {
        alert(`Error: ${response.data.error}`);
        return;
      }

      setSummary(response.data);
    } catch (error) {
      console.error('Error generating GST report:', error);
      alert('Failed to generate GST report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePostReturn = async () => {
    if (!summary) return;

    const confirmed = window.confirm(
      `Post this GST return for period ${format(parseISO(summary.period_start_date), 'MMM d, yyyy')} to ${format(parseISO(summary.period_end_date), 'MMM d, yyyy')}?\n\nNet GST Due: $${summary.net_gst_due.toFixed(2)}`
    );

    if (!confirmed) return;

    setPosting(true);
    try {
      const user = employee;

      // Create the return record
      const newReturn = await base44.entities.GSTReturn.create({
        period_start_date: summary.period_start_date,
        period_end_date: summary.period_end_date,
        total_sales: summary.total_sales,
        total_purchases: summary.total_purchases,
        gst_collected: summary.gst_collected,
        gst_paid: summary.gst_paid,
        net_gst_due: summary.net_gst_due,
        status: 'posted',
        posted_date: format(getMountainTimeNow(), 'yyyy-MM-dd'),
        posted_by: user.email
      });

      // Post consolidating GL entries
      const response = await base44.functions.invoke('postGSTJournalEntries', {
        gst_return_id: newReturn.id,
        gst_collected: summary.gst_collected,
        gst_paid: summary.gst_paid,
        period_end_date: summary.period_end_date
      });

      if (response.data.error) {
        console.error("Error from postGSTJournalEntries:", response.data.error);
        // Note: The return is already created, but GL entries failed. 
        // We alert the user but don't rollback the return creation for now to avoid complexity,
        // or we could delete it. For safety, we'll just warn.
        alert(`GST return created, but failed to post accounting entries: ${response.data.error}`);
      } else {
        alert('GST return posted and accounting entries created successfully!');
      }

      setSummary(null);
      setStartDate('');
      setEndDate('');
      loadHistory();
    } catch (error) {
      console.error('Error posting GST return:', error);
      alert('Failed to post GST return. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleMarkPaid = (returnRecord) => {
    setSelectedReturn(returnRecord);
    setShowMarkPaidModal(true);
  };

  const handleMarkPaidComplete = () => {
    setShowMarkPaidModal(false);
    setSelectedReturn(null);
    loadHistory();
  };

  const handlePrintReport = (record) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print report');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GST Return Report - ${format(parseISO(record.period_end_date), 'yyyy-MM-dd')}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header h2 { margin: 5px 0 0; font-size: 18px; color: #666; }
            .section { margin-bottom: 30px; }
            .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 15px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .label { font-weight: 500; color: #666; }
            .value { font-weight: bold; }
            .amount { font-family: monospace; font-size: 16px; }
            .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
            .net-box { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: right; }
            .net-label { font-size: 14px; color: #666; }
            .net-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
            .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; border: 1px solid #ccc; background: #eee; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ken's Auto</h1>
            <h2>GST Return Report</h2>
          </div>

          <div class="section">
            <div class="section-title">Return Details</div>
            <div class="grid">
              <div class="row"><span class="label">Period Start:</span> <span class="value">${format(parseISO(record.period_start_date), 'MMM d, yyyy')}</span></div>
              <div class="row"><span class="label">Period End:</span> <span class="value">${format(parseISO(record.period_end_date), 'MMM d, yyyy')}</span></div>
              <div class="row"><span class="label">Status:</span> <span class="value"><span class="status-badge">${record.status}</span></span></div>
              <div class="row"><span class="label">Return ID:</span> <span class="value">${record.id}</span></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Financial Summary</div>
            <div class="row"><span class="label">Total Sales (Revenue):</span> <span class="value amount">$${record.total_sales?.toFixed(2) || '0.00'}</span></div>
            <div class="row"><span class="label">Total Purchases (Expenses):</span> <span class="value amount">$${record.total_purchases?.toFixed(2) || '0.00'}</span></div>
            <hr style="border: 0; border-top: 1px dashed #ddd; margin: 15px 0;" />
            <div class="row"><span class="label">GST Collected (Line 103):</span> <span class="value amount">$${record.gst_collected?.toFixed(2) || '0.00'}</span></div>
            <div class="row"><span class="label">GST Paid (Line 106):</span> <span class="value amount">$${record.gst_paid?.toFixed(2) || '0.00'}</span></div>
            
            <div class="net-box">
              <div class="net-label">Net GST ${record.net_gst_due >= 0 ? 'Due (Line 109)' : 'Refund (Line 109)'}</div>
              <div class="net-value" style="color: ${record.net_gst_due >= 0 ? '#d32f2f' : '#388e3c'}">
                $${Math.abs(record.net_gst_due)?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Filing Information</div>
            <div class="row"><span class="label">Posted Date:</span> <span class="value">${record.posted_date ? format(parseISO(record.posted_date), 'MMM d, yyyy') : 'N/A'}</span></div>
            <div class="row"><span class="label">Posted By:</span> <span class="value">${record.posted_by || 'N/A'}</span></div>
            ${record.paid_date ? `
              <div class="row"><span class="label">Paid/Refunded Date:</span> <span class="value">${format(parseISO(record.paid_date), 'MMM d, yyyy')}</span></div>
              <div class="row"><span class="label">Processed By:</span> <span class="value">${record.paid_by || 'N/A'}</span></div>
            ` : ''}
          </div>

          <div class="footer">
            Generated on ${format(getMountainTimeNow(), 'MMM d, yyyy h:mm a')} • Internal Record
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getStatusBadge = (status) => {
    const colors = {
      draft: 'bg-slate-100 text-slate-800',
      posted: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800'
    };

    return (
      <Badge className={colors[status] || colors.draft}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">GST Returns</h1>
          <p className="text-slate-600 mt-1">Calculate and manage your GST returns</p>
        </div>

        {/* Generate Report Section */}
        <Card>
          <CardHeader>
            <CardTitle>Generate GST Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button
                onClick={handleGenerateReport}
                disabled={loading || !startDate || !endDate}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = getMountainTimeNow().getFullYear();
                  setStartDate(`${year}-01-01`);
                  setEndDate(`${year}-03-31`);
                }}
                className="bg-slate-50"
              >
                First Quarter - Jan - Mar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = getMountainTimeNow().getFullYear();
                  setStartDate(`${year}-04-01`);
                  setEndDate(`${year}-06-30`);
                }}
                className="bg-slate-50"
              >
                Second Quarter - Apr - Jun
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = getMountainTimeNow().getFullYear();
                  setStartDate(`${year}-07-01`);
                  setEndDate(`${year}-09-30`);
                }}
                className="bg-slate-50"
              >
                Third Quarter - Jul - Sep
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = getMountainTimeNow().getFullYear() - 1;
                  setStartDate(`${year}-10-01`);
                  setEndDate(`${year}-12-31`);
                }}
                className="bg-slate-50"
              >
                Fourth Quarter - Oct - Dec
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Display */}
        {summary && (
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>GST Summary</span>
                <Badge variant="outline" className="bg-white">
                  {format(parseISO(summary.period_start_date), 'MMM d, yyyy')} - {format(parseISO(summary.period_end_date), 'MMM d, yyyy')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>GST Collected (Account {summary.gst_collected_account})</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    ${summary.gst_collected.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Total Sales: ${summary.total_sales.toFixed(2)}
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span>GST Paid (Account {summary.gst_paid_account})</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    ${summary.gst_paid.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Total Purchases: ${summary.total_purchases.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className={`rounded-lg p-6 ${summary.net_gst_due >= 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-1">Net GST Due</p>
                    <p className={`text-3xl font-bold ${summary.net_gst_due >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                      ${Math.abs(summary.net_gst_due).toFixed(2)}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      {summary.net_gst_due >= 0 ? 'Amount Owed to Government' : 'Refund Due from Government'}
                    </p>
                  </div>
                  <DollarSign className={`w-12 h-12 ${summary.net_gst_due >= 0 ? 'text-red-400' : 'text-green-400'}`} />
                </div>
              </div>

              <Button
                onClick={handlePostReturn}
                disabled={posting}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {posting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Post Return
              </Button>
            </CardContent>
          </Card>
        )}

        {/* History Section */}
        <Card>
          <CardHeader>
            <CardTitle>Past Returns</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No GST returns found</p>
                <p className="text-sm mt-1">Generate and post your first return above</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Period</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">GST Collected</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">GST Paid</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Net Due</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm">
                          {format(parseISO(record.period_start_date), 'MMM d, yyyy')} - {format(parseISO(record.period_end_date), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ${record.gst_collected.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ${record.gst_paid.toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 text-sm text-right font-semibold ${record.net_gst_due >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${Math.abs(record.net_gst_due).toFixed(2)}
                          {record.net_gst_due >= 0 ? ' (Owe)' : ' (Refund)'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(record.status)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {record.status === 'posted' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkPaid(record)}
                                className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                              >
                                Mark Paid
                              </Button>
                            )}
                            {record.status === 'paid' && record.paid_date && (
                              <span className="text-xs text-slate-500">
                                Paid: {format(parseISO(record.paid_date), 'MMM d, yyyy')}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintReport(record)}
                              title="Print Report"
                            >
                              <Printer className="w-4 h-4 text-slate-500 hover:text-slate-800" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mark Paid Modal */}
      <MarkPaidModal
        open={showMarkPaidModal}
        onClose={() => setShowMarkPaidModal(false)}
        gstReturn={selectedReturn}
        onComplete={handleMarkPaidComplete}
      />
    </div>
  );
}