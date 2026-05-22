import React, { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden gap-0 [&>button]:hidden">
        <DialogHeader className="px-3 py-1 border-b">
          <DialogTitle className="text-base leading-none">Payment Receipt</DialogTitle>
        </DialogHeader>
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