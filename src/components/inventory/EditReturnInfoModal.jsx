import React, { useState, useEffect } from 'react';
import { InventoryReturn, ReturnReason } from '@/entities/all';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Pencil, X, Save } from 'lucide-react';
import { format } from 'date-fns';

export default function EditReturnInfoModal({ open, onClose, returnItem, onUpdate }) {
  const [formData, setFormData] = useState({
    return_type: '',
    quantity_returned: '',
    return_reason: '',
    notes: '',
    return_date: ''
  });
  const [returnReasons, setReturnReasons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && returnItem) {
      setFormData({
        return_type: returnItem.return_type || '',
        quantity_returned: returnItem.quantity_returned?.toString() || '',
        return_reason: returnItem.return_reason || '',
        notes: returnItem.notes || '',
        return_date: returnItem.return_date || format(new Date(), 'yyyy-MM-dd')
      });
      loadReturnReasons();
    }
  }, [open, returnItem]);

  const loadReturnReasons = async () => {
    try {
      const reasons = await ReturnReason.list();
      setReturnReasons(reasons.filter(r => r.is_active));
    } catch (error) {
      console.error('Error loading return reasons:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.quantity_returned || !formData.return_reason || !formData.return_type) {
      alert('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    const qtyReturned = parseFloat(formData.quantity_returned);
    if (qtyReturned <= 0) {
      alert('Quantity must be greater than 0.');
      setLoading(false);
      return;
    }

    try {
      const updateData = {
        return_type: formData.return_type,
        quantity_returned: qtyReturned,
        return_reason: formData.return_reason,
        notes: formData.notes,
        return_date: formData.return_date,
        // Recalculate total cost based on new quantity
        total_cost: qtyReturned * (returnItem.cost_per_unit || 0)
      };

      await InventoryReturn.update(returnItem.id, updateData);
      
      alert('Return information updated successfully!');
      onUpdate();
    } catch (error) {
      console.error('Error updating return info:', error);
      alert('Failed to update return information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const returnTypes = ['core', 'return', 'warranty'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Return Information
            </span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {returnItem && (
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-900">{returnItem.part_number}</h4>
              <p className="text-sm text-slate-600">{returnItem.description}</p>
              <p className="text-sm text-slate-500 mt-1">
                Supplier: <span className="font-bold">{returnItem.supplier}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="return-type">Return Type *</Label>
                <Select value={formData.return_type} onValueChange={val => handleChange('return_type', val)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {returnTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity Returned *</Label>
                <Input 
                  id="quantity"
                  type="number" 
                  min="0.01"
                  step="0.01"
                  value={formData.quantity_returned} 
                  onChange={e => handleChange('quantity_returned', e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="return-reason">Return Reason *</Label>
                <Select value={formData.return_reason} onValueChange={val => handleChange('return_reason', val)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {returnReasons.map(reason => (
                      <SelectItem key={reason.id} value={reason.reason}>
                        {reason.reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="return-date">Return Date *</Label>
                <Input 
                  id="return-date"
                  type="date" 
                  value={formData.return_date} 
                  onChange={e => handleChange('return_date', e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes"
                value={formData.notes} 
                onChange={e => handleChange('notes', e.target.value)} 
                placeholder="Additional notes about the return..."
                rows={3}
              />
            </div>

            {/* Cost Summary */}
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-slate-900">Updated Cost Summary</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Cost per unit:</span>
                  <span className="font-medium">${(returnItem.cost_per_unit || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>New quantity:</span>
                  <span className="font-medium">{parseFloat(formData.quantity_returned) || 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>New total:</span>
                  <span>${((parseFloat(formData.quantity_returned) || 0) * (returnItem.cost_per_unit || 0)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}