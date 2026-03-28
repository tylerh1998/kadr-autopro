import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Search, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { InventoryItem, InventoryReturn, Supplier } from '@/entities/all';
import { searchInventory } from '@/functions/searchInventory';

// Helper function to safely parse and format dates
const safeFormatDate = (dateString, formatString = 'MM/dd/yyyy') => {
    if (!dateString || dateString === '') return 'N/A';
    try {
        const parsed = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        if (isNaN(parsed.getTime())) return 'N/A';
        return format(parsed, formatString);
    } catch (error) {
        console.error('Date parsing error:', error, dateString);
        return 'N/A';
    }
};

// Helper function to safely parse date for calendar component
const safeParseDateForCalendar = (dateString) => {
    if (!dateString || dateString === '') return undefined;
    try {
        const parsed = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        if (isNaN(parsed.getTime())) return undefined;
        return parsed;
    } catch (error) {
        return undefined;
    }
};

// Helper function to format date for input field (MM/DD/YYYY)
const formatDateForInput = (dateString) => {
    if (!dateString || dateString === '') return '';
    try {
        const parsed = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        if (isNaN(parsed.getTime())) return '';
        return format(parsed, 'MM/dd/yyyy');
    } catch (error) {
        return '';
    }
};

// Helper function to parse and validate date input with autofill
const parseAndValidateDateInput = (inputDate) => {
    if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
    
    const trimmed = inputDate.trim();
    let month, day, year;
    
    try {
        const parts = trimmed.split('/');
        
        if (parts.length === 2) {
            // MM/DD format - autofill current year
            month = parts[0];
            day = parts[1];
            year = new Date().getFullYear().toString();
        } else if (parts.length === 3) {
            // MM/DD/YY or MM/DD/YYYY format
            month = parts[0];
            day = parts[1];
            year = parts[2];
            
            // Convert 2-digit year to 4-digit
            if (year.length === 2) {
                const currentYear = new Date().getFullYear();
                const currentCentury = Math.floor(currentYear / 100) * 100;
                const twoDigitYear = parseInt(year);
                year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
            }
        } else {
            return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
        }
        
        // Pad month and day
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
        
        // Validate numeric values
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
            return { valid: false, date: null, error: 'Date must contain valid numbers' };
        }
        
        if (monthNum < 1 || monthNum > 12) {
            return { valid: false, date: null, error: 'Month must be between 1 and 12' };
        }
        
        if (dayNum < 1 || dayNum > 31) {
            return { valid: false, date: null, error: 'Day must be between 1 and 31' };
        }
        
        if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) { 
            return { valid: false, date: null, error: 'Year must be a valid 4-digit year (1900-2100)' };
        }
        
        // Create date and validate it's a real date
        const isoDate = `${year}-${month}-${day}`;
        const testDate = new Date(isoDate + 'T00:00:00'); 
        
        if (isNaN(testDate.getTime())) {
            return { valid: false, date: null, error: 'Invalid date' };
        }
        
        // Verify the date components match
        if (testDate.getFullYear() !== yearNum || 
            testDate.getMonth() + 1 !== monthNum || 
            testDate.getDate() !== dayNum) {
            return { valid: false, date: null, error: 'Invalid date' };
        }
        
        return { valid: true, date: isoDate, error: null };
    } catch (error) {
        return { valid: false, date: null, error: 'Error parsing date' };
    }
};

export default function LankarImportReturnModal({ open, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    part_number: '',
    description: '',
    quantity_returned: '',
    cost_per_unit: '',
    core_cost: '',
    supplier_id: '',
    return_date: format(new Date(), 'yyyy-MM-dd'),
    sent_back: '', // Optional date sent back
    return_reason: 'Parts Only',
    return_type: 'warranty', // Default to warranty
    lankar_wo: '',
    supplier_inv: '',
    additional_notes: '',
  });

  const [searchResults, setSearchResults] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [existingPart, setExistingPart] = useState(null);
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const [searchingParts, setSearchingParts] = useState(false);

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
      core_cost: '',
      supplier_id: '',
      return_date: format(new Date(), 'yyyy-MM-dd'),
      sent_back: '',
      return_reason: 'Parts Only',
      return_type: 'warranty',
      lankar_wo: '',
      supplier_inv: '',
      additional_notes: '',
    });
    setExistingPart(null);
    setSearchResults([]);
  };

  const loadData = async () => {
    try {
      const suppliersData = await Supplier.filter({ inventory_supplier: true }, 'name');
      setSuppliers(suppliersData);
      setSearchResults([]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const runPartSearch = async (value) => {
    const searchValue = value.trim();

    if (!searchValue) {
      setSearchResults([]);
      return;
    }

    setSearchingParts(true);
    try {
      const response = await searchInventory({
        searchTerm: searchValue,
        limit: 50,
        offset: 0,
      });
      setSearchResults(response.data?.records || []);
    } catch (error) {
      console.error('Error searching inventory:', error);
      setSearchResults([]);
    } finally {
      setSearchingParts(false);
    }
  };

  const handlePartNumberChange = async (value) => {
    setFormData(prev => ({ ...prev, part_number: value }));

    const found = searchResults.find(item => item.part_number === value);
    if (found) {
      setExistingPart(found);
      setFormData(prev => ({
        ...prev,
        part_number: value,
        description: found.description || '',
        cost_per_unit: found.cost != null ? Number(found.cost).toFixed(2) : '',
        core_cost: found.core_cost != null ? Number(found.core_cost).toFixed(2) : '',
        supplier_id: found.supplier_id || '',
      }));
      return;
    }

    setExistingPart(null);
    setFormData(prev => ({
      ...prev,
      part_number: value,
      description: '',
      cost_per_unit: '',
      core_cost: '',
    }));

    await runPartSearch(value);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDateBlur = (field, value) => {
    if (!value || value.trim() === '') {
        // If optional field (sent_back), allow empty
        if (field === 'sent_back') {
             setFormData(prev => ({ ...prev, [field]: '' }));
             return;
        }
        // If required (return_date), keep as is or revert to default? 
        // For now, if invalid/empty, validation will catch it or user sees error
        return;
    }

    const parseResult = parseAndValidateDateInput(value);
    if (parseResult.valid) {
        setFormData(prev => ({ ...prev, [field]: parseResult.date }));
    } else {
        alert(parseResult.error);
    }
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
    
    // Check costs based on return type
    const hasCost = (formData.cost_per_unit && parseFloat(formData.cost_per_unit) > 0);
    const hasCore = (formData.core_cost && parseFloat(formData.core_cost) > 0);
    
    if (formData.return_type === 'warranty') {
      if (!hasCost) {
        alert('Original Cost is required for Warranty returns.');
        return false;
      }
    } else if (formData.return_type === 'core') {
      if (!hasCore) {
        alert('Core Cost is required for Core returns.');
        return false;
      }
    } else if (formData.return_type === 'return') {
       if (!hasCost) {
        alert('Original Cost is required for returns.');
        return false;
      }
    }

    if (!formData.supplier_id) {
      alert('Supplier is required.');
      return false;
    }
    if (!formData.return_reason) {
      alert('Return Reason is required.');
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
        console.log('Creating new inventory item for LANKAR return');
        const newInventoryItem = await InventoryItem.create({
          part_number: formData.part_number,
          description: formData.description,
          cost: formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : 0,
          core_cost: formData.core_cost ? parseFloat(formData.core_cost) : 0,
          selling_price: formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : 0, // Default to cost
          profit_margin: 0,
          quantity_on_hand: 0,
          quantity_on_order: 0,
          supplier_id: formData.supplier_id,
          stocked_item: false,
          is_active: true,
        });
        inventoryItemId = newInventoryItem.id;
        console.log('Created new inventory item:', newInventoryItem);
      } else {
          // Update existing part with core cost if provided
          if (formData.core_cost) {
              await InventoryItem.update(existingPart.id, { 
                  core_cost: parseFloat(formData.core_cost) 
              });
          }
      }

      // Build the notes field
      const notesParts = [];
      if (formData.lankar_wo) notesParts.push(`LANKAR WO#: ${formData.lankar_wo}`);
      if (formData.supplier_inv) notesParts.push(`Supplier Inv#: ${formData.supplier_inv}`);
      if (formData.additional_notes) notesParts.push(formData.additional_notes);
      
      const notesText = notesParts.join(' - ');

      // Calculate total return value per part based on return type
      let unitReturnValue = 0;
      const originalCost = formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : 0;
      const coreCost = formData.core_cost ? parseFloat(formData.core_cost) : 0;

      if (formData.return_type === 'warranty') {
        unitReturnValue = originalCost;
      } else if (formData.return_type === 'core') {
        unitReturnValue = coreCost;
      } else if (formData.return_type === 'return') {
        unitReturnValue = originalCost + coreCost;
      } else {
        unitReturnValue = originalCost;
      }

      const totalCost = unitReturnValue * parseFloat(formData.quantity_returned);
      // We still store cost_per_unit as original cost in DB for reference
      const cost = originalCost;

      // Determine status and sent_back date
      let status = 'On-site';
      let sentBackDate = 'N/A';
      
      if (formData.sent_back) {
          status = 'Returned';
          sentBackDate = formData.sent_back; // Assuming it is already a valid ISO string from our date handler
      }

      // Create the InventoryReturn record
      const returnData = {
        inventory_item_id: inventoryItemId,
        part_number: formData.part_number,
        description: formData.description,
        quantity_returned: parseFloat(formData.quantity_returned),
        cost_per_unit: cost,
        total_cost: totalCost,
        supplier: formData.supplier_id,
        return_date: typeof formData.return_date === 'string' ? formData.return_date : format(formData.return_date, 'yyyy-MM-dd'),
        return_type: formData.return_type,
        return_reason: formData.return_reason,
        status: status,
        sent_back: sentBackDate,
        notes: notesText,
      };

      console.log('Creating LANKAR return:', returnData);
      await InventoryReturn.create(returnData);

      alert('LANKAR return added successfully!');
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error('Error creating LANKAR return:', error);
      alert(`Failed to create return: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">LANKAR Return Import</DialogTitle>
          <p className="text-sm text-slate-600 mt-1">
            Add a return from the legacy LANKAR system
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="part_number">Part # (Search or Create New) *</Label>
              <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                  <PopoverTrigger asChild>
                      <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                          <Input
                              id="part_number"
                              placeholder="Search or type part #..."
                              value={formData.part_number}
                              onChange={(e) => {
                                  const upperValue = e.target.value.toUpperCase();
                                  handlePartNumberChange(upperValue);
                                  setPartSearchOpen(true);
                              }}
                              onFocus={() => {
                                  setPartSearchOpen(true);
                                  if (formData.part_number.trim()) {
                                    runPartSearch(formData.part_number);
                                  }
                              }}
                              className="pl-8 uppercase"
                              required
                              autoComplete="off"
                          />
                      </div>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[400px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <div className="max-h-[300px] overflow-y-auto p-1 bg-white">
                          {searchingParts ? (
                              <div className="py-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Searching parts...
                              </div>
                          ) : searchResults.length === 0 ? (
                              <div className="py-6 text-center text-sm text-slate-500">
                                  No existing parts found.
                                  <br />
                                  Continue typing to create new.
                              </div>
                          ) : (
                              <div className="space-y-1">
                                  {searchResults.map((item) => (
                                      <div
                                          key={item.id}
                                          onClick={() => {
                                              handlePartNumberChange(item.part_number);
                                              setPartSearchOpen(false);
                                          }}
                                          className="flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-slate-100 cursor-pointer border-b border-slate-50 last:border-0"
                                      >
                                          <div className="flex flex-col">
                                              <span className="font-medium text-slate-900">{item.part_number}</span>
                                              <span className="text-xs text-slate-500">{item.description}</span>
                                          </div>
                                          {item.part_number === formData.part_number && (
                                              <Check className="h-4 w-4 text-green-600" />
                                          )}
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  </PopoverContent>
              </Popover>
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
                onChange={(e) => handleInputChange('description', e.target.value.replace(/\b\w/g, l => l.toUpperCase()))}
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cost_per_unit">Original Cost</Label>
                  <Input
                    id="cost_per_unit"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.cost_per_unit}
                    onChange={(e) => handleInputChange('cost_per_unit', e.target.value)}
                    placeholder="At least one cost required"
                  />
                </div>
                <div>
                  <Label htmlFor="core_cost">Core Cost</Label>
                  <Input
                    id="core_cost"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.core_cost}
                    onChange={(e) => handleInputChange('core_cost', e.target.value)}
                    placeholder="At least one cost required"
                  />
                </div>
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="return_date">Return Date *</Label>
                  <div className="flex items-center gap-1">
                      <Input
                          id="return_date"
                          type="text"
                          value={formData.return_date && formData.return_date.length === 10 && formData.return_date.includes('-') ? formatDateForInput(formData.return_date) : formData.return_date || ''}
                          onChange={(e) => handleInputChange('return_date', e.target.value)}
                          onBlur={(e) => handleDateBlur('return_date', e.target.value)}
                          placeholder="MM/DD/YYYY"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={safeParseDateForCalendar(formData.return_date)}
                            onSelect={(date) => {
                                if (date) {
                                    handleInputChange('return_date', format(date, 'yyyy-MM-dd'));
                                }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                  </div>
                </div>
                <div>
                  <Label htmlFor="sent_back">Date Sent Back (Optional)</Label>
                  <div className="flex items-center gap-1">
                      <Input
                          id="sent_back"
                          type="text"
                          value={formData.sent_back && formData.sent_back.length === 10 && formData.sent_back.includes('-') ? formatDateForInput(formData.sent_back) : formData.sent_back || ''}
                          onChange={(e) => handleInputChange('sent_back', e.target.value)}
                          onBlur={(e) => handleDateBlur('sent_back', e.target.value)}
                          placeholder="MM/DD/YYYY"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={safeParseDateForCalendar(formData.sent_back)}
                            onSelect={(date) => {
                                if (date) {
                                    handleInputChange('sent_back', format(date, 'yyyy-MM-dd'));
                                }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                  </div>
                </div>
            </div>

            <div>
              <Label htmlFor="return_type">Return Type *</Label>
              <Select
                value={formData.return_type}
                onValueChange={(value) => handleInputChange('return_type', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select return type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warranty">Warranty</SelectItem>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="Core Return">Core Return</SelectItem>
                  <SelectItem value="Incorrect Part">Incorrect Part</SelectItem>
                  <SelectItem value="Defective">Defective</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div>
                  <Label htmlFor="lankar_wo">LANKAR WO#</Label>
                  <Input
                    id="lankar_wo"
                    value={formData.lankar_wo}
                    onChange={(e) => handleInputChange('lankar_wo', e.target.value)}
                    placeholder="e.g., WO-12345"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier_inv">Supplier Inv#</Label>
                  <Input
                    id="supplier_inv"
                    value={formData.supplier_inv}
                    onChange={(e) => handleInputChange('supplier_inv', e.target.value)}
                    placeholder="e.g., INV-98765"
                  />
                </div>
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

          {formData.quantity_returned && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Total Return Value:</span>
                <span className="text-lg font-bold text-slate-900">
                  ${(() => {
                    const qty = parseFloat(formData.quantity_returned) || 0;
                    const originalCost = parseFloat(formData.cost_per_unit) || 0;
                    const coreCost = parseFloat(formData.core_cost) || 0;
                    let unitVal = 0;
                    if (formData.return_type === 'warranty') unitVal = originalCost;
                    else if (formData.return_type === 'core') unitVal = coreCost;
                    else if (formData.return_type === 'return') unitVal = originalCost + coreCost;
                    else unitVal = originalCost; // Fallback
                    
                    return (qty * unitVal).toFixed(2);
                  })()}
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