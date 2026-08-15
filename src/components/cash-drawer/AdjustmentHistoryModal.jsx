import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function AdjustmentHistoryModal({ open, onClose, adjustments }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            Cash Drawer Adjustment History
          </DialogTitle>
        </DialogHeader>

        {adjustments.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p>No adjustments have been recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Type</th>
                    <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Reference</th>
                    <th className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          {format(new Date(adj.adjustment_date), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge 
                          className={adj.type === 'shortage' ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'}
                        >
                          {adj.type === 'shortage' ? 'Shortage' : 'Overage'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-semibold ${adj.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          ${Math.abs(adj.amount || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          {adj.description}
                        </div>
                      </td>
                      <td className="p-3">
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400">
                          {adj.reference}
                        </code>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={adj.status === 'posted_to_gl' ? 'default' : 'secondary'}>
                          {adj.status === 'posted_to_gl' ? 'Posted' : 'Recorded'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">Showing {adjustments.length} most recent adjustments</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                All adjustments are automatically posted to the General Ledger when recorded.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}