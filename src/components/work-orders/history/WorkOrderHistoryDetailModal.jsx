import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import JsonToTableDisplay from './JsonToTableDisplay';

export default function WorkOrderHistoryDetailModal({ open, onClose, record, allRecords = [], formatDateTime, onSelectRecord }) {
  const currentIndex = useMemo(() => {
    if (!record?.id) return -1;
    return allRecords.findIndex((item) => item.id === record.id);
  }, [allRecords, record]);

  const comparisonRecord = useMemo(() => {
    return currentIndex >= 0 ? allRecords[currentIndex + 1] || null : null;
  }, [allRecords, currentIndex]);

  const previousRecord = useMemo(() => {
    return currentIndex >= 0 ? allRecords[currentIndex + 1] || null : null;
  }, [allRecords, currentIndex]);

  const nextRecord = useMemo(() => {
    return currentIndex > 0 ? allRecords[currentIndex - 1] || null : null;
  }, [allRecords, currentIndex]);

  const compareData = useMemo(() => {
    if (!record) return {};
    if (record.session_id) {
      return comparisonRecord?.new_data || record?.old_data || {};
    }
    return record?.old_data || comparisonRecord?.new_data || {};
  }, [comparisonRecord, record]);

  const currentVersionTitle = useMemo(() => {
    const changedAt = formatDateTime?.(record?.changed_at) || 'Unknown date';
    const changedBy = record?.changed_by_display || 'System';
    return `Version Detail - ${changedAt} by ${changedBy}`;
  }, [formatDateTime, record]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[85vh] overflow-y-auto [&>button:last-child]:hidden">
        <div className="flex items-start justify-between gap-6 pb-4 pr-1">
          <DialogHeader className="flex-1 space-y-1 pt-1 text-left">
            <DialogTitle>{currentVersionTitle}</DialogTitle>
            <p className="text-sm leading-snug text-slate-500 dark:text-slate-400">
              Comparing this version to {comparisonRecord ? `${comparisonRecord.changed_by_display || 'System'} on ${formatDateTime?.(comparisonRecord.changed_at) || 'the previous saved version'}` : 'the previous saved version'}.
            </p>
          </DialogHeader>

          <div className="flex shrink-0 flex-col items-end gap-2 no-print">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!previousRecord}
                onClick={() => previousRecord && onSelectRecord?.(previousRecord)}
                className="h-11 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                &lt; Prev Version
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!nextRecord}
                onClick={() => nextRecord && onSelectRecord?.(nextRecord)}
                className="h-11 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next Version &gt;
              </Button>
              <Button
                type="button"
                onClick={onClose}
                className="h-11 w-11 bg-red-600 p-0 text-white shadow-sm hover:bg-red-700"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            {record?.session_id && (
              <div className="w-full text-right text-xs font-mono text-slate-400 dark:text-slate-500">
                {record.session_id}
              </div>
            )}
          </div>
        </div>
        <JsonToTableDisplay
          data={record?.new_data || {}}
          compareData={compareData}
        />
      </DialogContent>
    </Dialog>
  );
}