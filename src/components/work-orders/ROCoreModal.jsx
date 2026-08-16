import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function ROCoreModal({ open, onClose, lineItem, workOrder, onCoreProcessed }) {
  const { employee } = useAuth();
  const [qty, setQty] = useState('');
  const [coreAction, setCoreAction] = useState('received');
  const [loading, setLoading] = useState(false);
  const qtyInputRef = useRef(null);

  // Lock-ownership gate - checked fresh on open, and again right before committing, since the
  // lock can change while this modal is sitting open.
  const [lockBlocked, setLockBlocked] = useState(false);
  const [lockHolder, setLockHolder] = useState('');

  useEffect(() => {
    if (open && lineItem) {
      setQty('');
      setCoreAction('received');
      requestAnimationFrame(() => {
        qtyInputRef.current?.focus();
      });
    }
  }, [open, lineItem]);

  useEffect(() => {
    const checkLock = async () => {
      if (!open || !workOrder?.id) {
        setLockBlocked(false);
        setLockHolder('');
        return;
      }
      try {
        const { data: freshWorkOrder } = await supabase
          .from('WorkOrder')
          .select('LockedByUser')
          .eq('id', workOrder.id)
          .maybeSingle();
        if (freshWorkOrder?.LockedByUser && freshWorkOrder.LockedByUser !== employee?.email) {
          setLockBlocked(true);
          setLockHolder(freshWorkOrder.LockedByUser);
        } else {
          setLockBlocked(false);
          setLockHolder('');
        }
      } catch (error) {
        console.error('Error checking work order lock:', error);
      }
    };
    checkLock();
  }, [open, workOrder?.id, employee?.email]);

  const coreCost = parseFloat(lineItem?.core_cost) || 0;
  const coreRet = parseFloat(lineItem?.core_ret) || 0;
  const coreNum = parseFloat(lineItem?.Core_num) || 0;
  const outstandingCoreQty = Math.max(0, coreNum - coreRet);

  const handleSubmit = async () => {
    const qtyProcessed = parseFloat(qty);

    if (!lineItem || !qty || !Number.isFinite(qtyProcessed) || qtyProcessed <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    if (coreAction === 'received' && qtyProcessed > outstandingCoreQty) {
      alert(`Quantity cannot exceed outstanding cores on this line (${outstandingCoreQty}).`);
      return;
    }

    if (coreAction === 'return_to_work_order' && qtyProcessed > coreRet) {
      alert(`Quantity cannot exceed customer-returned cores on this line (${coreRet}).`);
      return;
    }

    if (coreAction === 'return_to_work_order' && !workOrder?.id) {
      alert('Work order is missing. Please reload and try again.');
      return;
    }

    // Re-check lock ownership right before committing - it may have changed while this modal
    // was open. Entered qty/action are preserved either way, nothing is lost on a block.
    if (workOrder?.id) {
      try {
        const { data: freshWorkOrder } = await supabase
          .from('WorkOrder')
          .select('LockedByUser')
          .eq('id', workOrder.id)
          .maybeSingle();
        if (freshWorkOrder?.LockedByUser && freshWorkOrder.LockedByUser !== employee?.email) {
          setLockBlocked(true);
          setLockHolder(freshWorkOrder.LockedByUser);
          alert(`This Work Order is now held by ${freshWorkOrder.LockedByUser}. Retry once you regain access.`);
          return;
        }
      } catch (error) {
        console.error('Error re-checking work order lock before commit:', error);
      }
    }

    setLoading(true);
    try {
      if (coreAction === 'return_to_work_order') {
        const { data: response, error: returnError } = await supabase.functions.invoke('autopro-returnCoreToWO', {
          body: {
            part_number: lineItem.part_number || 'N/A',
            work_order_id: workOrder.id,
            quantity: qtyProcessed
          }
        });

        if (returnError || !response?.success) {
          alert(response?.error || returnError?.message || 'Failed to return core to work order.');
          return;
        }

        const newCoreRet = coreRet - qtyProcessed;
        onCoreProcessed(qtyProcessed, 'return_to_work_order', coreCost, newCoreRet);
        alert(`Core returned to work order. Quantity: ${qtyProcessed}`);
        return;
      }

      // Customer Core Returned (for eventual Supplier Return)
      // DO NOT change inventory quantity_on_hand
      // DO NOT create InventoryTxs

      let supplierId = 'Unknown Supplier';
      if (lineItem.inventory_item_id) {
        try {
          const { data, error } = await supabase
            .from('InventoryItem')
            .select('*')
            .eq('id', lineItem.inventory_item_id);
          const inventoryItem = data?.[0];
          if (inventoryItem && inventoryItem.supplier_id) {
            supplierId = inventoryItem.supplier_id;
          }
        } catch (error) {
          console.error('Error fetching supplier info from Supabase:', error);
        }
      }

      const now = new Date().toISOString();
      const returnRecord = {
        id: crypto.randomUUID(),
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
        notes: 'Core received from customer, awaiting return to supplier.',
        created_date: now,
        updated_date: now,
        created_by: employee?.email || null,
        created_by_id: employee?.id || null,
      };

      const { error: createError } = await supabase.from('InventoryReturn').insert([returnRecord]);
      if (createError) throw createError;

      const newCoreRet = coreRet + qtyProcessed;
      onCoreProcessed(qtyProcessed, 'received', coreCost, newCoreRet);

      alert(`Core received from customer and logged for supplier return. Quantity: ${qtyProcessed}`);
    } catch (error) {
      console.error('Error processing core:', error);
      alert(error?.response?.data?.error || 'Failed to process core. Please try again.');
    } finally {
      setLoading(false);
      onClose();
    }
  };

  if (!lineItem) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle>Process Core</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {lockBlocked && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-md text-sm font-medium">
              This Work Order is currently held by {lockHolder} — you can't process cores until it's released.
            </div>
          )}
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              <strong>Part:</strong> {lineItem.part_number} - {lineItem.description}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              <strong>Total Cores:</strong> {coreNum}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              <strong>Cores Returned by Customer:</strong> {coreRet}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
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
                <SelectItem value="return_to_work_order">Return Core to Work Order</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {coreAction === 'return_to_work_order'
                ? 'Move an on-site core return back onto this work order. Only matching part #, same work order, and On-site inventory return records will be used.'
                : 'Log that customer has returned the core. Creates an on-site inventory return record for later processing.'}
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {coreAction === 'return_to_work_order'
                ? `Max available on this line: ${coreRet}`
                : `Max outstanding on this line: ${outstandingCoreQty}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || lockBlocked}>
            {loading ? 'Processing...' : 'Process Core'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}