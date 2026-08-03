import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { 
  History, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar,
  DollarSign,
  ExternalLink,
  Landmark
} from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function ReconciliationHistoryModal({ open, onClose, bankAccountId }) {
  const [historyRecords, setHistoryRecords] = useState([]);
  const [bankAccount, setBankAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && bankAccountId) {
      loadHistory();
    }
  }, [open, bankAccountId]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Loading reconciliation history for bank account:', bankAccountId);
      
      const { data, error: invokeError } = await supabase.functions.invoke('autopro-getReconciliationHistory', {
        body: { bankAccountId: bankAccountId }
      });

      console.log('Backend response:', data);

      if (invokeError) {
        throw invokeError;
      }

      if (data?.success) {
        setHistoryRecords(data.data.reconciliations || []);
        setBankAccount(data.data.bank_account);
        console.log('Loaded', data.data.reconciliations?.length, 'reconciliation records');
      } else {
        console.error('Backend error:', data?.error);
        setError(data?.error || 'Failed to load reconciliation history');
        setHistoryRecords([]);
        setBankAccount(null);
      }
    } catch (err) {
      console.error('Error loading reconciliation history:', err);
      setError(err.message || 'Failed to load reconciliation history');
      setHistoryRecords([]);
      setBankAccount(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleViewReport = (reconciliationId) => {
    const url = `${createPageUrl('ReconcileReport')}?id=${reconciliationId}`;
    window.open(url, '_blank');
  };

  const formatDisplayDate = (dateString) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  const formatDisplayDateTime = (dateString) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch (error) {
      return dateString;
    }
  };

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .print-modal {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            z-index: 9999 !important;
          }
          
          .print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #000;
          }
          
          .print-header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin: 0 0 10px 0;
          }
          
          .print-header .bank-info {
            font-size: 12pt;
            margin: 5px 0;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
          }
          
          th, td {
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
          }
          
          th {
            background-color: #f0f0f0;
            font-weight: bold;
          }
          
          .balanced-badge {
            background-color: #e8f5e9 !important;
            color: #2e7d32 !important;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9pt;
          }
          
          .unbalanced-badge {
            background-color: #ffebee !important;
            color: #c62828 !important;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9pt;
          }
          
          @page {
            margin: 15mm;
            size: landscape;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto print-modal">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <History className="w-6 h-6 text-blue-600" />
              Reconciliation History
            </DialogTitle>
            {bankAccount && (
              <div className="text-sm text-slate-600 mt-2">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4" />
                  <span className="font-semibold">{bankAccount.name}</span>
                  <span className="text-slate-400">•</span>
                  <span>{bankAccount.bank_name}</span>
                  <span className="text-slate-400">•</span>
                  <span>{bankAccount.account_type}</span>
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Print Header */}
          <div className="print-header" style={{ display: 'none' }}>
            <h1>Bank Reconciliation History</h1>
            {bankAccount && (
              <>
                <div className="bank-info">
                  <strong>Account:</strong> {bankAccount.name}
                </div>
                <div className="bank-info">
                  <strong>Bank:</strong> {bankAccount.bank_name} • <strong>Type:</strong> {bankAccount.account_type}
                </div>
                <div className="bank-info">
                  <strong>Generated:</strong> {format(new Date(), 'MMMM d, yyyy h:mm a')}
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            {/* Action Buttons */}
            <div className="flex justify-end gap-2 no-print">
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button onClick={onClose} variant="outline" size="sm">
                Close
              </Button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-600">Loading reconciliation history...</p>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Error Loading History</h3>
                <p className="text-slate-600">{error}</p>
                <Button onClick={loadHistory} className="mt-4">
                  Try Again
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && historyRecords.length === 0 && (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Reconciliation History</h3>
                <p className="text-slate-600">
                  This bank account has not been reconciled yet.
                </p>
              </div>
            )}

            {/* History Table */}
            {!loading && !error && historyRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-300">
                      <th className="text-left p-3 font-semibold text-slate-700">Reconciliation ID</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Date Reconciled</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Period Covered</th>
                      <th className="text-right p-3 font-semibold text-slate-700">Statement Balance</th>
                      <th className="text-right p-3 font-semibold text-slate-700">Cleared Balance</th>
                      <th className="text-right p-3 font-semibold text-slate-700">Difference</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Status</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Reconciled By</th>
                      <th className="text-center p-3 font-semibold text-slate-700 no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRecords.map((record) => (
                      <tr key={record.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <button
                            onClick={() => handleViewReport(record.reconciliation_id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-sm no-print"
                          >
                            {record.reconciliation_id}
                          </button>
                          <span className="font-mono text-sm" style={{ display: 'none' }}>
                            {record.reconciliation_id}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-slate-700">
                          {formatDisplayDateTime(record.reconciliation_date)}
                        </td>
                        <td className="p-3 text-sm text-slate-700">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {record.period_start_date && record.period_end_date ? (
                              <span>
                                {formatDisplayDate(record.period_start_date)} - {formatDisplayDate(record.period_end_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not specified</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          ${record.statement_ending_balance.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          ${record.cleared_balance_at_reconciliation.toFixed(2)}
                        </td>
                        <td className={`p-3 text-right font-semibold ${
                          record.is_balanced ? 'text-green-700' : 'text-red-700'
                        }`}>
                          ${record.difference.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {record.is_balanced ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200 balanced-badge">
                              <CheckCircle2 className="w-3 h-3 mr-1 no-print" />
                              Balanced
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 border-red-200 unbalanced-badge">
                              <AlertTriangle className="w-3 h-3 mr-1 no-print" />
                              Unbalanced
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-sm text-slate-700">
                          {record.reconciled_by}
                        </td>
                        <td className="p-3 text-center no-print">
                          <Button
                            onClick={() => handleViewReport(record.reconciliation_id)}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summary */}
                <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-slate-600" />
                      <span className="font-semibold text-slate-900">
                        Total Reconciliations: {historyRecords.length}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Balanced: {historyRecords.filter(r => r.is_balanced).length} • 
                      Unbalanced: {historyRecords.filter(r => !r.is_balanced).length}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}