import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TagAlongForm({ tagAlong, otherCharges, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    other_charge_id: ''
  });

  useEffect(() => {
    if (tagAlong) {
      setFormData({
        name: tagAlong.name || '',
        description: tagAlong.description || '',
        other_charge_id: tagAlong.other_charge_id || ''
      });
    } else {
      setFormData({
        name: '',
        description: '',
        other_charge_id: ''
      });
    }
  }, [tagAlong]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Please enter a name for the tag along');
      return;
    }
    
    if (!formData.description.trim()) {
      alert('Please enter a description');
      return;
    }
    
    if (!formData.other_charge_id) {
      alert('Please select a linked other charge');
      return;
    }
    
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., Enviro Fee, Tire Levy"
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Description *</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Description that will appear on work order line"
            required
          />
        </div>

        <div>
          <Label htmlFor="other_charge_id">Linked Other Charge *</Label>
          <Select
            value={formData.other_charge_id}
            onValueChange={(value) => handleChange('other_charge_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an other charge" />
            </SelectTrigger>
            <SelectContent>
              {otherCharges && otherCharges.length > 0 ? (
                otherCharges
                  .filter(charge => charge.is_active)
                  .map((charge) => (
                    <SelectItem key={charge.id} value={charge.id}>
                      {charge.description}
                    </SelectItem>
                  ))
              ) : (
                <SelectItem value="none" disabled>No other charges available</SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-sm text-slate-500 mt-1">
            The base amount, GL account, and linked supplier will be inherited from the selected other charge
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          {tagAlong ? 'Update Tag Along' : 'Create Tag Along'}
        </Button>
      </div>
    </form>
  );
}