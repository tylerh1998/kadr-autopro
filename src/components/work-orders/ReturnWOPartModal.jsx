import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/lib/supabase';
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
          const { data: reasonData, error } = await supabase.from('ReturnReason').select('*').eq('is_active', true).eq('hide', false);
          if (error) throw error;
          setReasons(reasonData || []);
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
      const response = await supabase.functions.invoke('autopro-processWorkOrderPartReturn', {
        body: {
          inventoryItemId: lineItem.inventory_item_id,
          workOrderId: workOrder?.id || '',
          roNumber: workOrder?.ro_number || '',
          partNumber: lineItem.part_number || 'UNKNOWN',
          description: lineItem.description || '',
          qtyToReturn: qtyReturned,
          createInventoryReturn: true,
          returnReason,
          returnNotes,
          costEach: lineItem.cost_ea || 0,
          coreCostEach: parseFloat(lineItem.core_cost) || 0,
        }
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to process work order part return');
      }

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
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-md border border-slate-100 dark:border-slate-800">
            <Package className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            <div>
              <p className="font-semibold dark:text-slate-100">{lineItem.part_number || 'No Part Number'}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{lineItem.description || 'No Description'}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Available to return: {Math.max(0, (parseFloat(lineItem.qty) || 0) - (parseFloat(lineItem.qty_on_order) || 0))} {lineItem.unit || ''} 
                <span className="ml-1 text-slate-300 dark:text-slate-600">(Qty: {lineItem.qty} - On Order: {lineItem.qty_on_order || 0})</span>
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
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white dark:text-white" disabled={loading}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {loading ? 'Processing...' : 'Process Return'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}