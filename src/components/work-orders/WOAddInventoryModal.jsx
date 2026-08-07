import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, AlertCircle, Trash2, Search, Check, Save, Upload, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import WOPartsImportModal from './WOPartsImportModal';

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
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
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
        
        // Ctrl + Enter to Process Batch (defaults to On Order)
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            if (batchItems.length > 0 && !processingBatch) {
                handleProcessBatch('on_order');
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
      const [suppliersData, salesClassesData, tagAlongsData, otherChargesData, categoriesData] = await Promise.all([
        supabase
          .from('Supplier')
          .select('*')
          .eq('inventory_supplier', true)
          .then(res => res.data || []),
        supabase
          .from('SalesClass')
          .select('*')
          .then(res => res.data || []),
        supabase.from('TagAlong').select('*').then(res => res.data || []),
        supabase.from('OtherChargeList').select('*').then(res => res.data || []),
        supabase.from('InventoryCategory').select('*').then(res => res.data || [])
      ]);
      setSuppliers(suppliersData);
      setSalesClasses(salesClassesData || []);
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
        const { data, error } = await supabase.rpc('search_inventory_ranked', {
          p_search_term: trimmedSearch,
          p_limit: 50,
          p_location_from: null,
          p_location_to: null
        });
        if (error) throw error;
        setSearchResults((data || []).map(({ total_count, match_rank, ...item }) => item));
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

  const handleEditBatchItem = (item) => {
    if (formData.part_number && formData.part_number.trim() !== '') {
        const proceed = window.confirm("This will clear the current part info you have entered above. Do you want to proceed?");
        if (!proceed) return;
    }

    setFormData({
        part_number: item.part_number || '',
        description: item.description || '',
        unit: item.unit || '',
        category: item.category || '',
        supplier_id: item.supplier_id || '',
        manufacturer: item.manufacturer || '',
        cost: item.cost !== undefined ? String(item.cost) : '',
        selling_price: item.selling_price !== undefined ? String(item.selling_price) : '',
        sales_class: item.sales_class || '',
        profit_margin: item.profit_margin !== undefined ? String(item.profit_margin) : '',
        quantity_to_order: item.quantity_to_order !== undefined ? String(item.quantity_to_order) : '1',
        minimum_quantity: item.minimum_quantity !== undefined ? String(item.minimum_quantity) : '',
        maximum_quantity: item.maximum_quantity !== undefined ? String(item.maximum_quantity) : '',
        location: item.location || '',
        core: !!item.core,
        core_cost: item.core_cost !== undefined ? String(item.core_cost) : '',
        tag_along_id: item.tag_along_id || '',
        stocked_item: !!item.stocked_item,
        is_active: item.is_active !== undefined ? item.is_active : true,
    });
    setCalculatedMargin(item.profit_margin !== undefined ? String(item.profit_margin) : '');
    setIsCategorySuggested(false);
    setIsExistingPart(!!item.isExistingPart);
    setExistingPartId(item.existingPartId || null);
    setExistingPartQOH(0);
    setSearchTerm(item.part_number || '');
    setActiveSearchTerm('');
    setSearchResults([]);
    setPartSearchOpen(false);

    handleRemoveFromBatch(item.temp_id);

    setTimeout(() => {
        partNumberRef.current?.focus();
    }, 100);
  };

  const validateBatchItems = (items) => {
    const problems = [];
    items.forEach((item, idx) => {
      const missing = [];
      if (!item.part_number) missing.push('Part #');
      if (!item.description) missing.push('Description');
      if (!(parseFloat(item.cost) > 0)) missing.push('Cost');
      if (!(parseFloat(item.selling_price) > 0)) missing.push('Selling Price');
      if (!item.sales_class) missing.push('Sales Class');
      if (!item.supplier_id) missing.push('Supplier');
      if (!(parseFloat(item.quantity_to_order) > 0)) missing.push('Qty Ordered');
      if (missing.length > 0) {
        problems.push(`Item ${idx + 1} (${item.part_number || 'no part #'}): missing ${missing.join(', ')}`);
      }
    });
    return problems;
  };

  const handleProcessBatch = async (saveMode) => {
    if (batchItems.length === 0) return;

    const validationErrors = validateBatchItems(batchItems);
    if (validationErrors.length > 0) {
        alert(`Cannot process batch: some items are missing required fields.\n\n${validationErrors.join('\n')}`);
        return;
    }

    setProcessingBatch(true);
    const lineItemsToAdd = [];

    try {
        for (const item of batchItems) {
            const quantityToOrder = parseFloat(item.quantity_to_order);
            let processedInventoryItem;
            let oldQuantity = 0;
            let newQuantity = 0;
            let oldQuantityOnOrder = 0;
            let newQuantityOnOrder = quantityToOrder;

            // Fetch user from Supabase auth for audit trail
            const { data: { user: authUser } } = await supabase.auth.getUser();
            const userId = authUser?.id || null;
            const userDisplay = authUser?.user_metadata?.full_name || authUser?.email || null;
            const nowStr = new Date().toISOString();

            if (item.isExistingPart && item.existingPartId) {
                // Update existing item QOO
                // Fetch fresh to get current QOO via Supabase client
                const { data: freshItemRes } = await supabase
                    .from('InventoryItem')
                    .select('*')
                    .eq('id', item.existingPartId);
                const freshItem = freshItemRes?.[0];
                if (!freshItem) throw new Error("Could not find existing part in database.");
                
                const currentQOH = Number(freshItem.quantity_on_hand) || 0;
                const currentQOO = Number(freshItem.quantity_on_order) || 0;
                oldQuantity = currentQOH;
                newQuantity = currentQOH;
                oldQuantityOnOrder = currentQOO;

                if (saveMode === 'on_order') {
                    newQuantityOnOrder = currentQOO + quantityToOrder;

                    const { error: updateError } = await supabase.rpc('update_inventory_with_audit', {
                        p_item_id: freshItem.id,
                        p_qoh: currentQOH,
                        p_qoo: currentQOO + quantityToOrder,
                        p_ro_number: workOrder.ro_number,
                        p_supplier_inv: null,
                        p_source_action: 'WOAddInventoryModal',
                        p_tx_type: 'Ordered',
                        p_description: `Ordered existing part for WO ${workOrder.ro_number}`,
                        p_user_id: userId,
                        p_user_name: userDisplay,
                        p_source_record_id: workOrder.id
                    });

                    if (updateError) throw new Error('Failed to update inventory quantity via RPC: ' + updateError.message);

                    processedInventoryItem = { ...freshItem, quantity_on_order: currentQOO + quantityToOrder };
                } else {
                    // Quoted: leave QOO untouched, no audit entry - nothing has actually been ordered yet
                    newQuantityOnOrder = currentQOO;
                    processedInventoryItem = freshItem;
                }
            } else {
                // Create new item
                const newInventoryItemData = {
                    id: crypto.randomUUID(),
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
                    quantity_on_order: saveMode === 'on_order' ? quantityToOrder : 0,
                    minimum_quantity: item.minimum_quantity ? parseInt(item.minimum_quantity, 10) : 0,
                    maximum_quantity: item.maximum_quantity ? parseInt(item.maximum_quantity, 10) : 0,
                    location: item.location || null,
                    core: item.core,
                    core_cost: parseFloat(item.core_cost) || 0,
                    tag_along_id: item.tag_along_id || null,
                    stocked_item: item.stocked_item,
                    is_active: item.is_active,
                    created_date: nowStr,
                    updated_date: nowStr,
                    created_by: userDisplay,
                    created_by_id: userId,
                };
                
                const { data: createData, error: createError } = await supabase
                    .from('InventoryItem')
                    .insert([newInventoryItemData])
                    .select();
                    
                if (createError) throw new Error('Failed to create new inventory item: ' + createError.message);
                processedInventoryItem = createData[0];

                // Create InventoryAuditLog record ONLY for new items ordered On Order (RPC handles existing; Quoted has no quantity movement to log)
                if (saveMode === 'on_order') {
                    const { error: auditError } = await supabase.from('InventoryAuditLog').insert([{
                        inventory_item_id: processedInventoryItem.id,
                        part_num: processedInventoryItem.part_number,
                        old_quantity: 0,
                        new_quantity: 0,
                        old_quantity_on_order: 0,
                        new_quantity_on_order: quantityToOrder,
                        supplier_name: getSupplierName(item.supplier_id),
                        source_record_id: workOrder.id,
                        source_function: 'WOAddInventoryModal',
                        tx_type: 'Ordered',
                        quantity_change: 0,
                        quantity_ordered_change: quantityToOrder,
                        ro_number: workOrder.ro_number,
                        description: `Ordered new part for WO ${workOrder.ro_number}`,
                        created_by_id: userId,
                        created_by: userDisplay,
                        tx_date: nowStr
                    }]);
                    if (auditError) console.error('Error creating InventoryAuditLog for new item:', auditError);
                }
            }

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
                qty_on_order: saveMode === 'on_order' ? quantityToOrder : 0,
                qty_quoted: saveMode === 'quoted' ? quantityToOrder : 0,
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
                  
                  const response = await supabase.functions.invoke('autopro-suggestInventoryCategory', {
                      body: {
                          part_number: formData.part_number,
                          description: formData.description,
                          supplier_name: supplierName
                      }
                  });
                  if (response.error) { console.error('Category suggestion error:', response.error); return; }

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

  const handleOCRImportSuccess = async ({ supplierId, items }) => {
      if (!items || items.length === 0) return;

      const regularSalesClass = salesClasses.find(sc => (sc.name || '').toLowerCase() === 'regular');
      const regularSalesClassId = regularSalesClass ? String(regularSalesClass.id) : '';

      const partNumbersToFetch = items
          .map(item => (item.part_number || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
          .filter(Boolean);

      let existingItemsMap = new Map();
      if (partNumbersToFetch.length > 0) {
          try {
              const { data: existingItems, error } = await supabase
                  .from('InventoryItem')
                  .select('*')
                  .in('part_number', partNumbersToFetch);

              if (!error && existingItems) {
                  existingItems.forEach(item => {
                      existingItemsMap.set((item.part_number || '').toUpperCase(), item);
                  });
              }
          } catch (err) {
              console.error('Error fetching existing items for WO parts import:', err);
          }
      }

      const mappedItems = items.map(item => {
          const partNumber = (item.part_number || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const existingPart = existingItemsMap.get(partNumber);

          const cost = parseFloat(item.cost) || 0;
          let isCore = !!item.core;
          let coreCost = parseFloat(item.core_cost) || 0;
          let sellingPrice = 0;
          let margin = 0;
          let salesClass = regularSalesClassId;
          let description = item.description || '';
          let matchedTagAlongId = '';
          const enviroFee = parseFloat(item.enviro_fee) || 0;

          if (existingPart) {
              salesClass = existingPart.sales_class || regularSalesClassId;
              description = existingPart.description || description;
              matchedTagAlongId = existingPart.tag_along_id || '';
              if (!isCore && existingPart.core) {
                  isCore = true;
                  coreCost = parseFloat(existingPart.core_cost) || 0;
              }
          }

          if (enviroFee > 0 && !matchedTagAlongId) {
              let bestMatch = null;
              let minDiff = Infinity;
              tagAlongs.forEach(ta => {
                  const str = (ta.name + ' ' + (ta.description || '')).replace(/\s/g, '');
                  const match = str.match(/\$?(?:[0-9]+\.[0-9]+|[0-9]+)/);
                  if (match) {
                      const taPrice = parseFloat(match[0].replace('$', ''));
                      if (taPrice >= enviroFee) {
                          const diff = taPrice - enviroFee;
                          if (diff < minDiff) {
                              minDiff = diff;
                              bestMatch = ta;
                          }
                      }
                  }
              });
              if (bestMatch) matchedTagAlongId = bestMatch.id;
          }

          if (cost > 0 && salesClass) {
              const calc = calculatePriceFromSalesClass(cost, salesClass);
              if (calc) {
                  sellingPrice = parseFloat(calc.sellingPrice);
                  margin = parseFloat(calc.margin);
              }
          } else if (existingPart) {
              sellingPrice = parseFloat(existingPart.selling_price) || 0;
              margin = parseFloat(existingPart.profit_margin) || 0;
          }

          return {
              part_number: partNumber,
              description,
              unit: existingPart ? (existingPart.unit || '') : '',
              category: existingPart ? (existingPart.category || '') : '',
              supplier_id: supplierId,
              manufacturer: existingPart ? (existingPart.manufacturer || '') : '',
              cost: cost ? cost.toFixed(2) : '',
              selling_price: sellingPrice ? sellingPrice.toFixed(2) : '',
              sales_class: salesClass,
              profit_margin: margin ? margin.toFixed(2) : '',
              quantity_to_order: (parseFloat(item.quantity) || 0).toString(),
              minimum_quantity: existingPart ? (existingPart.minimum_quantity || 0).toString() : '',
              maximum_quantity: existingPart ? (existingPart.maximum_quantity || 0).toString() : '',
              location: existingPart ? (existingPart.location || '') : '',
              core: isCore,
              core_cost: coreCost ? coreCost.toFixed(2) : '',
              tag_along_id: matchedTagAlongId,
              stocked_item: existingPart ? !!existingPart.stocked_item : false,
              is_active: true,
              temp_id: Date.now() + Math.random(),
              isExistingPart: !!existingPart,
              existingPartId: existingPart ? existingPart.id : null,
          };
      });

      setBatchItems(prev => [...mappedItems, ...prev]);
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
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0 dark:bg-slate-950 dark:border-slate-800"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
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
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
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
                    <PopoverContent className="p-0 w-[300px] dark:bg-slate-950 dark:border-slate-800" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <div className="max-h-[300px] overflow-y-auto p-1 bg-white dark:bg-slate-950">
                            {searchingParts ? (
                                <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Searching parts...
                                </div>
                            ) : searchTerm.trim() && !activeSearchTerm ? (
                                <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                    Press Enter or Tab to search.
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
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
                                            className="flex flex-col px-3 py-2 text-sm rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                                        >
                                            <span className="font-medium text-slate-900 dark:text-slate-100">{item.part_number}</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{item.description}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
                {isExistingPart && (
                    <div className={`mt-2 p-2 rounded-md border ${existingPartQOH !== 0 ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-400' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400'}`}>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 bg-gray-50 dark:bg-slate-900/50 p-4 rounded-md">
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

                <div className="flex items-end">
                    <Button type="button" onClick={() => setOcrModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Upload className="w-4 h-4 mr-2" />
                        Paste/Upload Parts
                    </Button>
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

            {batchItems.length > 0 && (
                <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-4">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-semibold dark:text-slate-100">Batched Items ({batchItems.length})</h4>
                        <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            Total Value: ${batchItems.reduce((acc, item) => acc + (parseFloat(item.cost || 0) * parseFloat(item.quantity_to_order || 0)), 0).toFixed(2)}
                        </div>
                    </div>
                    
                    <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                        <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
                                <div key={item.temp_id} className="grid grid-cols-12 gap-4 p-3 border-b border-slate-200 dark:border-slate-700 last:border-0 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 text-sm">
                                    <div className="col-span-3">
                                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.part_number}</div>
                                        <div className="text-slate-500 dark:text-slate-400 text-xs truncate">{item.description}</div>
                                    </div>
                                    <div className="col-span-2 text-slate-600 dark:text-slate-400 text-xs truncate">
                                        {getSupplierName(item.supplier_id)}
                                    </div>
                                    <div className="col-span-1 font-medium dark:text-slate-200">
                                        {item.quantity_to_order}
                                    </div>
                                    <div className="col-span-2 text-slate-600 dark:text-slate-400">
                                        ${parseFloat(item.cost).toFixed(2)}
                                    </div>
                                    <div className="col-span-2 text-slate-600 dark:text-slate-400">
                                        ${parseFloat(item.selling_price).toFixed(2)}
                                    </div>
                                    <div className="col-span-1">
                                        {item.isExistingPart ? (
                                            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50 text-[10px] px-1.5 py-0">Update</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700/50 text-[10px] px-1.5 py-0">New</Badge>
                                        )}
                                    </div>
                                    <div className="col-span-1 flex justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleEditBatchItem(item)}
                                            className="h-8 w-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFromBatch(item.temp_id)}
                                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
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

        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex justify-between items-center rounded-b-lg">
            <Button variant="outline" onClick={onClose} disabled={processingBatch || loading}>
                Cancel
            </Button>
            <div className="flex gap-2 items-center">
                {batchItems.length > 0 && <span className="text-xs text-slate-500 mr-2">Ctrl + Enter for On Order</span>}
                <Button
                    onClick={() => handleProcessBatch('quoted')}
                    disabled={batchItems.length === 0 || processingBatch}
                    variant="outline"
                    className="min-w-[170px] border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                    {processingBatch ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Add Batch as Quoted
                        </>
                    )}
                </Button>
                <Button
                    onClick={() => handleProcessBatch('on_order')}
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
                            Add Batch as On Order
                        </>
                    )}
                </Button>
            </div>
        </div>

      </DialogContent>
    </Dialog>
    <WOPartsImportModal
      open={ocrModalOpen}
      onClose={() => setOcrModalOpen(false)}
      onSuccess={handleOCRImportSuccess}
      suppliers={suppliers}
    />
    </>
  );
}