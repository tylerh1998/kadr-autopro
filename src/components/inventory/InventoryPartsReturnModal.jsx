import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReturnReason, Supplier } from '@/entities/all';
import { supabase } from '@/lib/supabase';
import { Package, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getMountainTimeNow } from '@/components/utils/mountainTimeUtils';

export default function InventoryPartsReturnModal({ open, onClose, item, onUpdate, source, onReturnWorkOrderPart, workOrderNumber, workOrderId }) {
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [reasons, setReasons] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchReasonsAndSuppliers = async () => {
        try {
          const reasonData = await ReturnReason.filter({ is_active: true, hide: false });
          setReasons(reasonData);

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

  const getSupplierName = (id) => {
    const s = suppliers.find(x => x.id === id);
    return s ? s.name : 'Unknown';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item) return;

    const qtyReturned = parseInt(returnQuantity, 10);
    if (isNaN(qtyReturned) || qtyReturned <= 0) {
        alert("Please enter a valid quantity to return.");
        return;
    }

    // Fetch user from Supabase auth for audit trail
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id || null;
    const userDisplay = authUser?.user_metadata?.full_name || authUser?.email || null;
    const nowStr = new Date().toISOString();

    if (source === 'workOrder' && onReturnWorkOrderPart) {
      // This path is for returning a part FROM a work order back TO general stock
      try {
          const currentQOH = Number(item.quantity_on_hand || 0);
          const newQOH = currentQOH + qtyReturned;
          
          const { error: updateError } = await supabase.rpc('update_inventory_with_audit', {
              p_item_id: item.id,
              p_qoh: newQOH,
              p_qoo: Number(item.quantity_on_order || 0),
              p_ro_number: workOrderNumber,
              p_supplier_inv: null,
              p_source_action: 'InventoryPartsReturnModal (Work Order)',
              p_tx_type: 'Returned from WO',
              p_description: `Part returned from WO ${workOrderNumber}. Reason: ${returnReason}`,
              p_user_id: userId,
              p_user_name: userDisplay,
              p_source_record_id: workOrderId
          });
          
          if (updateError) {
              console.error('Failed to update inventory via RPC:', updateError);
              throw new Error('Failed to update inventory quantity');
          }
          
          onReturnWorkOrderPart(qtyReturned, returnReason); // Notify parent about the return
          onClose();
          return;

      } catch (error) {
          console.error('Failed to process work order part return:', error);
          alert('An error occurred while processing the work order part return.');
          return;
      }
    }

    try {
      const returnId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').substring(0, 24) : Date.now().toString();
      const costVal = parseFloat(item.cost || 0);
      const qtyVal = Number(qtyReturned);

      const returnData = {
        id: returnId,
        inventory_item_id: item.id,
        part_number: item.part_number,
        description: item.description,
        supplier: item.supplier_id,
        quantity_returned: qtyVal,
        return_type: 'return',
        return_reason: returnReason,
        cost_per_unit: costVal,
        total_cost: costVal * qtyVal,
        return_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'On-site',
        notes: returnNotes || '',
        created_date: nowStr,
        updated_date: nowStr,
        created_by_id: userId,
        created_by: userDisplay
      };
      const { error: returnError } = await supabase.from('InventoryReturn').insert([returnData]);
      if (returnError) throw new Error('Failed to create InventoryReturn: ' + returnError.message);

      // Handle Core Return if applicable
      if (item.core) {
        const coreCostVal = parseFloat(item.core_cost || 0);
        const coreReturnId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').substring(0, 24) : Date.now().toString();
        const coreReturnData = {
          id: coreReturnId,
          inventory_item_id: item.id,
          part_number: item.part_number,
          description: `${item.description} (Core Return)`,
          supplier: item.supplier_id,
          quantity_returned: qtyVal,
          return_type: 'core',
          return_reason: returnReason,
          cost_per_unit: coreCostVal,
          total_cost: coreCostVal * qtyVal,
          return_date: format(new Date(), 'yyyy-MM-dd'),
          status: 'On-site',
          notes: returnNotes || '',
          created_date: nowStr,
          updated_date: nowStr,
          created_by_id: userId,
          created_by: userDisplay
        };
        const { error: coreReturnError } = await supabase.from('InventoryReturn').insert([coreReturnData]);
        if (coreReturnError) throw new Error('Failed to create core return: ' + coreReturnError.message);
      }

      // Decrement QOH from inventory
      const updatedQOH = Number(item.quantity_on_hand || 0) - qtyVal;
      const { error: updateError } = await supabase.rpc('update_inventory_with_audit', {
        p_item_id: item.id,
        p_qoh: updatedQOH,
        p_qoo: Number(item.quantity_on_order || 0),
        p_ro_number: null,
        p_supplier_inv: null,
        p_source_action: 'InventoryPartsReturnModal',
        p_tx_type: 'Returned to Supplier',
        p_description: `Part returned to supplier from inventory. Reason: ${returnReason}`,
        p_user_id: userId,
        p_user_name: userDisplay,
        p_source_record_id: returnId
      });
      
      if (updateError) throw new Error('Failed to update inventory quantity via RPC: ' + updateError.message);


      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to process return:', error);
      alert('An error occurred while processing the return: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Return Part to Supplier</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            This will remove the part from your inventory and place it in the returns list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 p-3 rounded-md">
            <Package className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            <div>
              <p className="font-semibold dark:text-slate-100">{item?.part_number}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{item?.description}</p>
            </div>
          </div>

          {item?.core && (
            <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 p-3 rounded-md text-sm border dark:border-blue-900">
              This part has a core. A core return will also be processed automatically.
            </div>
          )}

          <div>
            <Label htmlFor="returnQuantity" className="dark:text-slate-300">Quantity to Return</Label>
            <Input
              id="returnQuantity"
              type="number"
              min="1"
              max={source === 'workOrder' ? item?.qty : item?.quantity_on_hand}
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
              className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <Label htmlFor="returnReason" className="dark:text-slate-300">Reason for Return</Label>
            <Select value={returnReason} onValueChange={setReturnReason}>
              <SelectTrigger id="returnReason" className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.reason} className="dark:text-slate-300 dark:focus:bg-slate-800">
                    {r.reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="returnNotes" className="dark:text-slate-300">Notes (Optional)</Label>
            <Input
              id="returnNotes"
              type="text"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Additional notes..."
              className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white">
              <RotateCcw className="w-4 h-4 mr-2" />
              Process Return
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}