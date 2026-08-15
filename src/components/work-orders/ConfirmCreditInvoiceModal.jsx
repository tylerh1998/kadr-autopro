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
  onConfirmCreditInvoice,
  shopSupplyRate = 0.06
}) {
  const [refundSource, setRefundSource] = useState('');
  const [cashDrawerPaymentType, setCashDrawerPaymentType] = useState('');

  // Get the selected line items for display
  const selectedLineItems = lineItems.filter((_, index) => selectedLines[index]);
  
  // Categorize inventory items by destination
  const stockReturnItems = selectedLineItems.filter(line => line.inventory_item_id && !line.is_core_virtual);
  const coreReturnItems = selectedLineItems.filter(line => line.inventory_item_id && line.is_core_virtual);
  
  const inventoryItemsCount = stockReturnItems.length + coreReturnItems.length;

  // Calculate financial totals
  const partsTotal = selectedLineItems.reduce((sum, item) => sum + (parseFloat(item.tot_parts) || 0), 0);
  const laborTotal = selectedLineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);

  const otherChargesTotal = selectedLineItems.reduce((sum, item) => {
    const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
    if (isOtherChargeLine) {
        return sum + (parseFloat(item.total) || 0);
    }
    return sum + (parseFloat(item.oc_total) || 0);
  }, 0);

  const shopSupplyTotal = laborTotal * shopSupplyRate;

  // Calculate tax
  const taxableAmount = selectedLineItems.reduce((sum, item) => {
    if (item.taxable !== false) {
      const parts = parseFloat(item.tot_parts) || 0;
      const labor = parseFloat(item.labour) || 0;
      let other = parseFloat(item.oc_total) || 0;
      
      const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
      if (isOtherChargeLine) {
         other = parseFloat(item.total) || 0;
      }

      return sum + parts + labor + other;
    }
    return sum;
  }, 0);

  const taxableSubtotal = taxableAmount + shopSupplyTotal;
  const taxAmount = taxableSubtotal * 0.05;

  const grandTotal = partsTotal + laborTotal + otherChargesTotal + shopSupplyTotal + taxAmount;

  const handleConfirm = () => {
    if (!refundSource) {
      alert('Please select a refund payment source.');
      return;
    }

    if (refundSource === 'cash_drawer' && !cashDrawerPaymentType) {
      alert('Please select a payment type for cash drawer refund.');
      return;
    }

    // Call the callback with the refund source and payment type
    onConfirmCreditInvoice(refundSource, cashDrawerPaymentType);
  };

  const handleCancel = () => {
    setRefundSource('');
    setCashDrawerPaymentType('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-6 h-6 text-orange-500 dark:text-orange-400" />
            Confirm Credit Invoice
          </DialogTitle>
          <DialogDescription className="text-base mt-4">
            You are about to create a credit invoice for this work order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Inventory Return Warning */}
          {inventoryItemsCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">Inventory Returns</h4>
                  <ul className="text-sm text-blue-800 dark:text-blue-300 list-disc list-inside mt-1">
                    {stockReturnItems.length > 0 && (
                      <li>{stockReturnItems.length} item{stockReturnItems.length !== 1 ? 's' : ''} returning to <strong>Stock</strong></li>
                    )}
                    {coreReturnItems.length > 0 && (
                      <li>{coreReturnItems.length} item{coreReturnItems.length !== 1 ? 's' : ''} returning to <strong>Supplier (Core)</strong></li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Selected Items Summary */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Selected Items for Credit</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedLineItems.map((line, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    {line.description || line.part_number || 'Unnamed Item'}
                    {line.qty && ` (Qty: ${line.qty})`}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    ${(line.total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center font-semibold">
                <span>Total Credit Amount:</span>
                <span className="text-lg text-red-600 dark:text-red-400">
                  -${grandTotal.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">
                Includes parts, labor, other charges, shop supplies ({(shopSupplyRate * 100).toFixed(0)}%), and GST (5%)
              </p>
            </div>
          </div>

          {/* Refund Payment Source */}
          <div className="space-y-2">
            <Label htmlFor="refund-source" className="text-base font-semibold">
              Refund Payment Source <span className="text-red-500 dark:text-red-400">*</span>
            </Label>
            <Select value={refundSource} onValueChange={(value) => {
              setRefundSource(value);
              setCashDrawerPaymentType('');
            }}>
              <SelectTrigger id="refund-source" className="w-full">
                <SelectValue placeholder="Select refund payment source..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_drawer">Cash Drawer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="on_account">On Account</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Select how the customer will receive their refund
            </p>
          </div>

          {/* Cash Drawer Payment Type */}
          {refundSource === 'cash_drawer' && (
            <div className="space-y-2">
              <Label htmlFor="payment-type" className="text-base font-semibold">
                Payment Type <span className="text-red-500 dark:text-red-400">*</span>
              </Label>
              <Select value={cashDrawerPaymentType} onValueChange={setCashDrawerPaymentType}>
                <SelectTrigger id="payment-type" className="w-full">
                  <SelectValue placeholder="Select payment type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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
            disabled={!refundSource || (refundSource === 'cash_drawer' && !cashDrawerPaymentType)}
          >
            Confirm & Save Credit Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}