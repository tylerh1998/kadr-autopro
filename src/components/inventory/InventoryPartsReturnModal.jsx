
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InventoryReturn, ReturnReason, InventoryItem, InventoryTxs, Supplier } from '@/entities/all';
import { Package, RotateCcw } from 'lucide-react';

export default function InventoryPartsReturnModal({ open, onClose, item, onUpdate, source, onReturnWorkOrderPart, workOrderNumber, workOrderId }) {
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnType, setReturnType] = useState('return');
  const [returnReason, setReturnReason] = useState('');
  const [reasons, setReasons] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchReasonsAndSuppliers = async () => {
        try {
          const reasonData = await ReturnReason.filter({ is_active: true });
          setReasons(reasonData);
          if (reasonData.length > 0) {
            setReturnReason(reasonData[0].reason);
          }

          // Fetch suppliers to get their names for transaction records
          const supplierData = await Supplier.filter({ is_active: true });
          setSuppliers(supplierData);

        } catch (error) {
          console.error("Failed to fetch return reasons or suppliers:", error);
        }
      };
      fetchReasonsAndSuppliers();
    }
  }, [open]);

  useEffect(() => {
    if (item && source === 'workOrder') {
      setReturnQuantity(item.qty?.toString() || '1');
    } else {
      setReturnQuantity('1');
    }
  }, [item, source]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item) return;

    const qtyReturned = parseInt(returnQuantity, 10);
    if (isNaN(qtyReturned) || qtyReturned <= 0) {
        alert("Please enter a valid quantity to return.");
        return;
    }

    if (source === 'workOrder' && onReturnWorkOrderPart) {
      // This path is for returning a part FROM a work order back TO general stock
      try {
          const currentQOH = item.quantity_on_hand || 0;
          await InventoryItem.update(item.id, { quantity_on_hand: currentQOH + qtyReturned });

          await InventoryTxs.create({
              inventory_item_id: item.id,
              part_num: item.part_number,
              tx_date: new Date().toISOString(),
              tx_type: 'Returned from WO',
              quantity_change: qtyReturned, // Positive change as it's returning to stock
              quantity_ordered_change: 0,
              ro_number: workOrderNumber,
              source_record_id: workOrderId,
              description: `Part returned from WO ${workOrderNumber}. Reason: ${returnReason}`
          });
          
          onReturnWorkOrderPart(qtyReturned, returnType, returnReason); // Notify parent about the return
          onClose();
          return;

      } catch (error) {
          console.error('Failed to process work order part return:', error);
          alert('An error occurred while processing the work order part return.');
          return;
      }
    }

    // This path is for returning a part FROM general stock TO the supplier
    try {
      const returnData = {
        inventory_item_id: item.id,
        part_number: item.part_number,
        description: item.description,
        supplier: item.supplier_id,
        quantity_returned: qtyReturned,
        return_type: returnType,
        return_reason: returnReason,
        cost_per_unit: item.cost,
        total_cost: item.cost * qtyReturned,
        return_date: new Date().toISOString(),
        status: 'On-site',
        notes: `Returned from general inventory.`
      };
      const createdReturn = await InventoryReturn.create(returnData);

      // Decrement QOH from inventory
      const updatedQOH = (item.quantity_on_hand || 0) - qtyReturned;
      await InventoryItem.update(item.id, { quantity_on_hand: updatedQOH });
      
      // Create transaction record
      await InventoryTxs.create({
        inventory_item_id: item.id,
        part_num: item.part_number,
        tx_date: new Date().toISOString(),
        tx_type: 'Returned to Supplier',
        quantity_change: -qtyReturned, // Negative change as it's leaving stock
        quantity_ordered_change: 0,
        source_record_id: createdReturn.id,
        supplier_name: suppliers.find(s => s.id === item.supplier_id)?.name || '',
        description: `Part returned to supplier. Reason: ${returnReason}`
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to process return:', error);
      alert('An error occurred while processing the return.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return Part to Supplier</DialogTitle>
          <DialogDescription>
            This will remove the part from your inventory and place it in the returns list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-md">
            <Package className="w-6 h-6 text-slate-600" />
            <div>
              <p className="font-semibold">{item?.part_number}</p>
              <p className="text-sm text-slate-500">{item?.description}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="returnQuantity">Quantity to Return</Label>
            <Input
              id="returnQuantity"
              type="number"
              min="1"
              max={source === 'workOrder' ? item?.qty : item?.quantity_on_hand}
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="returnType">Return Type</Label>
            <Select value={returnType} onValueChange={setReturnType}>
              <SelectTrigger id="returnType">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="return">Return</SelectItem>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="warranty">Warranty</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="returnReason">Reason for Return</Label>
            <Select value={returnReason} onValueChange={setReturnReason}>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              <RotateCcw className="w-4 h-4 mr-2" />
              Process Return
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
