import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function ARReceiptPDFViewerModal({ open, onClose, pdfUrl }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!open || !pdfUrl) return;

    const timer = setTimeout(() => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow) {
        iframeWindow.focus();
        iframeWindow.print();
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [open, pdfUrl]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden gap-0 [&>button:last-child]:hidden">
        <div className="flex items-center justify-between border-b px-3 py-1">
          <DialogTitle className="text-base leading-none">Payment Receipt</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-600 text-white transition-colors hover:bg-red-700"
            aria-label="Close receipt viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="h-full px-3 pb-3 pt-1">
          {pdfUrl ? (
            <iframe
              ref={iframeRef}
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