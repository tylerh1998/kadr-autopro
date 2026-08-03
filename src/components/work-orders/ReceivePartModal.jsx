import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { Package, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';

export default function ReceivePartModal({ open, onClose, lineItem, inventoryItem: initialInventoryItem, workOrderId, roNumber, onReceive }) {
  const [quantityToReceive, setQuantityToReceive] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentInventoryItem, setCurrentInventoryItem] = useState(initialInventoryItem);

  // Fetch latest inventory data when modal opens
  useEffect(() => {
    const fetchLatestInventory = async () => {
      const inventoryItemId = lineItem?.inventory_item_id || initialInventoryItem?.id;
      
      if (open && inventoryItemId) {
        setFetchLoading(true);
        try {
          const { data, error } = await supabase
            .from('InventoryItem')
            .select('*')
            .eq('id', inventoryItemId);

          const freshItem = data?.[0] || null;
          setCurrentInventoryItem(freshItem);

          if (!freshItem) {
            setError('Failed to fetch latest inventory data.');
            return;
          }
          
          const currentQOH = freshItem?.quantity_on_hand || 0;
          const qtyOnOrder = lineItem?.qty_on_order || 0;
          const defaultQty = Math.min(currentQOH, qtyOnOrder);
          
          setQuantityToReceive(defaultQty > 0 ? defaultQty.toString() : '');
          setError('');
        } catch (err) {
          console.error("Failed to fetch inventory item:", err);
          setError("Failed to fetch latest inventory data.");
        } finally {
          setFetchLoading(false);
        }
      }
    };

    fetchLatestInventory();
  }, [open, lineItem, initialInventoryItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!lineItem || !currentInventoryItem) {
      setError('Missing line item or inventory item information.');
      return;
    }

    const qtyToReceive = parseFloat(quantityToReceive);
    
    if (isNaN(qtyToReceive) || qtyToReceive <= 0) {
      setError('Please enter a valid quantity greater than 0.');
      return;
    }

    const currentQOH = currentInventoryItem.quantity_on_hand || 0;
    const qtyOnOrder = lineItem.qty_on_order || 0;

    // Validation: Can't receive more than what's on order
    if (qtyToReceive > qtyOnOrder) {
      setError(`Cannot receive more than what's on order (${qtyOnOrder}).`);
      return;
    }

    // Validation: Can't receive more than what's available in inventory
    if (qtyToReceive > currentQOH) {
      setError(`Cannot receive more than what's available in inventory (${currentQOH}).`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call the backend function to handle all updates atomically
      const response = await supabase.functions.invoke('autopro-processWorkOrderPartReceive', {
        body: {
          workOrderId,
          roNumber,
          lineItemId: lineItem.id,
          receivedQuantity: qtyToReceive
        }
      });

      if (response.error || response.data?.error) {
        setError(response.error?.message || response.data?.error || 'Failed to receive part');
        setLoading(false);
        return;
      }

      // Call the parent callback to trigger UI refresh
      onReceive(lineItem, qtyToReceive, currentInventoryItem);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Error receiving part:', error);
      setError(error.message || 'Failed to process part receipt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const currentQOH = currentInventoryItem?.quantity_on_hand || 0;
  const qtyOnOrder = lineItem?.qty_on_order || 0;
  const maxReceivable = Math.min(currentQOH, qtyOnOrder);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md dark:bg-slate-950 dark:border-slate-800">
        {fetchLoading ? (
          <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-slate-600 dark:text-slate-400">Checking inventory...</p>
          </div>
        ) : (!lineItem || !currentInventoryItem) ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
             <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
             <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Details Unavailable</h3>
             <p className="text-slate-500 dark:text-slate-400 mt-1 mb-4">{error || "Could not load inventory or line item details."}</p>
             <Button onClick={onClose} variant="secondary">Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Receive Part from Inventory
              </DialogTitle>
              <DialogDescription>
                Transfer part from inventory to this work order
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Part Information */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg space-y-2 border border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Part Number</p>
                  <p className="text-lg font-semibold dark:text-slate-100">{lineItem.part_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{lineItem.description}</p>
                </div>
              </div>

              {/* Inventory Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-transparent dark:border-blue-800/50">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Available in Inventory</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{currentQOH}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg border border-transparent dark:border-purple-800/50">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">On Order (WO)</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{qtyOnOrder}</p>
                </div>
              </div>

              {/* Quantity Input */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="quantity">Quantity to Receive</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    max={maxReceivable}
                    step="0.01"
                    value={quantityToReceive}
                    onChange={(e) => setQuantityToReceive(e.target.value)}
                    placeholder="Enter quantity"
                    required
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Maximum receivable: {maxReceivable} (limited by available inventory)
                  </p>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}

                {/* Info Box */}
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    <TrendingDown className="w-4 h-4 inline mr-1" />
                    This will reduce inventory QOH and the on-order quantity for this work order.
                  </p>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || maxReceivable <= 0}>
                    {loading ? 'Processing...' : 'Receive Part'}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}