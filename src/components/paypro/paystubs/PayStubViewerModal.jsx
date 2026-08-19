import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

// Bespoke modal (built on the raw Radix primitives, not the shared ui/dialog.jsx) rather
// than the shared component - this needs a large, PDF-filling body and a red close X,
// which don't fit the shared Dialog's default small-form-factor styling without either
// hacking around its baked-in gray close button or changing that shared component
// app-wide. Scoped to just this one use, same reasoning as the tab-color overrides
// elsewhere in this module.
export default function PayStubViewerModal({ open, onOpenChange, title, pdfDataUri, onDownload }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 flex w-[95vw] h-[95vh] max-w-6xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between gap-4 border-b px-4 py-3 dark:border-slate-800 shrink-0">
            <DialogPrimitive.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {title}
            </DialogPrimitive.Title>
            {/* No visible sub-title by design; a screen-reader-only description avoids
                Radix's aria-describedby console warning without adding visible text. */}
            <DialogPrimitive.Description className="sr-only">
              Pay stub PDF preview
            </DialogPrimitive.Description>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={onDownload}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:text-red-400 dark:hover:bg-red-950/30"
                >
                  <X className="w-5 h-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="flex-1 bg-slate-100 dark:bg-slate-950 min-h-0">
            {pdfDataUri && (
              <iframe src={pdfDataUri} title={title} className="w-full h-full border-0" />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
