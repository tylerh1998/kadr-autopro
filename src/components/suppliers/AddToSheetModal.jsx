import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AddToSheetModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  
  const [formData, setFormData] = useState({
    supplierName: '',
    amount: '',
    dueDate: ''
  });

  useEffect(() => {
    if (open) {
      loadSuppliers();
      setFormData({ supplierName: '', amount: '', dueDate: '' });
    }
  }, [open]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const result = await base44.entities.Supplier.list({
          sort: { name: 1 },
          limit: 1000
      });
      setSuppliers(result || []);
    } catch (error) {
      console.error("Failed to load suppliers", error);
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplierName || !formData.amount || !formData.dueDate) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke('addToGoogleSheet', {
        supplierName: formData.supplierName,
        amount: parseFloat(formData.amount),
        dueDate: formData.dueDate
      });

      if (response.data?.success) {
        toast.success("Successfully added to Google Sheet");
        onClose();
      } else {
        throw new Error(response.data?.error || "Unknown error");
      }
    } catch (error) {
      console.error("Failed to add to sheet", error);
      toast.error(`Failed to add: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to SCU Payment Sheet</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Select 
              value={formData.supplierName} 
              onValueChange={(val) => setFormData(prev => ({ ...prev, supplierName: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map(supplier => (
                  <SelectItem key={supplier.id} value={supplier.name}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              Add to Sheet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}