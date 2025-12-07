import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Supplier, InventoryReturn } from "@/entities/all";

export default function ChangeSupplierModal({ open, onClose, returnItem, onSupplierChange }) {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [currentSupplierName, setCurrentSupplierName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadSuppliers();
      setSelectedSupplier('');
    }
  }, [open]);

  useEffect(() => {
    // Resolve current supplier name when suppliers load or returnItem changes
    if (returnItem?.supplier && suppliers.length > 0) {
      const supplier = suppliers.find(s => s.id === returnItem.supplier);
      setCurrentSupplierName(supplier ? supplier.name : returnItem.supplier);
    }
  }, [returnItem, suppliers]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const suppliersData = await Supplier.list();
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSupplier || !returnItem) return;

    setSaving(true);
    try {
      await InventoryReturn.update(returnItem.id, { supplier: selectedSupplier });
      onSupplierChange();
    } catch (error) {
      console.error('Error updating supplier:', error);
      alert('Failed to update supplier.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Supplier</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Supplier:</label>
            <p className="text-sm text-gray-600">{currentSupplierName || 'None'}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">New Supplier:</label>
            <Select 
              value={selectedSupplier} 
              onValueChange={setSelectedSupplier}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier..." />
              </SelectTrigger>
              <SelectContent>
              {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedSupplier || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}