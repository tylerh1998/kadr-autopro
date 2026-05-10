import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import JsonToTableDisplay from './JsonToTableDisplay';

export default function WorkOrderHistoryDetailModal({ open, onClose, record }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Details</DialogTitle>
        </DialogHeader>
        <JsonToTableDisplay data={record?.new_data || {}} />
      </DialogContent>
    </Dialog>
  );
}