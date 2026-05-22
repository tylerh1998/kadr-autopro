import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ARReceiptPDFViewerModal({ open, onClose, pdfUrl }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Payment Receipt</DialogTitle>
        </DialogHeader>
        <div className="h-full px-6 pb-6">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="Payment Receipt PDF"
              className="w-full h-full min-h-[70vh] border rounded-md"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}