import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, AlertCircle, Trash2, Search, Check, Save } from 'lucide-react';
import { InventoryItem, InventoryTxs, TagAlong, OtherChargeList, InventoryCategory } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

export default function WOAddInventoryModal({ open, onClose, onAdd, workOrder }) {
  const [formData, setFormData] = useState({
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
    quantity_to_order: '1',
    minimum_quantity: '',
    maximum_quantity: '',
    location: '',
    core: false,
    core_cost: '',
    tag_along_id: '',
    stocked_item: false,
    is_active: true,
  });

  const [batchItems, setBatchItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [salesClasses, setSalesClasses] = useState([]);
  const [tagAlongs, setTagAlongs] = useState([]);
  const [otherCharges, setOtherCharges] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchingParts, setSearchingParts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [processingBatch, setProcessingBatch] = useState(false);
  const [calculatedMargin, setCalculatedMargin] = useState('');
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [isCategorySuggested, setIsCategorySuggested] = useState(false);
  const [isExistingPart, setIsExistingPart] = useState(false);
  const [existingPartId, setExistingPartId] = useState(null);
  const [existingPartQOH, setExistingPartQOH] = useState(0);
  
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const partNumberRef = useRef(null);
  const descriptionRef = useRef(null);

  useEffect(() => {
    if (open) {
      loadDropdownData();
      resetForm();
      setBatchItems([]);
    }
  }, [open]);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (!open) return;
        
        // Ctrl + A to Add to Batch
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            // We need to trigger handleAddToBatch, but we need the event or synthesize it
            // Since handleAddToBatch expects event for preventDefault, pass a dummy
            handleAddToBatch({ preventDefault: () => {} });
        }
        
        // Ctrl + Enter to Process Batch
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            if (batchItems.length > 0 && !processingBatch) {
                handleProcessBatch();
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, batchItems, processingBatch, formData]); // Depend on formData for add

  const resetForm = (overrides = {}) => {
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
      quantity_to_order: '1',
      minimum_quantity: '',
      maximum_quantity: '',
      location: '',
      core: false,
      core_cost: '',
      tag_along_id: '',
      stocked_item: false,
      is_active: true,
      ...overrides
    });
    setCalculatedMargin('');
    setIsCategorySuggested(false);
    setIsExistingPart(false);
    setExistingPartId(null);
    setExistingPartQOH(0);
    setSearchTerm(overrides.part_number || '');
    setActiveSearchTerm('');
    setSearchResults([]);
    setPartSearchOpen(false);
  };

  const loadDropdownData = async () => {
    try {
      const [suppliersData, salesClassesResponse, tagAlongsData, otherChargesData, categoriesData] = await Promise.all([
        base44.functions.invoke('SupabaseProxy', {
          action: 'read',
          table: 'Supplier',
          match: { inventory_supplier: true }
        }).then(res => res.data?.data || []),
        base44.functions.invoke('SupabaseProxy', { action: 'read' }),
        TagAlong.list(),
        OtherChargeList.list(),
        InventoryCategory.list()
      ]);
      setSuppliers(suppliersData);
      setSalesClasses(salesClassesResponse.data?.data || []);
      setTagAlongs(tagAlongsData);
      setOtherCharges(otherChargesData);
      setInventoryCategories(categoriesData);
    } catch (error) {
      console.error('Error loading dropdown data:', error);
    }
  };

  useEffect(() => {
    const runInventorySearch = async () => {
      const trimmedSearch = activeSearchTerm.trim();

      if (!partSearchOpen || !trimmedSearch) {
        setSearchResults([]);
        setSearchingParts(false);
        return;
      }

      setSearchingParts(true);
      try {
        const response = await base44.functions.invoke('searchInventory', {
          search: trimmedSearch,
          limit: 50,
          sortBy: 'part_number',
          sortOrder: 'asc'
        });
        setSearchResults(response.data?.items || []);
      } catch (error) {
        console.error('Error searching inventory:', error);
        setSearchResults([]);
      } finally {
        setSearchingParts(false);
      }
    };

    runInventorySearch();
  }, [activeSearchTerm, partSearchOpen]);

  const selectPartFromList = (itemToSelect) => {
    setIsCategorySuggested(false);
    setIsExistingPart(true);
    setExistingPartId(itemToSelect.id);
    setExistingPartQOH(itemToSelect.quantity_on_hand || 0);
    
    setFormData(prev => {
        const updatedItem = {
            ...prev,
            part_number: itemToSelect.part_number,
            description: itemToSelect.description,
            unit: itemToSelect.unit || '',
            category: itemToSelect.category || '',
            supplier_id: itemToSelect.supplier_id || prev.supplier_id, // Prefer item supplier but fallback
            manufacturer: itemToSelect.manufacturer || '',
            cost: (itemToSelect.cost || 0).toFixed(2),
            selling_price: (itemToSelect.selling_price || 0).toFixed(2),
            profit_margin: (itemToSelect.profit_margin || 0).toFixed(2),
            sales_class: itemToSelect.sales_class || '',
            tag_along_id: itemToSelect.tag_along_id || '',
            core: itemToSelect.core || false,
            core_cost: (itemToSelect.core_cost || 0).toFixed(2),
            stocked_item: itemToSelect.stocked_item || false,
            minimum_quantity: (itemToSelect.minimum_quantity || 0).toString(),
            maximum_quantity: (itemToSelect.maximum_quantity || 0).toString(),
            location: itemToSelect.location || '',
        };

        return updatedItem;
    });
    setCalculatedMargin((itemToSelect.profit_margin || 0).toFixed(2));
  };

  const calculatePriceFromSalesClass = useCallback((cost, salesClassId) => {
    if (!cost || !salesClassId || !salesClasses) return null;

    const selectedSalesClass = salesClasses.find(sc => sc.id === salesClassId);
    if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return null;

    try {
      let parsedData = selectedSalesClass.pricing_matrix;
      if (typeof parsedData === 'string') {
        parsedData = JSON.parse(parsedData);
      }
      if (!Array.isArray(parsedData)) {
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
        const sellingPrice = costValue / (1 - (margin / 100));
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
        setIsExistingPart(false);
        setExistingPartId(null);
        setExistingPartQOH(0);
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
          }
        }
      } else if (field === 'selling_price') {
        const cost = parseFloat(newFormData.cost) || 0;
        const sellingPrice = parseFloat(value) || 0;

        if (cost > 0 && sellingPrice > cost) {
          const margin = ((sellingPrice - cost) / sellingPrice) * 100;
          newFormData.profit_margin = margin.toFixed(2);
          setCalculatedMargin(margin.toFixed(2));
        } else if (cost === 0 && sellingPrice > 0) {
          newFormData.profit_margin = "100.00";
          setCalculatedMargin("100.00");
        }
      }
      else if (field === 'profit_margin') {
        const cost = parseFloat(newFormData.cost) || 0;
        const margin = parseFloat(value) || 0;

        if (cost > 0 && margin >= 0 && margin < 100) {
          const sellingPrice = cost / (1 - margin / 100);
          newFormData.selling_price = sellingPrice.toFixed(2);
        }
      }

      return newFormData;
    });
  };

  const handleAddToBatch = (e) => {
    if (e && e.preventDefault) e.preventDefault();

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

    const newItem = {
        ...formData,
        temp_id: Date.now() + Math.random(),
        isExistingPart,
        existingPartId
    };

    setBatchItems(prev => [...prev, newItem]);
    
    // Reset form but keep the supplier selected
    resetForm({ supplier_id: formData.supplier_id });
    
    // Focus part number for next entry
    setTimeout(() => {
        partNumberRef.current?.focus();
    }, 100);
  };

  const handleRemoveFromBatch = (tempId) => {
    setBatchItems(prev => prev.filter(item => item.temp_id !== tempId));
  };

  const handleProcessBatch = async () => {
    if (batchItems.length === 0) return;
    
    setProcessingBatch(true);
    const lineItemsToAdd = [];

    try {
        for (const item of batchItems) {
            const quantityToOrder = parseFloat(item.quantity_to_order);
            let processedInventoryItem;

            if (item.isExistingPart && item.existingPartId) {
                // Update existing item QOO
                // Fetch fresh to get current QOO
                const freshItem = await InventoryItem.get(item.existingPartId);
                const currentQOO = freshItem.quantity_on_order || 0;
                
                await InventoryItem.update(freshItem.id, {
                    quantity_on_order: currentQOO + quantityToOrder
                });
                
                // We use the fresh item, but we might want to ensure the line item uses the entered cost/price
                // if they differ from master (for this specific order).
                // But generally we link to the inventory item ID.
                processedInventoryItem = freshItem;
            } else {
                // Create new item
                const newInventoryItemData = {
                    part_number: item.part_number,
                    description: item.description,
                    unit: item.unit || null,
                    category: item.category || null,
                    supplier_id: item.supplier_id || null,
                    manufacturer: item.manufacturer || null,
                    sales_class: item.sales_class || null,
                    cost: parseFloat(item.cost) || 0,
                    selling_price: parseFloat(item.selling_price) || 0,
                    profit_margin: parseFloat(item.profit_margin) || 0,
                    quantity_on_hand: 0,
                    quantity_on_order: quantityToOrder,
                    minimum_quantity: item.minimum_quantity ? parseInt(item.minimum_quantity, 10) : 0,
                    maximum_quantity: item.maximum_quantity ? parseInt(item.maximum_quantity, 10) : 0,
                    location: item.location || null,
                    core: item.core,
                    core_cost: parseFloat(item.core_cost) || 0,
                    tag_along_id: item.tag_along_id || null,
                    stocked_item: item.stocked_item,
                    is_active: item.is_active,
                };
                
                processedInventoryItem = await InventoryItem.create(newInventoryItemData);
            }

            // Create Inventory Transaction
            await InventoryTxs.create({
                inventory_item_id: processedInventoryItem.id,
                part_num: processedInventoryItem.part_number,
                tx_date: new Date().toISOString(),
                tx_type: 'Ordered',
                quantity_change: 0,
                quantity_ordered_change: quantityToOrder,
                ro_number: workOrder.ro_number,
                source_record_id: workOrder.id,
                supplier_name: suppliers.find(s => s.id === item.supplier_id)?.name || '',
                description: `Ordered ${item.isExistingPart ? 'existing' : 'new'} part for WO ${workOrder.ro_number}`
            });

            // Create Line Item
            const coreNum = item.core ? quantityToOrder : 0;
            const coreCost = parseFloat(item.core_cost) || 0;

            const newLineItem = {
                id: Date.now() + Math.random(), 
                qty: quantityToOrder,
                hrs: '',
                description: item.description,
                part_number: item.part_number,
                unit: item.unit || '',
                parts_ea: parseFloat(item.selling_price) || 0,
                tot_parts: quantityToOrder * (parseFloat(item.selling_price) || 0),
                labour: 0,
                tx: 'Y',
                taxable: true,
                total: quantityToOrder * (parseFloat(item.selling_price) || 0),
                complete: false,
                bold: false,
                qty_on_order: quantityToOrder,
                inventory_item_id: processedInventoryItem.id,
                inventory_processed: true,
                cost_ea: parseFloat(item.cost) || 0,
                Core_num: coreNum,
                core_ret: 0,
                core_cost: coreCost,
            };

            lineItemsToAdd.push(newLineItem);

            // Handle Tag Along
            if (item.tag_along_id) {
                const tagAlong = tagAlongs.find(ta => ta.id === item.tag_along_id);
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
                        lineItemsToAdd.push(tagAlongLineItem);
                    }
                }
            }
        }

        onAdd(lineItemsToAdd);
        onClose();

    } catch (error) {
        console.error('Error processing batch:', error);
        alert(`Failed to process batch: ${error.message}`);
    } finally {
        setProcessingBatch(false);
    }
  };

  // Smart Category Suggestion Logic
  useEffect(() => {
      const fetchSuggestion = async () => {
          if (formData.part_number && 
              formData.description && 
              !formData.category && 
              !suggestingCategory &&
              !isExistingPart) {
              
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
  }, [formData.part_number, formData.description, formData.category, formData.supplier_id, suppliers, isExistingPart, suggestingCategory]);

  const getSupplierName = (id) => {
      const s = suppliers.find(x => x.id === id);
      return s ? s.name : 'Unknown';
  };

  const handlePartNumberKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
        const trimmedSearch = searchTerm.trim();

        if (!activeSearchTerm || activeSearchTerm !== trimmedSearch) {
            e.preventDefault();
            setActiveSearchTerm(trimmedSearch);
            setPartSearchOpen(!!trimmedSearch);
            return;
        }

        if (searchResults.length > 0) {
            e.preventDefault();
            selectPartFromList(searchResults[0]);
            setPartSearchOpen(false);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            descriptionRef.current?.focus();
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Part
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleAddToBatch} className="space-y-4">
            
            {/* Supplier Row */}
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
                <Label htmlFor="part_number">Part # (Search or Create) *</Label>
                <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                    <PopoverTrigger asChild>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                ref={partNumberRef}
                                id="part_number"
                                value={formData.part_number}
                                onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    handleInputChange("part_number", val);
                                    setSearchTerm(val);
                                    setActiveSearchTerm('');
                                    setSearchResults([]);
                                    setPartSearchOpen(!!val.trim());
                                }}
                                onKeyDown={handlePartNumberKeyDown}
                                onFocus={() => setPartSearchOpen(!!searchTerm.trim())}
                                required
                                placeholder="SEARCH OR TYPE PART #..."
                                className="pl-8 uppercase"
                                autoComplete="off"
                            />
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[300px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <div className="max-h-[300px] overflow-y-auto p-1 bg-white">
                            {searchingParts ? (
                                <div className="py-4 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Searching parts...
                                </div>
                            ) : searchTerm.trim() && !activeSearchTerm ? (
                                <div className="py-4 text-center text-sm text-slate-500">
                                    Press Enter or Tab to search.
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="py-4 text-center text-sm text-slate-500">
                                    No existing parts found.<br/>Type to create new.
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {searchResults.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                selectPartFromList(item);
                                                setPartSearchOpen(false);
                                            }}
                                            className="flex flex-col px-3 py-2 text-sm rounded cursor-pointer hover:bg-slate-100 border-b border-slate-50 last:border-0"
                                        >
                                            <span className="font-medium text-slate-900">{item.part_number}</span>
                                            <span className="text-xs text-slate-500">{item.description}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
                {isExistingPart && (
                    <div className={`mt-2 p-2 rounded-md border ${existingPartQOH !== 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                            {existingPartQOH !== 0 ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            Existing Part Selected (QOH: {existingPartQOH})
                        </div>
                        {existingPartQOH !== 0 && (
                            <div className="mt-1 text-xs">
                                Use <strong>Get Part</strong> to reduce QOH. Using <strong>Add Part</strong> will only mark this part ordered.
                            </div>
                        )}
                    </div>
                )}
                </div>
                <div className="space-y-2 col-span-1 md:col-span-2 grid grid-cols-3 gap-2">
                <div className="space-y-2 col-span-2">
                    <Label htmlFor="description">Description *</Label>
                    <Input
                    ref={descriptionRef}
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

                <div className="flex gap-2 items-center">
                    <span className="text-xs text-slate-500 mr-2">Ctrl + A to Add</span>
                    <Button type="submit" disabled={loading} className="bg-black text-white hover:bg-gray-800">
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Batch
                    </Button>
                </div>
            </div>
            </form>

            {/* Batch List */}
            {batchItems.length > 0 && (
                <div className="mt-8 border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-semibold">Batched Items ({batchItems.length})</h4>
                        <div className="text-sm font-medium text-slate-600">
                            Total Value: ${batchItems.reduce((acc, item) => acc + (parseFloat(item.cost || 0) * parseFloat(item.quantity_to_order || 0)), 0).toFixed(2)}
                        </div>
                    </div>
                    
                    <div className="border rounded-md overflow-hidden bg-white shadow-sm">
                        <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="col-span-3">Part Details</div>
                            <div className="col-span-2">Supplier</div>
                            <div className="col-span-1">Qty</div>
                            <div className="col-span-2">Cost</div>
                            <div className="col-span-2">Price</div>
                            <div className="col-span-1">Status</div>
                            <div className="col-span-1"></div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {batchItems.map((item, index) => (
                                <div key={item.temp_id} className="grid grid-cols-12 gap-4 p-3 border-b last:border-0 items-center hover:bg-slate-50 text-sm">
                                    <div className="col-span-3">
                                        <div className="font-semibold text-slate-900">{item.part_number}</div>
                                        <div className="text-slate-500 text-xs truncate">{item.description}</div>
                                    </div>
                                    <div className="col-span-2 text-slate-600 text-xs truncate">
                                        {getSupplierName(item.supplier_id)}
                                    </div>
                                    <div className="col-span-1 font-medium">
                                        {item.quantity_to_order}
                                    </div>
                                    <div className="col-span-2 text-slate-600">
                                        ${parseFloat(item.cost).toFixed(2)}
                                    </div>
                                    <div className="col-span-2 text-slate-600">
                                        ${parseFloat(item.selling_price).toFixed(2)}
                                    </div>
                                    <div className="col-span-1">
                                        {item.isExistingPart ? (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">Update</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">New</Badge>
                                        )}
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFromBatch(item.temp_id)}
                                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-slate-50 flex justify-between items-center">
            <Button variant="outline" onClick={onClose} disabled={processingBatch || loading}>
                Cancel
            </Button>
            <div className="flex gap-2 items-center">
                {batchItems.length > 0 && <span className="text-xs text-slate-500 mr-2">Ctrl + Enter to Process</span>}
                <Button 
                    onClick={handleProcessBatch} 
                    disabled={batchItems.length === 0 || processingBatch}
                    className="bg-green-600 hover:bg-green-700 text-white min-w-[200px]"
                >
                    {processingBatch ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing Batch...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Batch & Add to WO
                        </>
                    )}
                </Button>
            </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}