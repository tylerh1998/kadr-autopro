import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Package } from 'lucide-react';

export default function ConfirmCreditInvoiceModal({ 
  open, 
  onClose, 
  selectedLines, 
  lineItems, 
  workOrder,
  onConfirmCreditInvoice 
}) {
  const [refundSource, setRefundSource] = useState('');

  // Get the selected line items for display
  const selectedLineItems = lineItems.filter((_, index) => selectedLines[index]);
  
  // Count inventory items that will be returned
  const inventoryItemsCount = selectedLineItems.filter(line => line.inventory_item_id).length;

  const handleConfirm = () => {
    if (!refundSource) {
      alert('Please select a refund payment source.');
      return;
    }

    // Call the callback with the refund source
    onConfirmCreditInvoice(refundSource);
  };

  const handleCancel = () => {
    setRefundSource('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            Confirm Credit Invoice
          </DialogTitle>
          <DialogDescription className="text-base mt-4">
            You are about to create a credit invoice for this work order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Inventory Return Warning */}
          {inventoryItemsCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Inventory Returns</h4>
                  <p className="text-sm text-blue-800">
                    {inventoryItemsCount} inventory {inventoryItemsCount === 1 ? 'item' : 'items'} will be returned to stock.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Selected Items Summary */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="font-semibold text-slate-900 mb-3">Selected Items for Credit</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedLineItems.map((line, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-slate-700">
                    {line.description || line.part_number || 'Unnamed Item'}
                    {line.qty && ` (Qty: ${line.qty})`}
                  </span>
                  <span className="font-medium text-slate-900">
                    ${(line.total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="flex justify-between items-center font-semibold">
                <span>Total Credit Amount:</span>
                <span className="text-lg text-red-600">
                  -${selectedLineItems.reduce((sum, line) => sum + (line.total || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Refund Payment Source */}
          <div className="space-y-2">
            <Label htmlFor="refund-source" className="text-base font-semibold">
              Refund Payment Source <span className="text-red-500">*</span>
            </Label>
            <Select value={refundSource} onValueChange={setRefundSource}>
              <SelectTrigger id="refund-source" className="w-full">
                <SelectValue placeholder="Select refund payment source..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_drawer">Cash Drawer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="on_account">On Account</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-500">
              Select how the customer will receive their refund
            </p>
          </div>

          {/* Warning Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-900 mb-1">Important</h4>
                <p className="text-sm text-yellow-800">
                  This action will create a new credit invoice record, update inventory quantities, 
                  and mark the selected items as credited on the original work order. This cannot be easily undone.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            className="bg-green-600 hover:bg-green-700"
            disabled={!refundSource}
          >
            Confirm & Save Credit Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}