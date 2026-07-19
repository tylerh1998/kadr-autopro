import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import JsonToTableDisplay from './JsonToTableDisplay';

export default function WorkOrderHistoryDetailModal({ open, onClose, record, allRecords = [], formatDateTime }) {
  const comparisonRecord = useMemo(() => {
    if (!record?.id) return null;
    const currentIndex = allRecords.findIndex((item) => item.id === record.id);
    return currentIndex >= 0 ? allRecords[currentIndex + 1] || null : null;
  }, [allRecords, record]);

  const compareData = useMemo(() => {
    if (!record) return {};
    if (record.session_id) {
      return comparisonRecord?.new_data || record?.old_data || {};
    }
    return record?.old_data || comparisonRecord?.new_data || {};
  }, [comparisonRecord, record]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[85vh] overflow-y-auto">
        {record?.session_id && (
          <div className="absolute right-12 top-4 text-xs text-slate-400 font-mono">
            {record.session_id}
          </div>
        )}
        <DialogHeader className="pr-24">
          <DialogTitle>Change Details</DialogTitle>
          <p className="text-sm text-slate-500">
            Comparing this version to {comparisonRecord ? `${comparisonRecord.changed_by_display || 'System'} on ${formatDateTime?.(comparisonRecord.changed_at) || 'the previous saved version'}` : 'the previous saved version'}.
          </p>
        </DialogHeader>
        <JsonToTableDisplay
          data={record?.new_data || {}}
          compareData={compareData}
        />
      </DialogContent>
    </Dialog>
  );
}