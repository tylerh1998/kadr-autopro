import React from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ARReceiptPDFViewerModal({ open, onClose, pdfUrl }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 py-2 border-b">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Payment Receipt</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-white transition-colors hover:bg-red-700"
              aria-label="Close receipt viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>
        <div className="h-full px-4 pb-4 pt-2">
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