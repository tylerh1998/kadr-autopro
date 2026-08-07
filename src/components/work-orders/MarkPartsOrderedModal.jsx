import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { Truck, AlertCircle, Loader2 } from 'lucide-react';

export default function MarkPartsOrderedModal({ open, onClose, lineItems, workOrderId, roNumber, onMarked }) {
  const [checkedIds, setCheckedIds] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const quotedLines = (lineItems || []).filter(l => (parseFloat(l?.qty_quoted) || 0) > 0);

  useEffect(() => {
    if (open) {
      const initialChecked = {};
      quotedLines.forEach(l => { initialChecked[l.id] = true; });
      setCheckedIds(initialChecked);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleChecked = (id) => {
    setCheckedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedIds = Object.keys(checkedIds).filter(id => checkedIds[id]);

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one part to mark as ordered.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await supabase.functions.invoke('autopro-processWorkOrderMarkQuotedOrdered', {
        body: {
          workOrderId,
          roNumber,
          lineItemIds: selectedIds
        }
      });

      if (response.error || response.data?.error) {
        setError(response.error?.message || response.data?.error || 'Failed to mark parts as ordered');
        setLoading(false);
        return;
      }

      onMarked(selectedIds);
      onClose();
    } catch (err) {
      console.error('Error marking parts as ordered:', err);
      setError(err.message || 'Failed to mark parts as ordered. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Mark Parts as Ordered
          </DialogTitle>
          <DialogDescription>
            Convert quoted parts to on-order once the quote has actually been placed.
          </DialogDescription>
        </DialogHeader>

        {quotedLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No quoted parts remain on this work order.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2">
            {quotedLines.map(line => (
              <div
                key={line.id}
                className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                onClick={() => toggleChecked(line.id)}
              >
                <Checkbox
                  checked={!!checkedIds[line.id]}
                  onCheckedChange={() => toggleChecked(line.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm dark:text-slate-100 truncate">
                    {line.part_number || '(no part #)'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{line.description}</div>
                </div>
                <div className="text-sm font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap">
                  Qty {line.qty_quoted}
                </div>
              </div>
            ))}
          </div>
        )}

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
          <Button type="button" onClick={handleSubmit} disabled={loading || quotedLines.length === 0}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Marking as Ordered...
              </>
            ) : (
              `Mark ${selectedIds.length} Part${selectedIds.length !== 1 ? 's' : ''} as Ordered`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
