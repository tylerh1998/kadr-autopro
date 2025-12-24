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
import { getMountainTimeNow, toMountainTime } from '@/components/utils/mountainTimeUtils';

export default function EditReturnInfoModal({ open, onClose, returnItem, onUpdate }) {
  const [formData, setFormData] = useState({
    return_reason: '',
    notes: '',
    return_date: '',
    sent_back: ''
  });
  const [returnReasons, setReturnReasons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && returnItem) {
      setFormData({
        return_reason: returnItem.return_reason || '',
        notes: returnItem.notes || '',
        return_date: returnItem.return_date || (returnItem.date_returned ? format(toMountainTime(returnItem.date_returned), 'yyyy-MM-dd') : format(getMountainTimeNow(), 'yyyy-MM-dd')),
        sent_back: returnItem.sent_back === 'N/A' ? '' : (returnItem.sent_back || '')
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

    if (!formData.return_reason) {
      alert('Please select a return reason.');
      setLoading(false);
      return;
    }

    try {
      const updateData = {
        return_reason: formData.return_reason,
        notes: formData.notes,
        return_date: formData.return_date,
        sent_back: formData.sent_back || 'N/A'
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

            </div>

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

            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="sent-back">Sent Back Date</Label>
                <Input 
                  id="sent-back"
                  type="date" 
                  value={formData.sent_back} 
                  onChange={e => handleChange('sent_back', e.target.value)} 
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