import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InventoryReturn, InventoryTxs, InventoryItem, Supplier } from '@/entities/all';
import { Shield, AlertTriangle } from 'lucide-react';

export default function WarrantyReturnModal({ open, onClose, lineItem, workOrder, onSuccess }) {
  const [quantity, setQuantity] = useState('1');
  const [returnScope, setReturnScope] = useState('Parts Only');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inventoryItem, setInventoryItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (open && lineItem) {
      // Reset form
      setQuantity(lineItem.qty?.toString() || '1');
      setReturnScope('Parts Only');
      setNotes('');

      // Fetch inventory item and suppliers
      const fetchData = async () => {
        try {
          const [suppliersData] = await Promise.all([
            Supplier.list()
          ]);
          setSuppliers(suppliersData);

          if (lineItem.inventory_item_id) {
            const item = await InventoryItem.get(lineItem.inventory_item_id);
            setInventoryItem(item);
          } else {
            setInventoryItem(null);
          }
        } catch (error) {
          console.error('Error fetching data:', error);
        }
      };
      fetchData();
    }
  }, [open, lineItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!lineItem || !inventoryItem) {
      alert('Cannot process warranty return: Missing item information.');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }

    if (qty > lineItem.qty) {
      alert(`Quantity cannot exceed ${lineItem.qty}`);
      return;
    }

    setSubmitting(true);

    try {
      // Get supplier name for the transaction record
      const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
      const supplierName = supplier?.name || 'Unknown Supplier';

      // Create InventoryReturn record
      const returnData = {
        inventory_item_id: inventoryItem.id,
        part_number: lineItem.part_number,
        description: lineItem.description,
        supplier: inventoryItem.supplier_id,
        quantity_returned: qty,
        return_type: 'warranty',
        return_reason: returnScope,
        cost_per_unit: inventoryItem.cost || 0,
        total_cost: (inventoryItem.cost || 0) * qty,
        return_date: new Date().toISOString(),
        status: 'On-site',
        work_order_id: workOrder.id,
        notes: notes || `Warranty return from WO ${workOrder.wo_number || workOrder.ro_number}. Scope: ${returnScope}`
      };

      const createdReturn = await InventoryReturn.create(returnData);
      console.log('Created warranty return:', createdReturn);

      // Create InventoryTxs record (informational only, no quantity change)
      const txData = {
        inventory_item_id: inventoryItem.id,
        ro_number: workOrder.wo_number || workOrder.ro_number,
        part_num: lineItem.part_number,
        tx_date: new Date().toISOString(),
        tx_type: 'Returned to Supplier',
        quantity_change: 0, // Informational only
        quantity_ordered_change: 0,
        supplier_name: supplierName,
        source_record_id: createdReturn.id,
        description: `Warranty return - ${returnScope}. ${notes || 'No additional notes.'}`
      };

      await InventoryTxs.create(txData);
      console.log('Created warranty transaction record');

      alert(`Warranty return processed successfully for ${qty} unit(s).`);
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error processing warranty return:', error);
      alert('Failed to process warranty return. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!lineItem) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Warranty Return
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part Info */}
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="font-semibold text-slate-900">{lineItem.part_number}</p>
            <p className="text-sm text-slate-600">{lineItem.description}</p>
            <p className="text-xs text-slate-500 mt-1">Work Order Qty: {lineItem.qty}</p>
          </div>

          {/* Warning if not linked to inventory */}
          {!inventoryItem && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Not linked to inventory</p>
                <p>This line item is not linked to an inventory item. The return will be created but inventory tracking may be limited.</p>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <Label htmlFor="quantity">Quantity to Return</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max={lineItem.qty}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          {/* Return Scope */}
          <div>
            <Label htmlFor="returnScope">Return Scope</Label>
            <Select value={returnScope} onValueChange={setReturnScope}>
              <SelectTrigger id="returnScope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Parts Only">Parts Only</SelectItem>
                <SelectItem value="Parts & Labour">Parts & Labour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this warranty return..."
              rows={3}
            />
          </div>

          {/* Info message */}
          <div className="text-xs text-slate-600 bg-blue-50 p-3 rounded-lg">
            <p className="font-medium text-blue-900 mb-1">Note:</p>
            <p>This will create a warranty return record but will NOT remove the part from the work order. The part will be marked for return to the supplier.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? 'Processing...' : 'Process Warranty Return'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}