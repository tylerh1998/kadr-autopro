import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, X, CheckCircle, Copy, ExternalLink } from 'lucide-react';

export default function CreditConfirmationModal({ 
  open, 
  onClose, 
  creditInvoiceNumber,
  customerPortalId,
  onPrint,
  onExit
}) {
  const [copied, setCopied] = useState(false);

  const customerPortalUrl = `https://portal.kensauto.ca/WorkOrder?cp_id=${customerPortalId}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(customerPortalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenPortal = () => {
    window.open(customerPortalUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CheckCircle className="w-6 h-6 text-green-500 dark:text-green-400" />
            Credit Invoice Created
          </DialogTitle>
          <DialogDescription className="text-base mt-4">
            Credit Invoice <span className="font-semibold">{creditInvoiceNumber}</span> has been successfully created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Success Summary */}
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <ul className="space-y-2 text-sm text-green-800 dark:text-green-300">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Credit invoice record created</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Original work order updated with credit markers</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Inventory quantities adjusted</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Transaction records created</span>
              </li>
            </ul>
          </div>

          {/* Customer Portal URL */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Customer Portal URL</Label>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Share this link with the customer to view their credit invoice details
            </p>
            <div className="flex gap-2">
              <Input 
                value={customerPortalUrl} 
                readOnly 
                className="flex-1 font-mono text-sm"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleCopyUrl}
                className="flex-shrink-0"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleOpenPortal}
                className="flex-shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-green-600 dark:text-green-400 animate-fade-in">
                ✓ URL copied to clipboard!
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onPrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print Credit Invoice
          </Button>
          <Button onClick={onExit} className="bg-blue-600 hover:bg-blue-700">
            <X className="w-4 h-4 mr-2" />
            Exit to Work Orders
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}