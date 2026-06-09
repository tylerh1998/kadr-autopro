import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (open && lineItem) {
      setQty('');
      setCoreAction('received');
    }
  }, [open, lineItem]);

  const handleSubmit = async () => {
    if (!lineItem || !qty || parseFloat(qty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setLoading(true);
    try {
      const qtyProcessed = parseFloat(qty);
      
      if (coreAction === 'received') {
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
          cost_per_unit: lineItem.core_cost || 0,
          total_cost: qtyProcessed * (lineItem.core_cost || 0),
          return_date: format(toMountainTime(new Date()), 'yyyy-MM-dd'),
          work_order_id: workOrder?.id || null,
          status: 'On-site',
          notes: 'Core received from customer, awaiting return to supplier.'
        };

        await InventoryReturn.create(returnRecord);
        
        // Update core_ret on the line item (this will be handled by parent)
        const newCoreRet = (lineItem.core_ret || 0) + qtyProcessed;
        onCoreProcessed(qtyProcessed, 'received', lineItem.core_cost || 0, newCoreRet);
        
        alert(`Core received from customer and logged for supplier return. Quantity: ${qtyProcessed}`);
        
      } else if (coreAction === 'returned_to_supplier') {
        // Return to Supplier
        // This action updates an existing InventoryReturn record status from 'On-site' to 'Returned'
        // DO NOT change inventory quantity_on_hand
        
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

        // Find existing on-site inventory return records for this part
        const existingReturns = await InventoryReturn.filter({
          part_number: lineItem.part_number,
          status: 'On-site',
          return_type: 'core'
        });

        if (existingReturns && existingReturns.length > 0) {
          // Update the first matching record to 'Returned'
          const returnToUpdate = existingReturns[0];
          await InventoryReturn.update(returnToUpdate.id, {
            status: 'Returned',
            date_returned: new Date().toISOString(),
            notes: `${returnToUpdate.notes || ''}\nReturned to supplier on ${format(toMountainTime(new Date()), 'yyyy-MM-dd')}`
          });
          
          alert(`Core marked as returned to supplier. Quantity: ${returnToUpdate.quantity_returned}`);
        } else {
          // No on-site return found, create a new return record directly as 'Returned'
          const returnRecord = {
            inventory_item_id: lineItem.inventory_item_id || null,
            part_number: lineItem.part_number || 'N/A',
            description: `${lineItem.description || 'Core'} (Core Return)`,
            supplier: supplierId,
            quantity_returned: qtyProcessed,
            return_type: 'core',
            return_reason: 'Direct Return to Supplier',
            cost_per_unit: lineItem.core_cost || 0,
            total_cost: qtyProcessed * (lineItem.core_cost || 0),
            return_date: format(toMountainTime(new Date()), 'yyyy-MM-dd'),
            work_order_id: workOrder?.id || null,
            status: 'Returned',
            date_returned: new Date().toISOString(),
            notes: 'Core returned directly to supplier.'
          };

          await InventoryReturn.create(returnRecord);
          alert(`Core return created and marked as returned to supplier. Quantity: ${qtyProcessed}`);
        }
        
        onCoreProcessed(qtyProcessed, 'returned_to_supplier', lineItem.core_cost || 0);
      }

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
              <strong>Total Cores:</strong> {lineItem.Core_num || 0}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Cores Returned by Customer:</strong> {lineItem.core_ret || 0}
            </p>
            <p className="text-sm text-slate-600 mb-4">
              <strong>Core Cost Each:</strong> ${(lineItem.core_cost || 0).toFixed(2)}
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
                <SelectItem value="returned_to_supplier">Return to Supplier</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {coreAction === 'received' 
                ? 'Log that customer has returned the core. Creates return record for eventual supplier return.'
                : 'Mark core as returned to supplier. Updates existing return record status.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
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