import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X, ChevronRight, Loader2 } from "lucide-react";

export default function InventoryAdjustQOHModal({ open, onClose, item, onUpdate }) {
  const [newQOH, setNewQOH] = useState("");
  const [notes, setNotes] = useState("");
  const [systemIssue, setSystemIssue] = useState(false);
  const [nextPartNumber, setNextPartNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const newQOHInputRef = useRef(null);

  useEffect(() => {
    if (open && item) {
      setNewQOH(item.quantity_on_hand?.toString() || "0");
      setNotes("");
      setSystemIssue(false);
      setNextPartNumber("");
      
      // Focus and select the input field
      // Using setTimeout to ensure the dialog is fully rendered and the input is available for focus
      setTimeout(() => {
        if (newQOHInputRef.current) {
          newQOHInputRef.current.focus();
          newQOHInputRef.current.select();
        }
      }, 100);
    }
  }, [open, item]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newQOH || isNaN(parseFloat(newQOH))) {
      alert('Please enter a valid new QOH amount.');
      return;
    }
    
    setLoading(true);
    try {
      const targetQOH = parseFloat(newQOH);
      
      const response = await supabase.functions.invoke('autopro-processQOHAdjustment', {
        body: {
          inventory_item_id: item.id,
          new_quantity_on_hand: targetQOH,
          notes: notes || '',
          system_issue: systemIssue
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to process QOH adjustment');
      }
      
      onUpdate();
      
      // Reset form
      setNewQOH("");
      setNotes("");
      setSystemIssue(false);
      
      alert(`QOH updated successfully! New quantity: ${targetQOH}`);
      onClose();
      
    } catch (error) {
      console.error('Error updating QOH:', error);
      alert('Failed to update QOH. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndNext = async (e) => {
    e.preventDefault();
    
    if (!newQOH || isNaN(parseFloat(newQOH))) {
      alert('Please enter a valid new QOH amount.');
      return;
    }
    
    setLoading(true);
    try {
      const targetQOH = parseFloat(newQOH);
      
      const response = await supabase.functions.invoke('autopro-processQOHAdjustment', {
        body: {
          inventory_item_id: item.id,
          new_quantity_on_hand: targetQOH,
          notes: notes || '',
          system_issue: systemIssue
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to process QOH adjustment');
      }
      
      onUpdate(nextPartNumber);
      
      // Reset form but keep modal open
      setNewQOH("");
      setNotes("");
      setSystemIssue(false);
      setNextPartNumber("");
      
      alert(`QOH updated for ${item.part_number}! New quantity: ${targetQOH}\n\nEnter the next part number to continue.`);
      
      // Re-focus and select for the next item
      setTimeout(() => {
        if (newQOHInputRef.current) {
          newQOHInputRef.current.focus();
          newQOHInputRef.current.select();
        }
      }, 100);
      
    } catch (error) {
      console.error('Error updating QOH:', error);
      alert('Failed to update QOH. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentQOH = item?.quantity_on_hand || 0;
  const targetQOH = parseFloat(newQOH) || 0;
  const difference = targetQOH - currentQOH;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between dark:text-slate-100">
            Adjust QOH - {item?.part_number}
            <Button variant="ghost" size="icon" onClick={onClose} className="dark:text-slate-400 dark:hover:text-slate-100">
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        {item && (
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">{item.part_number}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Current QOH: <span className="font-bold">{currentQOH}</span></p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new_qoh" className="dark:text-slate-300">New QOH</Label>
                <Input
                  ref={newQOHInputRef}
                  id="new_qoh"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newQOH}
                  onChange={(e) => setNewQOH(e.target.value)}
                  placeholder="Enter new quantity on hand"
                  className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  required
                  disabled={loading}
                />
              </div>

              {newQOH && difference !== 0 && (
                <div className={`p-3 rounded-lg border ${difference > 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-slate-800 dark:text-slate-200' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-slate-800 dark:text-slate-200'}`}>
                  <p className="text-sm">
                    <span className="font-medium">Change:</span> {currentQOH} → {targetQOH} 
                    <span className={difference > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      ({difference > 0 ? '+' : ''}{difference})
                    </span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes" className="dark:text-slate-300">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for adjustment..."
                  rows={2}
                  className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  disabled={loading}
                />
              </div>

              <div className="flex items-center space-x-2 rounded-lg border dark:border-slate-800 p-3">
                <Checkbox
                  id="system_issue"
                  checked={systemIssue}
                  onCheckedChange={(checked) => setSystemIssue(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="system_issue" className="cursor-pointer dark:text-slate-300">Adjustment Due to System Issue</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_part" className="dark:text-slate-300">Next Part # (Optional)</Label>
                <Input
                  id="next_part"
                  value={nextPartNumber}
                  onChange={(e) => setNextPartNumber(e.target.value)}
                  placeholder="Enter next part number for rapid entry"
                  className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800" disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 flex-1 dark:bg-blue-700 dark:hover:bg-blue-800 text-white" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {loading ? 'Updating...' : 'Update'}
                </Button>
                {nextPartNumber && (
                  <Button type="button" onClick={handleSaveAndNext} className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}