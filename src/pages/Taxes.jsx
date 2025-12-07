import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import MarkPaidModal from '../components/taxes/MarkPaidModal';

export default function TaxesPage() {
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
      `Post this GST return for period ${format(new Date(summary.period_start_date), 'MMM d, yyyy')} to ${format(new Date(summary.period_end_date), 'MMM d, yyyy')}?\n\nNet GST Due: $${summary.net_gst_due.toFixed(2)}`
    );

    if (!confirmed) return;

    setPosting(true);
    try {
      const user = await base44.auth.me();
      
      await base44.entities.GSTReturn.create({
        period_start_date: summary.period_start_date,
        period_end_date: summary.period_end_date,
        total_sales: summary.total_sales,
        total_purchases: summary.total_purchases,
        gst_collected: summary.gst_collected,
        gst_paid: summary.gst_paid,
        net_gst_due: summary.net_gst_due,
        status: 'posted',
        posted_date: format(new Date(), 'yyyy-MM-dd'),
        posted_by: user.email
      });

      alert('GST return posted successfully!');
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
                  const year = new Date().getFullYear();
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
                  const year = new Date().getFullYear();
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
                  const year = new Date().getFullYear();
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
                  const year = new Date().getFullYear() - 1;
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
                  {format(new Date(summary.period_start_date), 'MMM d, yyyy')} - {format(new Date(summary.period_end_date), 'MMM d, yyyy')}
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
                          {format(new Date(record.period_start_date), 'MMM d, yyyy')} - {format(new Date(record.period_end_date), 'MMM d, yyyy')}
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
                              Paid: {format(new Date(record.paid_date), 'MMM d, yyyy')}
                            </span>
                          )}
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