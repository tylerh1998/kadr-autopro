import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AddToSheetModal({ open, onClose, initialValues, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    supplierName: '',
    amount: '',
    dueDate: ''
  });

  useEffect(() => {
    if (open) {
      if (initialValues) {
        setFormData({
          supplierName: initialValues.supplierName || '',
          amount: initialValues.amount || '',
          dueDate: initialValues.dueDate || ''
        });
      } else {
        setFormData({ supplierName: '', amount: '', dueDate: '' });
      }
    }
  }, [open, initialValues]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplierName || !formData.amount || !formData.dueDate) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      await base44.entities.CashFlowEntry.create({
        supplier: formData.supplierName,
        supplier_id: initialValues?.supplierId,
        amount: parseFloat(formData.amount),
        due_date: formData.dueDate,
        amount_paid: 0
      });

      toast.success("Successfully added to Cash Flow");
      onClose();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to add to cash flow", error);
      toast.error(`Failed to add: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to Cash Flow</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Input 
              id="supplier"
              value={formData.supplierName} 
              disabled 
              className="bg-slate-100 text-slate-500"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to Cash Flow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}