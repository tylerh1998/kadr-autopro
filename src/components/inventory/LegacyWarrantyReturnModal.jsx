import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { InventoryItem, InventoryReturn, Supplier } from '@/entities/all';

export default function LegacyWarrantyReturnModal({ open, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    part_number: '',
    description: '',
    quantity_returned: '',
    cost_per_unit: '',
    supplier_id: '',
    return_date: new Date(),
    return_reason: 'Parts Only',
    lankar_wo: '',
    additional_notes: '',
  });

  const [inventoryItems, setInventoryItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [existingPart, setExistingPart] = useState(null);

  useEffect(() => {
    if (open) {
      loadData();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFormData({
      part_number: '',
      description: '',
      quantity_returned: '',
      cost_per_unit: '',
      supplier_id: '',
      return_date: new Date(),
      return_reason: 'Parts Only',
      lankar_wo: '',
      additional_notes: '',
    });
    setExistingPart(null);
  };

  const loadData = async () => {
    try {
      const [itemsData, suppliersData] = await Promise.all([
        InventoryItem.list(),
        Supplier.filter({ inventory_supplier: true }, 'name')
      ]);
      setInventoryItems(itemsData);
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handlePartNumberChange = (value) => {
    setFormData(prev => ({ ...prev, part_number: value }));
    
    // Check if this part exists in inventory
    const found = inventoryItems.find(item => item.part_number === value);
    if (found) {
      setExistingPart(found);
      setFormData(prev => ({
        ...prev,
        description: found.description || '',
        cost_per_unit: (found.cost || 0).toFixed(2),
        supplier_id: found.supplier_id || '',
      }));
    } else {
      setExistingPart(null);
      // Clear fields if it's a new part
      setFormData(prev => ({
        ...prev,
        description: '',
        cost_per_unit: '',
      }));
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.part_number.trim()) {
      alert('Part Number is required.');
      return false;
    }
    if (!formData.description.trim()) {
      alert('Description is required.');
      return false;
    }
    if (!formData.quantity_returned || parseFloat(formData.quantity_returned) <= 0) {
      alert('Quantity Returned must be greater than 0.');
      return false;
    }
    if (!formData.cost_per_unit || parseFloat(formData.cost_per_unit) <= 0) {
      alert('Original Cost must be greater than 0.');
      return false;
    }
    if (!formData.supplier_id) {
      alert('Supplier is required.');
      return false;
    }
    if (!formData.return_reason) {
      alert('Return Reason is required.');
      return false;
    }
    if (!formData.lankar_wo.trim()) {
      alert('LANKAR WO# is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      let inventoryItemId = existingPart?.id;

      // If the part doesn't exist, create it
      if (!existingPart) {
        console.log('Creating new inventory item for LANKAR warranty return');
        const newInventoryItem = await InventoryItem.create({
          part_number: formData.part_number,
          description: formData.description,
          cost: parseFloat(formData.cost_per_unit),
          selling_price: parseFloat(formData.cost_per_unit), // Default to cost
          profit_margin: 0,
          quantity_on_hand: 0,
          quantity_on_order: 0,
          supplier_id: formData.supplier_id,
          stocked_item: false,
          is_active: true,
        });
        inventoryItemId = newInventoryItem.id;
        console.log('Created new inventory item:', newInventoryItem);
      }

      // Build the notes field
      const notesText = `LANKAR WO#: ${formData.lankar_wo}${formData.additional_notes ? ' - ' + formData.additional_notes : ''}`;

      // Calculate total cost
      const totalCost = parseFloat(formData.cost_per_unit) * parseFloat(formData.quantity_returned);

      // Create the InventoryReturn record
      const returnData = {
        inventory_item_id: inventoryItemId,
        part_number: formData.part_number,
        description: formData.description,
        quantity_returned: parseFloat(formData.quantity_returned),
        cost_per_unit: parseFloat(formData.cost_per_unit),
        total_cost: totalCost,
        supplier: formData.supplier_id,
        return_date: format(formData.return_date, 'yyyy-MM-dd'),
        return_type: 'warranty',
        return_reason: formData.return_reason,
        status: 'On-site',
        notes: notesText,
      };

      console.log('Creating LANKAR warranty return:', returnData);
      await InventoryReturn.create(returnData);

      alert('LANKAR warranty return added successfully!');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error creating LANKAR warranty return:', error);
      alert(`Failed to create return: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">LANKAR Warranty Return</DialogTitle>
          <p className="text-sm text-slate-600 mt-1">
            Add a warranty return from the legacy LANKAR system
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="part_number">Part # *</Label>
              <Input
                id="part_number"
                placeholder="Search or enter new part number..."
                list="lankar-parts-list"
                value={formData.part_number}
                onChange={(e) => handlePartNumberChange(e.target.value)}
                required
              />
              <datalist id="lankar-parts-list">
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.part_number}>
                    {item.description}
                  </option>
                ))}
              </datalist>
              {existingPart && (
                <p className="text-xs text-green-600 mt-1">✓ Existing part found - data pre-filled</p>
              )}
              {formData.part_number && !existingPart && (
                <p className="text-xs text-blue-600 mt-1">New part - will be added to inventory</p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="quantity_returned">Quantity Returned *</Label>
              <Input
                id="quantity_returned"
                type="number"
                step="1"
                min="1"
                value={formData.quantity_returned}
                onChange={(e) => handleInputChange('quantity_returned', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="cost_per_unit">Original Cost *</Label>
              <Input
                id="cost_per_unit"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => handleInputChange('cost_per_unit', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="supplier_id">Supplier *</Label>
              <Select
                value={formData.supplier_id}
                onValueChange={(value) => handleInputChange('supplier_id', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="return_date">Return Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.return_date ? format(formData.return_date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.return_date}
                    onSelect={(date) => handleInputChange('return_date', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="return_reason">Return Reason *</Label>
              <Select
                value={formData.return_reason}
                onValueChange={(value) => handleInputChange('return_reason', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Parts Only">Parts Only</SelectItem>
                  <SelectItem value="Parts & Labour">Parts & Labour</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="lankar_wo">LANKAR WO# *</Label>
              <Input
                id="lankar_wo"
                value={formData.lankar_wo}
                onChange={(e) => handleInputChange('lankar_wo', e.target.value)}
                placeholder="e.g., WO-12345"
                required
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="additional_notes">Additional Notes (Optional)</Label>
              <Textarea
                id="additional_notes"
                value={formData.additional_notes}
                onChange={(e) => handleInputChange('additional_notes', e.target.value)}
                placeholder="Any additional details about this return..."
                rows={3}
              />
            </div>
          </div>

          {formData.quantity_returned && formData.cost_per_unit && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Total Return Value:</span>
                <span className="text-lg font-bold text-slate-900">
                  ${(parseFloat(formData.quantity_returned) * parseFloat(formData.cost_per_unit)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Add LANKAR Return'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}