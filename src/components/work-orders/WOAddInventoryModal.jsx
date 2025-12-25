import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, AlertCircle } from 'lucide-react';
import { InventoryItem, Supplier, SalesClass, InventoryTxs, TagAlong } from '@/entities/all';

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
  const [loading, setLoading] = useState(false);
  const [calculatedMargin, setCalculatedMargin] = useState('');
  const [duplicatePartWarning, setDuplicatePartWarning] = useState(null);

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
    setCalculatedMargin('');
    setDuplicatePartWarning(null);
  };

  const loadDropdownData = async () => {
    try {
      const [suppliersData, salesClassesData, tagAlongsData] = await Promise.all([
        Supplier.filter({ inventory_supplier: true }, 'name'),
        SalesClass.list(),
        TagAlong.list()
      ]);
      setSuppliers(suppliersData);
      setSalesClasses(salesClassesData);
      setTagAlongs(tagAlongsData);
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
    if (parseFloat(formData.quantity_to_order) <= 0) {
      alert('Quantity to Order must be greater than 0.');
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
        category: formData.category,
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
        Core_num: createdInventoryItem.core ? quantityToOrder : 0,
        core_ret: 0,
        core_cost: parseFloat(formData.core_cost) || 0,
      };
      
      console.log('=== DEBUG: WOAddInventoryModal creating line item ===');
      console.log('New part data with taxable field:', newLineItem);

      console.log('=== WOAddInventoryModal: Inventory processing completed ===');
      console.log('New line item:', newLineItem);

      onAdd([newLineItem]);
      onClose();

    } catch (error) {
      console.error('Error creating inventory item and processing transaction:', error);
      alert(`Failed to add inventory item: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const categories = ["oil_fluids", "filters", "brakes", "engine", "transmission", "electrical", "tires", "belts_hoses", "suspension", "exhaust", "other"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Inventory Item & Order for Work Order
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="part_number">Part Number *</Label>
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
              />
              {duplicatePartWarning && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">{duplicatePartWarning}</p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category} onValueChange={(val) => handleInputChange('category', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => <SelectItem key={cat} value={cat}>{cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => {
                  // Title Case: Capitalize first letter of each word
                  const val = e.target.value.replace(/\b\w/g, l => l.toUpperCase());
                  handleInputChange("description", val);
                }}
                required
              />
            </div>

            <div>
              <Label htmlFor="unit">Unit (e.g., /ea, /lb, /gal)</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) => handleInputChange("unit", e.target.value.slice(0, 5))}
                placeholder="/ea"
                maxLength={5}
              />
            </div>
          </div>

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
                      // First sort by pin_to_top (pinned first)
                      if (a.pin_to_top && !b.pin_to_top) return -1;
                      if (!a.pin_to_top && b.pin_to_top) return 1;
                      // Then sort alphabetically by name
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cost">Cost *</Label>
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

            <div>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="selling_price">Selling Price *</Label>
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
            <div>
              <Label htmlFor="profit_margin">Profit Margin %</Label>
              <Input
                id="profit_margin"
                type="number"
                step="0.01"
                value={formData.profit_margin}
                onChange={(e) => handleInputChange("profit_margin", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity_to_order">Quantity to Order *</Label>
              <Input
                id="quantity_to_order"
                type="number"
                min="1"
                value={formData.quantity_to_order}
                onChange={(e) => handleInputChange("quantity_to_order", e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} type="button" disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Add & Order Part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}