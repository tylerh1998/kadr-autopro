import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { Package, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export default function ReceivePartModal({ open, onClose, lineItems, workOrderId, roNumber, onReceive }) {
  const [rows, setRows] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const qualifyingLines = useMemo(() => (lineItems || []).filter(l =>
    (parseFloat(l?.qty_on_order) || 0) > 0 || (parseFloat(l?.qty_quoted) || 0) > 0
  ), [lineItems]);

  // Fetch latest inventory data every time the modal opens - never trust a stale `inventory` prop.
  useEffect(() => {
    const fetchAndBuildRows = async () => {
      if (!open) return;
      setResult(null);
      setError('');
      setFetchLoading(true);

      try {
        const inventoryItemIds = [...new Set(qualifyingLines.map(l => l.inventory_item_id).filter(Boolean))];
        let inventoryMap = {};
        if (inventoryItemIds.length > 0) {
          const { data, error: fetchError } = await supabase
            .from('InventoryItem')
            .select('*')
            .in('id', inventoryItemIds);
          if (fetchError) throw fetchError;
          (data || []).forEach(item => { inventoryMap[item.id] = item; });
        }

        const builtRows = qualifyingLines.map(line => {
          const qtyOnOrder = parseFloat(line.qty_on_order) || 0;
          const qtyQuoted = parseFloat(line.qty_quoted) || 0;
          // Same precedence the backend uses: on-order first.
          const source = qtyOnOrder > 0 ? 'on_order' : 'quoted';
          const sourceQty = source === 'on_order' ? qtyOnOrder : qtyQuoted;
          const inventoryItem = inventoryMap[line.inventory_item_id] || null;
          const qoh = parseFloat(inventoryItem?.quantity_on_hand) || 0;
          const maxReceivable = Math.min(qoh, sourceQty);

          return {
            lineItem: line,
            source,
            sourceQty,
            qoh,
            maxReceivable,
            checked: maxReceivable > 0,
            applyQty: maxReceivable > 0 ? String(maxReceivable) : ''
          };
        });

        setRows(builtRows);
      } catch (err) {
        console.error('Failed to fetch inventory items for receive-parts modal:', err);
        setError('Failed to fetch latest inventory data.');
      } finally {
        setFetchLoading(false);
      }
    };

    fetchAndBuildRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleChecked = (lineId) => {
    setRows(prev => prev.map(r => r.lineItem.id === lineId ? { ...r, checked: !r.checked } : r));
  };

  const updateApplyQty = (lineId, value) => {
    setRows(prev => prev.map(r => r.lineItem.id === lineId ? { ...r, applyQty: value } : r));
  };

  const checkedRows = rows.filter(r => r.checked);

  const handleSubmit = async () => {
    if (checkedRows.length === 0) {
      setError('Select at least one part to receive.');
      return;
    }

    const receipts = [];
    for (const row of checkedRows) {
      const qty = parseFloat(row.applyQty);
      if (isNaN(qty) || qty <= 0) {
        setError(`Enter a valid quantity for ${row.lineItem.part_number || 'a selected part'}.`);
        return;
      }
      if (qty > row.maxReceivable) {
        setError(`Cannot apply more than ${row.maxReceivable} for ${row.lineItem.part_number || 'a selected part'}.`);
        return;
      }
      receipts.push({ lineItemId: row.lineItem.id, quantity: qty });
    }

    setLoading(true);
    setError('');

    try {
      const response = await supabase.functions.invoke('autopro-processWorkOrderPartReceive', {
        body: { workOrderId, roNumber, receipts }
      });

      if (response.error || response.data?.error) {
        setError(response.error?.message || response.data?.error || 'Failed to receive parts');
        setLoading(false);
        return;
      }

      const { updatedLineItems, skipped, message } = response.data;
      onReceive(updatedLineItems);

      if (skipped && skipped.length > 0) {
        setResult({ message, skipped });
        setLoading(false);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error receiving parts:', err);
      setError(err.message || 'Failed to process receipt. Please try again.');
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Receive Parts
          </DialogTitle>
          <DialogDescription>
            Pull on-order or quoted parts from inventory onto this work order.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300">{result.message}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Not received:</p>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2">
                {result.skipped.map((s, idx) => (
                  <div key={idx} className="text-xs text-amber-700 dark:text-amber-400">
                    {rows.find(r => String(r.lineItem.id) === String(s.lineItemId))?.lineItem?.part_number || s.lineItemId}: {s.reason}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : fetchLoading ? (
          <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-slate-600 dark:text-slate-400">Checking inventory...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No receivable parts remain on this work order.</p>
          </div>
        ) : (
          <>
            <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="text-left font-medium p-2 text-slate-600 dark:text-slate-400">Part Info</th>
                    <th className="text-left font-medium p-2 text-slate-600 dark:text-slate-400">Qty On Order-Quoted</th>
                    <th className="text-left font-medium p-2 text-slate-600 dark:text-slate-400">Qty On Hand</th>
                    <th className="text-left font-medium p-2 text-slate-600 dark:text-slate-400">Apply to WO</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.lineItem.id} className="border-b border-slate-100 dark:border-slate-900 last:border-0">
                      <td className="p-2 align-top">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={row.checked}
                            disabled={row.maxReceivable <= 0}
                            onCheckedChange={() => toggleChecked(row.lineItem.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="font-medium dark:text-slate-100 truncate">{row.lineItem.part_number || '(no part #)'}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.lineItem.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`p-2 align-top font-semibold whitespace-nowrap ${row.source === 'on_order' ? 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20' : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20'}`}>
                        {row.sourceQty}
                        <div className="text-[10px] font-normal opacity-80">{row.source === 'on_order' ? 'On Order (WO)' : 'Quoted (WO)'}</div>
                      </td>
                      <td className="p-2 align-top font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 whitespace-nowrap">
                        {row.qoh}
                      </td>
                      <td className="p-2 align-top bg-emerald-50 dark:bg-emerald-900/20">
                        <Input
                          type="number"
                          min="0"
                          max={row.maxReceivable}
                          step="0.01"
                          value={row.applyQty}
                          disabled={!row.checked}
                          onChange={(e) => updateApplyQty(row.lineItem.id, e.target.value)}
                          className="w-24 text-emerald-800 dark:text-emerald-300 font-semibold"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={loading || checkedRows.length === 0}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Receiving...
                  </>
                ) : (
                  `Receive ${checkedRows.length} Part${checkedRows.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
