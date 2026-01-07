import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InventoryReturn, ReturnReason, InventoryItem, InventoryTxs, Supplier } from '@/entities/all';
import { Package, RotateCcw } from 'lucide-react';

export default function ReturnWOPartModal({ open, onClose, lineItem, onReturn, workOrder }) {
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const fetchReasons = async () => {
        try {
          const reasonData = await ReturnReason.filter({ is_active: true, hide: false });
          setReasons(reasonData);
        } catch (error) {
          console.error("Failed to fetch return reasons:", error);
        }
      };
      fetchReasons();
    }
  }, [open]);

  useEffect(() => {
    if (lineItem) {
      setReturnQuantity(lineItem.qty?.toString() || '1');
    } else {
      setReturnQuantity('1');
    }
  }, [lineItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!lineItem) return;

    const qtyOnOrder = parseFloat(lineItem.qty_on_order) || 0;
    const currentQty = parseFloat(lineItem.qty) || 0;
    const maxReturnable = Math.max(0, currentQty - qtyOnOrder);

    const qtyReturned = parseInt(returnQuantity, 10);
    if (isNaN(qtyReturned) || qtyReturned <= 0) {
        alert("Please enter a valid quantity to return.");
        return;
    }

    if (qtyReturned > maxReturnable) {
        alert(`Cannot return more than ${maxReturnable} units (Qty: ${currentQty} - On Order: ${qtyOnOrder}).`);
        return;
    }

    setLoading(true);

    try {
      console.log('=== DEBUG: Phase 6 - Starting return process ===');
      console.log('Line item:', lineItem);
      console.log('Quantity to return:', qtyReturned);

      // Step 1: Fetch InventoryItem and Supplier data
      let inventoryItem = null;
      let supplier = null;
      
      if (lineItem.inventory_item_id) {
        console.log('=== DEBUG: Fetching inventory item ===');
        inventoryItem = await InventoryItem.get(lineItem.inventory_item_id);
        console.log('Fetched inventory item:', inventoryItem);

        if (inventoryItem && inventoryItem.supplier_id) {
          console.log('=== DEBUG: Fetching supplier ===');
          supplier = await Supplier.get(inventoryItem.supplier_id);
          console.log('Fetched supplier:', supplier);
        }
      }

      // Step 2: Create First InventoryTxs Record (Returned from WO)
      console.log('=== DEBUG: Creating first InventoryTxs (Returned from WO) ===');
      const txData1 = {
        inventory_item_id: inventoryItem?.id || null,
        part_num: lineItem.part_number || 'UNKNOWN',
        tx_date: new Date().toISOString(),
        tx_type: 'Returned from WO',
        quantity_change: qtyReturned, // POSITIVE: returning to stock
        quantity_ordered_change: 0,
        ro_number: workOrder?.ro_number || '',
        source_record_id: workOrder?.id || '',
        description: `Part ${lineItem.part_number} returned from Work Order ${workOrder?.ro_number || 'Unknown'} to general inventory. Reason: ${returnReason}. Notes: ${returnNotes || ''}`
      };
      console.log('Creating InventoryTxs 1:', txData1);
      await InventoryTxs.create(txData1);

      // Step 3: Create InventoryReturn Record
      console.log('=== DEBUG: Creating InventoryReturn record ===');
      const returnData = {
        part_number: lineItem.part_number || 'UNKNOWN',
        description: lineItem.description || '',
        supplier: supplier?.id || inventoryItem?.supplier_id || 'UNKNOWN',
        quantity_returned: qtyReturned,
        return_type: 'return',
        return_reason: returnReason,
        cost_per_unit: inventoryItem?.cost || lineItem.cost_ea || 0,
        total_cost: (inventoryItem?.cost || lineItem.cost_ea || 0) * qtyReturned,
        return_date: new Date().toISOString().split('T')[0],
        status: 'On-site',
        work_order_id: workOrder?.id || '',
        inventory_item_id: inventoryItem?.id || null,
        notes: returnNotes || `Returned from Work Order ${workOrder?.ro_number || 'Unknown'}. ${returnReason}`
      };
      console.log('Creating InventoryReturn:', returnData);
      const createdInventoryReturn = await InventoryReturn.create(returnData);
      console.log('Created InventoryReturn:', createdInventoryReturn);

      // Step 4: Create Second InventoryTxs Record (Returned to Supplier)
      console.log('=== DEBUG: Creating second InventoryTxs (Returned to Supplier) ===');
      const txData2 = {
        inventory_item_id: inventoryItem?.id || null,
        part_num: lineItem.part_number || 'UNKNOWN',
        tx_date: new Date().toISOString(),
        tx_type: 'Returned to Supplier',
        quantity_change: -qtyReturned, // NEGATIVE: leaving to supplier
        quantity_ordered_change: 0,
        ro_number: workOrder?.ro_number || '',
        source_record_id: createdInventoryReturn?.id || '',
        supplier_name: supplier?.name || 'Unknown Supplier',
        description: `Part ${lineItem.part_number} shipped to supplier ${supplier?.name || 'Unknown Supplier'} for credit, from WO ${workOrder?.ro_number || 'Unknown'}. Reason: ${returnReason}. Notes: ${returnNotes || ''}`
      };
      console.log('Creating InventoryTxs 2:', txData2);
      await InventoryTxs.create(txData2);

      console.log('=== DEBUG: Phase 6 - Return process complete ===');

      // Step 5: Call parent handler to update the line item in the UI
      onReturn(qtyReturned, 'return', returnReason);
      onClose();

    } catch (error) {
      console.error('Failed to process work order part return:', error);
      console.error('Error details:', error.response?.data);
      alert(`An error occurred while processing the work order part return: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!lineItem) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return Part from Work Order</DialogTitle>
          <DialogDescription>
            Return this part to supplier for credit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-md">
            <Package className="w-6 h-6 text-slate-600" />
            <div>
              <p className="font-semibold">{lineItem.part_number || 'No Part Number'}</p>
              <p className="text-sm text-slate-500">{lineItem.description || 'No Description'}</p>
              <p className="text-xs text-slate-400 mt-1">
                Available to return: {Math.max(0, (parseFloat(lineItem.qty) || 0) - (parseFloat(lineItem.qty_on_order) || 0))} {lineItem.unit || ''} 
                <span className="ml-1 text-slate-300">(Qty: {lineItem.qty} - On Order: {lineItem.qty_on_order || 0})</span>
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="returnQuantity">Quantity to Return</Label>
            <Input
              id="returnQuantity"
              type="number"
              min="1"
              max={Math.max(0, (parseFloat(lineItem.qty) || 0) - (parseFloat(lineItem.qty_on_order) || 0))}
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="returnReason">Reason for Return</Label>
            <Select value={returnReason} onValueChange={setReturnReason} disabled={loading}>
              <SelectTrigger id="returnReason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.reason}>
                    {r.reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="returnNotes">Notes (Optional)</Label>
            <Input
              id="returnNotes"
              type="text"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Additional notes..."
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {loading ? 'Processing...' : 'Process Return'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}