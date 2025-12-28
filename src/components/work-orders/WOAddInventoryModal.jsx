import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, AlertCircle } from 'lucide-react';
import { InventoryItem, Supplier, SalesClass, InventoryTxs, TagAlong, OtherChargeList, InventoryCategory } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function WOAddInventoryModal({ open, onClose, onAdd, workOrder }) {
  const [formData, setFormData] = useState({
    part_number: '',
    description: '',
    unit: '',
    category: 'other',
    supplier_id: '',
    manufacturer: '',
    cost: '',
    selling_price: '',
    sales_class: '',
    profit_margin: '',
    quantity_to_order: '1',
    minimum_quantity: '',
    maximum_quantity: '',
    location: '',
    core: false,
    core_cost: '',
    tag_along_id: '',
    stocked_item: true,
    is_active: true,
  });

  const [suppliers, setSuppliers] = useState([]);
  const [salesClasses, setSalesClasses] = useState([]);
  const [tagAlongs, setTagAlongs] = useState([]);
  const [otherCharges, setOtherCharges] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculatedMargin, setCalculatedMargin] = useState('');
  const [duplicatePartWarning, setDuplicatePartWarning] = useState(null);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [isCategorySuggested, setIsCategorySuggested] = useState(false);

  useEffect(() => {
    if (open) {
      loadDropdownData();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFormData({
      part_number: '',
      description: '',
      unit: '',
      category: '',
      supplier_id: '',
      manufacturer: '',
      cost: '',
      selling_price: '',
      sales_class: '',
      profit_margin: '',
      quantity_to_order: '',
      minimum_quantity: '',
      maximum_quantity: '',
      location: '',
      core: false,
      core_cost: '',
      tag_along_id: '',
      stocked_item: false,
      is_active: true,
    });
    setCalculatedMargin('');
    setDuplicatePartWarning(null);
    setIsCategorySuggested(false);
  };

  const loadDropdownData = async () => {
    try {
      const [suppliersData, salesClassesData, tagAlongsData, otherChargesData, categoriesData] = await Promise.all([
        Supplier.filter({ inventory_supplier: true }, 'name'),
        SalesClass.list(),
        TagAlong.list(),
        OtherChargeList.list(),
        InventoryCategory.list()
      ]);
      setSuppliers(suppliersData);
      setSalesClasses(salesClassesData);
      setTagAlongs(tagAlongsData);
      setOtherCharges(otherChargesData);
      setInventoryCategories(categoriesData);
    } catch (error) {
      console.error('Error loading dropdown data:', error);
    }
  };

  const calculatePriceFromSalesClass = useCallback((cost, salesClassId) => {
    if (!cost || !salesClassId || !salesClasses) return null;

    const selectedSalesClass = salesClasses.find(sc => sc.id === salesClassId);
    if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return null;

    try {
      const parsedData = JSON.parse(selectedSalesClass.pricing_matrix);
      if (!Array.isArray(parsedData)) {
        console.warn(`Pricing matrix for sales class "${selectedSalesClass.name}" is not a valid array.`, parsedData);
        return null;
      }
      const pricingRanges = parsedData;
      const costValue = parseFloat(cost);

      const matchingRange = pricingRanges.find(range => {
        const minCost = parseFloat(range.min_cost);
        const maxCost = parseFloat(range.max_cost);
        return costValue >= minCost && costValue <= maxCost;
      });

      if (matchingRange) {
        const margin = parseFloat(matchingRange.margin);
        const sellingPrice = costValue * (1 + margin / 100);
        return {
          sellingPrice: sellingPrice.toFixed(2),
          margin: margin.toFixed(2)
        };
      }
    } catch (error) {
      console.error('Error calculating price from sales class:', error);
    }

    return null;
  }, [salesClasses]);

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newFormData = { ...prev, [field]: value };

      if (field === 'part_number') {
        setDuplicatePartWarning(null);
      }
      
      if (field === 'category') {
        setIsCategorySuggested(false);
      }

      // Auto-calculate selling price and margin when cost or sales class changes
      if (field === 'cost' || field === 'sales_class') {
        const currentCost = field === 'cost' ? value : newFormData.cost;
        const currentSalesClass = field === 'sales_class' ? value : newFormData.sales_class;

        if (currentCost !== "" && currentSalesClass !== "") {
          const calculation = calculatePriceFromSalesClass(currentCost, currentSalesClass);

          if (calculation) {
            newFormData.selling_price = calculation.sellingPrice;
            newFormData.profit_margin = calculation.margin;
            setCalculatedMargin(calculation.margin);
          } else {
            // If no calculation is found, clear selling price and margin
            newFormData.selling_price = "";
            newFormData.profit_margin = "";
            setCalculatedMargin('');
          }
        } else {
          // If cost or sales class is empty, clear selling price and margin
          newFormData.selling_price = "";
          newFormData.profit_margin = "";
          setCalculatedMargin('');
        }
      } else if (field === 'selling_price') {
        // If selling price is manually changed, calculate margin based on it
        const cost = parseFloat(newFormData.cost) || 0;
        const sellingPrice = parseFloat(value) || 0;

        if (cost > 0 && sellingPrice > cost) {
          const margin = ((sellingPrice - cost) / sellingPrice) * 100;
          newFormData.profit_margin = margin.toFixed(2);
          setCalculatedMargin(margin.toFixed(2));
        } else if (cost === 0 && sellingPrice > 0) {
          newFormData.profit_margin = "100.00";
          setCalculatedMargin("100.00");
        } else {
          newFormData.profit_margin = "";
          setCalculatedMargin('');
        }
      }
      // If profit_margin is manually changed, calculate selling price based on it
      else if (field === 'profit_margin') {
        const cost = parseFloat(newFormData.cost) || 0;
        const margin = parseFloat(value) || 0;

        if (cost > 0 && margin >= 0 && margin < 100) {
          const sellingPrice = cost / (1 - margin / 100);
          newFormData.selling_price = sellingPrice.toFixed(2);
        } else if (cost === 0 && margin === 100) {
          newFormData.selling_price = "";
        } else {
          newFormData.selling_price = "";
        }
      }

      return newFormData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.part_number || !formData.description || !formData.cost || !formData.selling_price || !formData.sales_class) {
      alert('Part Number, Description, Cost, Selling Price, and Sales Class are required.');
      return;
    }

    if (!formData.supplier_id) {
      alert('Supplier is required.');
      return;
    }
    
    if (parseFloat(formData.cost) <= 0) {
      alert('Cost must be greater than 0.');
      return;
    }
    if (parseFloat(formData.selling_price) <= 0) {
      alert('Selling Price must be greater than 0.');
      return;
    }
    if (!formData.quantity_to_order || parseFloat(formData.quantity_to_order) <= 0) {
      alert('Qty Ordered is required and must be greater than 0.');
      return;
    }

    if (!workOrder || !workOrder.id || !workOrder.ro_number) {
      alert('Work order information is missing. Cannot process inventory transaction.');
      return;
    }

    setLoading(true);

    try {
      console.log('=== WOAddInventoryModal: Creating new inventory item with immediate ordering ===');

      const quantityToOrder = parseInt(formData.quantity_to_order, 10) || 1;

      // Step 1: Create the new InventoryItem with QOH = 0, QOO = quantity_to_order
      const newInventoryItemData = {
        part_number: formData.part_number,
        description: formData.description,
        unit: formData.unit || null,
        category: formData.category || null,
        supplier_id: formData.supplier_id || null,
        manufacturer: formData.manufacturer || null,
        sales_class: formData.sales_class || null,
        cost: parseFloat(formData.cost) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        profit_margin: parseFloat(formData.profit_margin) || 0,
        quantity_on_hand: 0,
        quantity_on_order: 0, // Set to 0 initially to prevent duplicate backend transactions
        minimum_quantity: formData.minimum_quantity ? parseInt(formData.minimum_quantity, 10) : 0,
        maximum_quantity: formData.maximum_quantity ? parseInt(formData.maximum_quantity, 10) : 0,
        location: formData.location || null,
        core: formData.core,
        core_cost: parseFloat(formData.core_cost) || 0,
        tag_along_id: formData.tag_along_id || null,
        stocked_item: formData.stocked_item,
        is_active: formData.is_active,
      };

      console.log('Creating new inventory item:', newInventoryItemData);
      const createdInventoryItem = await InventoryItem.create(newInventoryItemData);

      // Step 2: Create the InventoryTxs record for the order
      const inventoryTxData = {
        inventory_item_id: createdInventoryItem.id,
        part_num: createdInventoryItem.part_number,
        tx_date: new Date().toISOString(),
        tx_type: 'Ordered',
        quantity_change: 0,
        quantity_ordered_change: quantityToOrder,
        ro_number: workOrder.ro_number,
        source_record_id: workOrder.id,
        supplier_name: suppliers.find(s => s.id === formData.supplier_id)?.name || '',
        description: `Ordered new part for WO ${workOrder.ro_number}`
      };

      console.log('Creating inventory transaction:', inventoryTxData);
      await InventoryTxs.create(inventoryTxData);

      // Step 2.5: Update inventory item with correct quantity on order
      await InventoryItem.update(createdInventoryItem.id, {
        quantity_on_order: quantityToOrder
      });

      // Step 3: Create the line item object for the work order
      const coreNum = createdInventoryItem.core ? quantityToOrder : 0;
      const coreCost = parseFloat(formData.core_cost) || 0;
      // core_osamt is calculated automatically in LineItemsTable based on core_num and core_cost
      
      const newLineItem = {
        id: Date.now() + Math.random(), 
        qty: quantityToOrder,
        hrs: '',
        description: formData.description,
        part_number: formData.part_number,
        unit: formData.unit || '',
        parts_ea: parseFloat(formData.selling_price) || 0,
        tot_parts: quantityToOrder * (parseFloat(formData.selling_price) || 0),
        labour: 0,
        tx: 'Y',
        taxable: true,
        total: quantityToOrder * (parseFloat(formData.selling_price) || 0),
        complete: false,
        bold: false,
        qty_on_order: quantityToOrder,
        inventory_item_id: createdInventoryItem.id,
        // Inventory is fully processed (item created, QOO updated, Tx created) within this modal.
        // Mark as true to prevent DocumentEditor from triggering WOGetPart and creating a duplicate transaction.
        inventory_processed: true,
        cost_ea: parseFloat(formData.cost) || 0,
        Core_num: coreNum,
        core_ret: 0,
        core_cost: coreCost,
      };
      
      const itemsToAdd = [newLineItem];

      // Handle Tag Along
      if (formData.tag_along_id) {
        const tagAlong = tagAlongs.find(ta => ta.id === formData.tag_along_id);
        
        if (tagAlong && tagAlong.other_charge_id) {
          const otherCharge = otherCharges.find(oc => oc.id === tagAlong.other_charge_id);
          
          if (otherCharge) {
            const tagAlongTotal = (otherCharge.base_amount || 0) * quantityToOrder;
            
            const tagAlongLineItem = {
              id: Date.now() + Math.random() + 0.1,
              qty: quantityToOrder,
              hrs: 0,
              description: tagAlong.description || otherCharge.description,
              part_number: '',
              unit: '',
              parts_ea: 0,
              tot_parts: 0,
              labour: 0,
              oc_total: tagAlongTotal,
              total: tagAlongTotal,
              taxable: otherCharge.is_taxable !== undefined ? otherCharge.is_taxable : true,
              gl_account: otherCharge.gl_account || '',
              complete: false,
              bold: false,
              is_other_charge: true,
              other_charge_id: tagAlong.other_charge_id,
              inventory_item_id: null,
              cost_ea: 0,
              Core_num: 0,
              core_ret: 0,
              core_cost: 0,
              core_osamt: 0,
              inventory_processed: false,
              qty_on_order: 0,
              supplier_invoice_line_id: null,
              manually_inserted: false
            };

            itemsToAdd.push(tagAlongLineItem);
          }
        }
      }
      
      console.log('=== DEBUG: WOAddInventoryModal creating line items ===');
      console.log('Items to add:', itemsToAdd);

      console.log('=== WOAddInventoryModal: Inventory processing completed ===');

      onAdd(itemsToAdd);
      onClose();

    } catch (error) {
      console.error('Error creating inventory item and processing transaction:', error);
      alert(`Failed to add inventory item: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Smart Category Suggestion Logic
  useEffect(() => {
      const fetchSuggestion = async () => {
          if (formData.part_number && 
              formData.description && 
              !formData.category && 
              !suggestingCategory) {
              
              setSuggestingCategory(true);
              try {
                  const supplier = suppliers.find(s => s.id === formData.supplier_id);
                  const supplierName = supplier ? supplier.name : '';
                  
                  const response = await base44.functions.invoke('suggestInventoryCategory', {
                      part_number: formData.part_number,
                      description: formData.description,
                      supplier_name: supplierName
                  });
                  
                  if (response.data && response.data.category) {
                      setFormData(prev => {
                          if (!prev.category) {
                              setTimeout(() => setIsCategorySuggested(true), 0);
                              return { ...prev, category: response.data.category };
                          }
                          return prev;
                      });
                  }
              } catch (error) {
                  console.error("Error fetching category suggestion:", error);
              } finally {
                  setSuggestingCategory(false);
              }
          }
      };

      const timer = setTimeout(fetchSuggestion, 1000); // Debounce
      return () => clearTimeout(timer);
  }, [formData.part_number, formData.description, formData.category, formData.supplier_id, suppliers]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Inventory Item & Order for Work Order
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Supplier Row - Kept separate as it's required for creating the item but not in the batch image */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier_id">Supplier *</Label>
              <Select 
                value={formData.supplier_id} 
                onValueChange={(value) => handleInputChange("supplier_id", value === 'none' ? '' : value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {[...suppliers]
                    .sort((a, b) => {
                      if (a.pin_to_top && !b.pin_to_top) return -1;
                      if (!a.pin_to_top && b.pin_to_top) return 1;
                      return (a.name || '').localeCompare(b.name || '');
                    })
                    .map((supplier) => (
                    <SelectItem key={supplier.id} value={String(supplier.id)}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => handleInputChange("manufacturer", e.target.value)}
              />
            </div>
          </div>

          {/* Row 1: Part #, Description, Unit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="part_number">Part # (Create New) *</Label>
              <Input
                id="part_number"
                value={formData.part_number}
                onChange={async (e) => {
                  const newPartNumber = e.target.value.toUpperCase();
                  handleInputChange("part_number", newPartNumber);
                  if (newPartNumber.trim()) {
                    const existingPart = await InventoryItem.filter({ part_number: newPartNumber });
                    if (existingPart.length > 0) {
                      setDuplicatePartWarning(`Notice: A part with number '${newPartNumber}' already exists in inventory.`);
                    }
                  }
                }}
                required
                placeholder="TYPE PART #..."
              />
              {duplicatePartWarning && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">{duplicatePartWarning}</p>
                </div>
              )}
            </div>
            <div className="space-y-2 col-span-1 md:col-span-2 grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\b\w/g, l => l.toUpperCase());
                    handleInputChange("description", val);
                  }}
                  required
                />
              </div>
              <div className="space-y-2 col-span-1">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => handleInputChange("unit", e.target.value.slice(0, 5))}
                  placeholder="/ea"
                  maxLength={5}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Qty, Cost, Sales Class, Tag Along */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity_to_order">Qty Ordered *</Label>
              <Input
                id="quantity_to_order"
                type="number"
                min="1"
                value={formData.quantity_to_order}
                onChange={(e) => handleInputChange("quantity_to_order", e.target.value)}
                required
                placeholder="Enter Qty"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Part Cost *</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => handleInputChange("cost", e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sales_class">Sales Class *</Label>
              <Select
                value={formData.sales_class}
                onValueChange={(value) => handleInputChange('sales_class', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sales class..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {salesClasses && salesClasses.map(sc => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {sc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag_along_id">Tag Along (Optional)</Label>
              <Select 
                value={formData.tag_along_id || 'none'} 
                onValueChange={(val) => handleInputChange('tag_along_id', val === 'none' ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tagAlongs.map(tagAlong => (
                    <SelectItem key={tagAlong.id} value={tagAlong.id}>
                      {tagAlong.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: List Price, Margin, Core, Stocked */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="selling_price">List Price *</Label>
              <div className="relative">
                <Input
                  id="selling_price"
                  type="number"
                  step="0.01"
                  value={formData.selling_price}
                  onChange={(e) => handleInputChange("selling_price", e.target.value)}
                  required
                />
                {calculatedMargin && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-green-600">
                    {calculatedMargin}%
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profit_margin">Margin % (Auto)</Label>
              <Input
                id="profit_margin"
                type="number"
                step="0.01"
                value={formData.profit_margin}
                onChange={(e) => handleInputChange("profit_margin", e.target.value)}
              />
            </div>
            <div className="space-y-2 flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="core"
                  checked={formData.core}
                  onCheckedChange={(checked) => handleInputChange('core', checked)}
                />
                <Label htmlFor="core" className="cursor-pointer">Core Item</Label>
              </div>
            </div>
            <div className="space-y-2 flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="stocked_item"
                  checked={formData.stocked_item}
                  onCheckedChange={(checked) => handleInputChange('stocked_item', checked)}
                />
                <Label htmlFor="stocked_item" className="cursor-pointer">Stocked Item</Label>
              </div>
            </div>
          </div>

          {/* Conditional Fields: Core Cost */}
          {formData.core && (
            <div className="mb-4">
              <Label htmlFor="core_cost">Core Cost</Label>
              <Input
                id="core_cost"
                type="number"
                step="0.01"
                value={formData.core_cost}
                onChange={(e) => handleInputChange('core_cost', e.target.value)}
                className="max-w-xs"
              />
            </div>
          )}

          {/* Conditional Fields: Stocked Item Details */}
          {formData.stocked_item && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 bg-gray-50 p-4 rounded-md">
              <div className="space-y-2">
                <Label htmlFor="minimum_quantity">Minimum (Optional)</Label>
                <Input
                  id="minimum_quantity"
                  type="number"
                  value={formData.minimum_quantity}
                  onChange={(e) => handleInputChange('minimum_quantity', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maximum_quantity">Maximum (Optional)</Label>
                <Input
                  id="maximum_quantity"
                  type="number"
                  value={formData.maximum_quantity}
                  onChange={(e) => handleInputChange('maximum_quantity', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location (Optional)</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Row 4: Category and Action Buttons */}
          <div className="flex items-end justify-between gap-4 pt-4 border-t">
            <div className="w-64 space-y-2">
              <Label htmlFor="category">
                Category {suggestingCategory && <span className="text-xs text-blue-500 animate-pulse">(Suggesting...)</span>}
              </Label>
              <Select value={formData.category || 'none'} onValueChange={(val) => handleInputChange('category', val === 'none' ? '' : val)}>
                <SelectTrigger className={isCategorySuggested ? "border-red-500 ring-1 ring-red-500" : ""}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {[...inventoryCategories]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} type="button" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-black text-white hover:bg-gray-800">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add & Order Part
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}