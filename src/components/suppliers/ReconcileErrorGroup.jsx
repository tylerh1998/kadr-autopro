import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function ReconcileErrorGroup({ errors, safeFormatDate }) {
  if (!errors || errors.length === 0) return null;

  const totalDiscrepancy = errors.reduce((sum, err) => sum + Math.abs(parseFloat(err.difference) || 0), 0);

  return (
    <Card className="border-red-600 dark:border-red-500 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 bg-red-600 text-white">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Errors <span className="text-sm font-normal opacity-90">({errors.length})</span>
          </h2>
          <p className="text-lg font-bold">Total Discrepancy: ${totalDiscrepancy.toFixed(2)}</p>
        </div>
        <div className="divide-y divide-red-200 dark:divide-red-900">
          {errors.map((err, index) => {
            const diff = parseFloat(err.difference) || 0;
            return (
              <div key={err.key} className={index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-red-50 dark:bg-red-950/20'}>
                <div className="p-4">
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                      {err.reason}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">On Statement</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {err.statement.invoice_number || '—'} · {safeFormatDate(err.statement.invoice_date, 'MMM dd, yyyy')}
                      </p>
                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">${(parseFloat(err.statement.amount) || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">In AutoPro</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {err.autopro.invoice_number || '—'} · {safeFormatDate(err.autopro.invoice_date, 'MMM dd, yyyy')}
                      </p>
                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">${(parseFloat(err.autopro.total_amount) || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
                    Difference: ${Math.abs(diff).toFixed(2)} {diff > 0 ? '(statement higher)' : diff < 0 ? '(AutoPro higher)' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
