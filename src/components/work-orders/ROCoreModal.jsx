import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InventoryItem, InventoryReturn } from '@/entities/all';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';

export default function ROCoreModal({ open, onClose, lineItem, workOrder, onCoreProcessed }) {
  const [qty, setQty] = useState('');
  const [coreAction, setCoreAction] = useState('received');
  const [loading, setLoading] = useState(false);
  const qtyInputRef = useRef(null);

  useEffect(() => {
    if (open && lineItem) {
      setQty('');
      setCoreAction('received');
      requestAnimationFrame(() => {
        qtyInputRef.current?.focus();
      });
    }
  }, [open, lineItem]);

  const coreCost = parseFloat(lineItem?.core_cost) || 0;
  const coreRet = parseFloat(lineItem?.core_ret) || 0;
  const coreNum = parseFloat(lineItem?.Core_num) || 0;

  const handleSubmit = async () => {
    if (!lineItem || !qty || parseFloat(qty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setLoading(true);
    try {
      const qtyProcessed = parseFloat(qty);
      
      // Customer Core Returned (for eventual Supplier Return)
      // DO NOT change inventory quantity_on_hand
      // DO NOT create InventoryTxs
      
      // Get supplier info from inventory item
      let supplierId = 'Unknown Supplier';
      if (lineItem.inventory_item_id) {
        try {
          const inventoryItem = await InventoryItem.get(lineItem.inventory_item_id);
          if (inventoryItem && inventoryItem.supplier_id) {
            supplierId = inventoryItem.supplier_id;
          }
        } catch (error) {
          console.error('Error fetching supplier info:', error);
        }
      }

      // Create InventoryReturn record
      const returnRecord = {
        inventory_item_id: lineItem.inventory_item_id || null,
        part_number: lineItem.part_number || 'N/A',
        description: `${lineItem.description || 'Core'} (Core Return)`,
        supplier: supplierId,
        quantity_returned: qtyProcessed,
        return_type: 'core',
        return_reason: 'Customer Core Received',
        cost_per_unit: coreCost,
        total_cost: qtyProcessed * coreCost,
        return_date: format(toMountainTime(new Date()), 'yyyy-MM-dd'),
        work_order_id: workOrder?.id || null,
        status: 'On-site',
        notes: 'Core received from customer, awaiting return to supplier.'
      };

      await InventoryReturn.create(returnRecord);
      
      // Update core_ret on the line item (this will be handled by parent)
      const newCoreRet = coreRet + qtyProcessed;
      onCoreProcessed(qtyProcessed, 'received', coreCost, newCoreRet);
      
      alert(`Core received from customer and logged for supplier return. Quantity: ${qtyProcessed}`);

    } catch (error) {
      console.error('Error processing core:', error);
      alert('Failed to process core. Please try again.');
    } finally {
      setLoading(false);
      onClose();
    }
  };

  if (!lineItem) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Process Core</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Part:</strong> {lineItem.part_number} - {lineItem.description}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Total Cores:</strong> {coreNum}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Cores Returned by Customer:</strong> {coreRet}
            </p>
            <p className="text-sm text-slate-600 mb-4">
              <strong>Core Cost Each:</strong> ${coreCost.toFixed(2)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Core Action</Label>
            <Select value={coreAction} onValueChange={setCoreAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="received">Customer Core Returned</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Log that customer has returned the core. Creates an on-site inventory return record for later processing.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              ref={qtyInputRef}
              type="number"
              step="1"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Processing...' : 'Process Core'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}