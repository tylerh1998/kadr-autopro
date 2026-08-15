import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Truck, XCircle, CheckCircle2 } from 'lucide-react';

export default function InventoryBatchResultDialog({ open, onClose, onGoToSuppliers, successfulInvoices, failedInvoices }) {
  const successCount = successfulInvoices.length;
  const failedCount = failedInvoices.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch Processing Complete</DialogTitle>
          <DialogDescription>
            Review the invoice batch summary below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Badge className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40">
              {successCount} Successful
            </Badge>
            <Badge className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40">
              {failedCount} Failed
            </Badge>
          </div>

          {successCount > 0 && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-green-800 dark:text-green-300 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Successful Invoices
              </div>
              <div className="space-y-2">
                {successfulInvoices.map((result, index) => (
                  <div key={`${result.invoice}-${index}`} className="text-sm text-green-900 dark:text-green-200">
                    • {result.invoice}
                  </div>
                ))}
              </div>
            </div>
          )}

          {failedCount > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-red-800 dark:text-red-300 font-semibold">
                <XCircle className="w-4 h-4" />
                Failed Invoices
              </div>
              <div className="space-y-3">
                {failedInvoices.map((result, index) => (
                  <div key={`${result.invoice}-${index}`} className="rounded-md bg-white/70 dark:bg-slate-900/50 p-3 text-sm border border-red-100 dark:border-red-900">
                    <div className="font-medium text-red-900 dark:text-red-200">{result.invoice}</div>
                    <div className="mt-1 whitespace-pre-wrap text-red-700 dark:text-red-400">{result.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={onGoToSuppliers}>
            <Truck className="w-4 h-4 mr-2" />
            Suppliers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}