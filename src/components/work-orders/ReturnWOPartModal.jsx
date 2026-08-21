import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from '@/lib/supabase';
import { Package, RotateCcw, Shield, AlertTriangle } from 'lucide-react';

export default function ReturnWOPartModal({ open, onClose, lineItem, onReturn, onWarrantyReturn, workOrder }) {
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [returnType, setReturnType] = useState('standard');
  const [warrantyScope, setWarrantyScope] = useState('Parts Only');

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

  useEffect(() => {
    if (open) {
      setReturnType('standard');
      setReturnReason('');
      setReturnNotes('');
      setWarrantyScope('Parts Only');
    }
  }, [open]);

  const lineQty = parseFloat(lineItem?.qty) || 0;
  const isWarrantyQtyBlocked = returnType === 'warranty' && lineQty > 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!lineItem) return;

    if (returnType === 'warranty') {
      if (isWarrantyQtyBlocked) return;

      setLoading(true);
      try {
        await onWarrantyReturn(lineItem, returnNotes, warrantyScope);
        onClose();
      } catch (error) {
        console.error('Failed to process warranty return:', error);
        alert(`An error occurred while processing the warranty return: ${error.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
      return;
    }

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
            Return this part to supplier for credit, or mark it warranty for a claim before this work order is invoiced.
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
            <Label>Return Type</Label>
            <RadioGroup value={returnType} onValueChange={setReturnType} className="flex items-center gap-6 mt-2" disabled={loading}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="returnTypeStandard" />
                <Label htmlFor="returnTypeStandard" className="font-normal cursor-pointer">Standard Return</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="warranty" id="returnTypeWarranty" />
                <Label htmlFor="returnTypeWarranty" className="font-normal cursor-pointer flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> Warranty
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="returnQuantity">Quantity to Return</Label>
            <Input
              id="returnQuantity"
              type="number"
              min="1"
              max={Math.max(0, (parseFloat(lineItem.qty) || 0) - (parseFloat(lineItem.qty_on_order) || 0))}
              value={returnType === 'warranty' ? lineItem.qty : returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
              required
              disabled={loading || returnType === 'warranty'}
            />
          </div>

          {returnType === 'warranty' ? (
            <>
              <div>
                <Label htmlFor="warrantyScope">Warranty Scope</Label>
                <Select value={warrantyScope} onValueChange={setWarrantyScope} disabled={loading}>
                  <SelectTrigger id="warrantyScope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Parts Only">Parts Only</SelectItem>
                    <SelectItem value="Parts & Labour">Parts & Labour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isWarrantyQtyBlocked && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-300">
                    <p className="font-medium">Partial warranties are not supported.</p>
                    <p>If you need to return this line with a different quantity than shown above, please delete the line and split it. Marking a line for warranty can only be done for the full line.</p>
                  </div>
                </div>
              )}
            </>
          ) : (
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
          )}

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
            <Button
              type="submit"
              className={returnType === 'warranty' ? "bg-green-600 hover:bg-green-700 text-white dark:text-white" : "bg-blue-600 hover:bg-blue-700 text-white dark:text-white"}
              disabled={loading || isWarrantyQtyBlocked}
            >
              {returnType === 'warranty' ? <Shield className="w-4 h-4 mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              {loading ? 'Processing...' : (returnType === 'warranty' ? 'Process Warranty Return' : 'Process Return')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
