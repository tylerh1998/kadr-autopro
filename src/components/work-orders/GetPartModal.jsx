import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Trash2, Package, DollarSign, ShoppingCart, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';


export default function GetPartModal({ open, onClose, onAddParts, contextLineItem, workOrder, mode = 'work_order' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [selectedParts, setSelectedParts] = useState([]);
  const [salesClasses, setSalesClasses] = useState([]);
  const [tagAlongs, setTagAlongs] = useState([]);
  const [otherCharges, setOtherCharges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inventoryResults, setInventoryResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Quantity prompt dialog state
  const [showQuantityPrompt, setShowQuantityPrompt] = useState(false);
  const [partForQuantityPrompt, setPartForQuantityPrompt] = useState(null);
  const [quantityInput, setQuantityInput] = useState('1');
  const [contextPromptHandled, setContextPromptHandled] = useState(false);

  // Fetch initial data and default inventory on modal open
  useEffect(() => {
    const fetchData = async () => {
      try {
        setSearching(true);
        setSearchError('');
        
        const [salesClassesResponse, tagAlongsResponse, otherChargesResponse] = await Promise.all([
          supabase.from('SalesClass').select('*'),
          supabase.from('TagAlong').select('*').limit(1000),
          supabase.from('OtherChargeList').select('*').limit(1000)
        ]);

        setSalesClasses(salesClassesResponse.data || []);
        setTagAlongs(tagAlongsResponse.data || []);
        setOtherCharges(otherChargesResponse.data || []);
        setInventoryResults([]);
      } catch (error) {
        console.error('Error loading data:', error);
        setSearchError('Failed to load inventory. Please try again.');
      } finally {
        setSearching(false);
      }
    };

    if (open) {
      setContextPromptHandled(false);
      fetchData();
    } else {
      // Clear state when modal closes
      setInventoryResults([]);
      setSearchTerm('');
      setSelectedParts([]);
      setSearchError('');
      setContextPromptHandled(false);
    }
  }, [open]);

  // Handle contextLineItem auto-selection
  useEffect(() => {
    const handleContextItem = async () => {
      if (open && contextLineItem && contextLineItem.part_number && !showQuantityPrompt && !contextPromptHandled) {
        try {
          setSearching(true);
          const { data, error } = await supabase.rpc('search_inventory_ranked', {
            p_search_term: contextLineItem.part_number,
            p_limit: 50,
            p_location_from: null,
            p_location_to: null
          });
          if (error) console.error('Error searching for context item:', error);
          const records = (data || []).map(({ total_count, match_rank, ...item }) => item);

          if (records.length > 0) {
            const matchingItem = records.find(
              item => item.part_number === contextLineItem.part_number
            );
            
            if (matchingItem) {
              setPartForQuantityPrompt(matchingItem);
              setQuantityInput(contextLineItem.qty ? String(contextLineItem.qty) : '1');
              setShowQuantityPrompt(true);
              setContextPromptHandled(true);
            }
          }
        } catch (error) {
          console.error('Error searching for context item:', error);
        } finally {
          setSearching(false);
        }
      }
    };
    
    handleContextItem();
  }, [open, contextLineItem, showQuantityPrompt, contextPromptHandled]);

  // Handle search when activeSearchTerm changes
  useEffect(() => {
    const performSearch = async () => {
      if (activeSearchTerm.trim() === '') {
        setSearchError('');
        setInventoryResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      setSearchError('');
      try {
        const { data, error } = await supabase.rpc('search_inventory_ranked', {
          p_search_term: activeSearchTerm,
          p_limit: 100,
          p_location_from: null,
          p_location_to: null
        });

        if (error) throw error;
        setInventoryResults((data || []).map(({ total_count, match_rank, ...item }) => item));
      } catch (error) {
        console.error('Search error:', error);
        setSearchError('Search failed. Please try again.');
        setInventoryResults([]);
      } finally {
        setSearching(false);
      }
    };

    performSearch();
  }, [activeSearchTerm]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setActiveSearchTerm(searchTerm);
    }
  };

  const calculatePrice = useCallback((item, quantity) => {
    if (!item.sales_class || salesClasses.length === 0) {
      return item.selling_price || 0;
    }

    const salesClass = salesClasses.find(sc => sc.name === item.sales_class);
    if (!salesClass || !salesClass.pricing_matrix) {
      return item.selling_price || 0;
    }

    try {
      const matrix = JSON.parse(salesClass.pricing_matrix);
      if (!matrix || !Array.isArray(matrix.rules)) {
        return item.selling_price || 0;
      }

      const applicableRule = matrix.rules.find(rule => {
        if (rule.min_quantity !== undefined && quantity < rule.min_quantity) return false;
        if (rule.max_quantity !== undefined && quantity > rule.max_quantity) return false;
        return true;
      });

      if (!applicableRule) {
        return item.selling_price || 0;
      }

      const cost = item.cost || 0;
      let price = item.selling_price || 0;

      switch (applicableRule.pricing_method) {
        case 'fixed_price':
          price = applicableRule.fixed_price || 0;
          break;
        case 'markup_percent':
          price = cost * (1 + (applicableRule.markup_percent || 0) / 100);
          break;
        case 'margin_percent':
          const margin = applicableRule.margin_percent || 0;
          price = cost / (1 - margin / 100);
          break;
        case 'cost_plus':
          price = cost + (applicableRule.cost_plus_amount || 0);
          break;
        default:
          price = item.selling_price || 0;
      }

      return Math.max(0, price);
    } catch (error) {
      console.error('Error calculating price:', error);
      return item.selling_price || 0;
    }
  }, [salesClasses]);

  const handleSelectPart = (item) => {
    // Show quantity prompt dialog
    setPartForQuantityPrompt(item);
    setQuantityInput('1');
    setShowQuantityPrompt(true);
  };

  const handleConfirmQuantity = () => {
    if (!partForQuantityPrompt) return;
    
    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity greater than 0');
      return;
    }

    const pricePerUnit = calculatePrice(partForQuantityPrompt, qty);
    
    setSelectedParts(prev => [...prev, {
      ...partForQuantityPrompt,
      selectionId: crypto.randomUUID(),
      inventoryItemId: partForQuantityPrompt.id,
      selectedQuantity: qty,
      calculatedPrice: pricePerUnit
    }]);

    // Close dialog and reset
    setShowQuantityPrompt(false);
    setPartForQuantityPrompt(null);
    setQuantityInput('1');
  };

  const handleCancelQuantityPrompt = () => {
    setShowQuantityPrompt(false);
    setPartForQuantityPrompt(null);
    setQuantityInput('1');
  };

  const handleQuantityChange = (selectionId, newQuantity) => {
    const qty = Math.max(0, parseFloat(newQuantity) || 0);
    setSelectedParts(prev => prev.map(part => {
      if (part.selectionId === selectionId) {
        const newPrice = calculatePrice(part, qty);
        return { ...part, selectedQuantity: qty, calculatedPrice: newPrice };
      }
      return part;
    }));
  };

  const handleRemovePart = (selectionId) => {
    setSelectedParts(prev => prev.filter(p => p.selectionId !== selectionId));
  };

  const handleAddSelectedParts = async () => {
    if (selectedParts.length === 0) {
      alert('Please select at least one part to add.');
      return;
    }
    setLoading(true);

    const partsToAdd = [];
    const inventoryAdjustments = [];

    // Prepare payload for bulk processing
    const itemsPayload = [];
    
    // Map selected parts to payload items
    for (const selectedPart of selectedParts) {
      // Use the selectedPart data directly as it contains the snapshot of the item when it was selected
      // Do NOT look up in inventoryResults because that array changes with subsequent searches
      
      itemsPayload.push({
        inventoryItemId: selectedPart.inventoryItemId,
        requestedQuantity: selectedPart.selectedQuantity,
        lineDescription: selectedPart.description,
        linePartNumber: selectedPart.part_number,
        // Carry over selectedPart specific data for later use (calculated price)
        _calculatedPrice: selectedPart.calculatedPrice,
        _invItem: selectedPart // Carry original item for tag along lookup
      });
    }

    if (itemsPayload.length === 0) {
      alert('No valid parts selected.');
      setLoading(false);
      return;
    }

    let processedResults = [];

    try {
      if (mode === 'work_order') {
        // Bulk transaction call
        const response = await supabase.functions.invoke('autopro-WOBulkGetParts', {
          body: {
            items: itemsPayload.map(({ _calculatedPrice, _invItem, ...rest }) => rest), // Clean payload
            workOrderId: workOrder.id,
            roNumber: workOrder.ro_number
          }
        });

        if (response.error) {
          throw new Error(response.error.message || 'Bulk transaction failed');
        }
        if (response.data?.error) {
          throw new Error(response.data.error);
        }
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Bulk transaction failed');
        }

        processedResults = response.data.items || response.data.results || [];
        
        if (processedResults.length === 0 && response.data.debug_errors && response.data.debug_errors.length > 0) {
          alert('Backend skipped all items. Debug info: ' + JSON.stringify(response.data.debug_errors));
        }
      } else {
        // Estimate Mode: Mock results without backend call
        processedResults = itemsPayload.map(item => ({
          inventoryItemId: item.inventoryItemId,
          issuedQuantity: 0,
          onOrderQuantity: 0,
          newInventoryQOH: item._invItem.quantity_on_hand, // Unchanged
          newInventoryQOO: item._invItem.quantity_on_order, // Unchanged
          cost: item._invItem.cost || 0,
          unit: item._invItem.unit,
          part_number: item._invItem.part_number,
          description: item._invItem.description,
          core: item._invItem.core,
          core_cost: item._invItem.core_cost,
          tag_along_id: item._invItem.tag_along_id
        }));
      }

      // Process results into line items
      processedResults.forEach((result, index) => {
        // Find original payload item to get calculated price and TagAlong info
        // Note: We assume the backend returns results in same order, but safer to match by ID if possible.
        // Since we loop sequentially in backend, order should be preserved.
        const originalPayloadItem = itemsPayload[index];
        const resInvItemId = result.inventoryItemId || result.inventory_item_id;
        
        if (originalPayloadItem.inventoryItemId !== resInvItemId) {
          console.error("Result mismatch order detected");
          // Fallback search
          // This shouldn't happen with sequential processing, but for safety:
        }

        const calculatedPrice = originalPayloadItem._calculatedPrice;
        const requestedQuantity = originalPayloadItem.requestedQuantity;
        const invItem = originalPayloadItem._invItem; // Use cached item for tag along lookups

        // Handle both camelCase and snake_case from different backends
        const onOrderQty = result.onOrderQuantity !== undefined ? result.onOrderQuantity : (result.ordered_quantity || 0);

        // Create the line item with the processed inventory data
        const partLineItem = {
          id: crypto.randomUUID(),
          inventory_item_id: resInvItemId || originalPayloadItem.inventoryItemId,
          qty: requestedQuantity, // Total requested quantity
          qty_on_order: onOrderQty, // Quantity that needs to be ordered
          hrs: 0,
          description: result.description || invItem.description || '',
          part_number: result.part_number || invItem.part_num || invItem.part_number || '',
          unit: result.unit || invItem.unit || '',
          parts_ea: calculatedPrice,
          tot_parts: requestedQuantity * calculatedPrice, // Total for full requested quantity
          labour: 0,
          total: requestedQuantity * calculatedPrice, // Total for full requested quantity
          taxable: workOrder?.default_taxable !== undefined ? workOrder.default_taxable : true,
          complete: false,
          bold: false,
          cost_ea: result.cost || invItem.cost || 0,
          Core_num: (result.core || invItem.core) ? requestedQuantity : 0,
          core_ret: 0,
          core_cost: result.core_cost || invItem.core_cost || 0,
          core_osamt: (result.core || invItem.core) ? ((result.core_cost || invItem.core_cost || 0) * requestedQuantity) : 0,
          inventory_processed: mode === 'work_order', // True for WO, False for Estimate
          is_other_charge: false,
          oc_total: 0,
          supplier_invoice_line_id: null,
          manually_inserted: false
        };

        partsToAdd.push(partLineItem);

        // Store the adjustment info for updating local inventory list in parent component
        if (mode === 'work_order') {
          inventoryAdjustments.push({
            inventoryItemId: result.inventoryItemId,
            newQOH: result.newInventoryQOH,
            newQOO: result.newInventoryQOO
          });
        }

        // Re-add TagAlong logic for the requested quantity
        if (invItem.tag_along_id) {
          const tagAlong = tagAlongs.find(ta => ta.id === invItem.tag_along_id);
          
          if (tagAlong && tagAlong.other_charge_id) {
            const otherCharge = otherCharges.find(oc => oc.id === tagAlong.other_charge_id);
            
            if (otherCharge) {
              const tagAlongTotal = (otherCharge.base_amount || 0) * requestedQuantity;
              
              const tagAlongLineItem = {
                id: `tagalong_${Date.now()}_${Math.random()}`,
                qty: requestedQuantity,
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
                other_charge_id: tagAlong.other_charge_id, // Track linked OtherChargeList ID
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

              partsToAdd.push(tagAlongLineItem);
            }
          }
        }
      });

    } catch (error) {
      console.error('Error in bulk part addition:', error);
      alert(`Failed to add parts: ${error.message}`);
      setLoading(false);
      return; // Stop here, nothing added
    }

    if (partsToAdd.length > 0) {
      onAddParts(partsToAdd, inventoryAdjustments);
      
      setSelectedParts([]);
      setSearchTerm('');
      setLoading(false);
      onClose();
    } else {
      alert('No parts were successfully added. Please try again.');
      setLoading(false);
    }
  };

  // Keyboard shortcut to add parts (Ctrl + Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (open && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddSelectedParts();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, handleAddSelectedParts]);

  const totalSelectedCost = selectedParts.reduce((sum, part) => 
    sum + (part.calculatedPrice * part.selectedQuantity), 0
  );

  const handleKeyDown = (e, item) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelectPart(item);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Get Part from Inventory
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
              <Input
                placeholder="Search by part number, description, or manufacturer (Press Enter)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-slate-400 dark:text-slate-500" />
              )}
            </div>

            {/* Error Message */}
            {searchError && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 rounded-md text-sm">
                {searchError}
              </div>
            )}

            {/* Two Column Layout */}
            <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
              {/* Left: Available Parts */}
              <div className="flex flex-col">
                <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">Available Parts</h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '400px' }}>
                  {activeSearchTerm.trim() === '' && !searching ? (
                    <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                      <div className="text-center px-6">
                        <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Enter a part # or description to view a part for selection.</p>
                      </div>
                    </div>
                  ) : (
                    inventoryResults.map(item => {
                      const selectedCount = selectedParts.filter(p => p.inventoryItemId === item.id).length;
                      const selectedQtyTotal = selectedParts
                        .filter(p => p.inventoryItemId === item.id)
                        .reduce((sum, p) => sum + (parseFloat(p.selectedQuantity) || 0), 0);
                      const selectedQtyDisplay = Number.isInteger(selectedQtyTotal)
                        ? selectedQtyTotal
                        : selectedQtyTotal.toFixed(2).replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/, '');
                      const tagAlong = item.tag_along_id ? tagAlongs.find(ta => ta.id === item.tag_along_id) : null;
                      
                      return (
                        <Card
                          key={item.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            selectedCount > 0 ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/40' : ''
                          }`}
                          onClick={() => handleSelectPart(item)}
                          tabIndex={0}
                          onKeyDown={(e) => handleKeyDown(e, item)}
                        >
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{item.part_number}</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{item.description}</p>
                              </div>
                              <div className="ml-2 flex flex-col items-end gap-1">
                                <Badge variant={item.quantity_on_hand > 0 ? 'default' : 'destructive'}>
                                  {item.quantity_on_hand || 0} {item.unit || 'ea'}
                                </Badge>
                                {selectedCount > 0 && (
                                  <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                                    Selected {selectedQtyDisplay}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                              <span>${(item.selling_price || 0).toFixed(2)}</span>
                              <div className="flex items-center gap-2">
                                {tagAlong && (
                                  <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                                    + {tagAlong.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Selected Parts */}
              <div className="flex flex-col">
                <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">Selected Parts ({selectedParts.length})</h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {selectedParts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                      <div className="text-center">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No parts selected</p>
                      </div>
                    </div>
                  ) : (
                    selectedParts.map(part => {
                      const originalInvItem = inventoryResults.find(item => item.id === part.inventoryItemId);
                      const tagAlong = originalInvItem?.tag_along_id ? tagAlongs.find(ta => ta.id === originalInvItem.tag_along_id) : null;
                      const otherCharge = tagAlong?.other_charge_id ? otherCharges.find(oc => oc.id === tagAlong.other_charge_id) : null;
                      const tagAlongTotal = otherCharge ? (otherCharge.base_amount || 0) * part.selectedQuantity : 0;
                      
                      return (
                        <Card key={part.selectionId} className="border-blue-200 dark:border-blue-800">
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{part.part_number}</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{part.description}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemovePart(part.selectionId)}
                                className="h-10 w-10 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-300"
                              >
                                <Trash2 className="w-5 h-5" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-2">
                              <Label className="text-xs">Qty:</Label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={part.selectedQuantity}
                                onChange={(e) => handleQuantityChange(part.selectionId, e.target.value)}
                                className="w-20 h-7 text-sm"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                @ ${part.calculatedPrice.toFixed(2)} ea
                              </span>
                            </div>

                            <div className="text-right">
                              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                Total: ${(part.calculatedPrice * part.selectedQuantity).toFixed(2)}
                              </p>
                            </div>

                            {tagAlong && otherCharge && (
                              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-purple-700 dark:text-purple-400 font-medium">
                                    + {tagAlong.name}
                                  </span>
                                  <span className="text-purple-700 dark:text-purple-400 font-semibold">
                                    ${tagAlongTotal.toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  {tagAlong.description}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {selectedParts.length} part{selectedParts.length !== 1 ? 's' : ''} selected
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Total Cost</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    <DollarSign className="inline w-5 h-5" />
                    {totalSelectedCost.toFixed(2)}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelectedParts}
                  disabled={selectedParts.length === 0 || loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Work Order
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity Prompt Dialog */}
      <Dialog open={showQuantityPrompt} onOpenChange={handleCancelQuantityPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quantity to add to work order</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {partForQuantityPrompt && (
              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="font-semibold">{partForQuantityPrompt.part_number}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{partForQuantityPrompt.description}</p>
              </div>
            )}
            <Label htmlFor="quantity-input">Quantity</Label>
            <Input
              id="quantity-input"
              type="number"
              min="0"
              step="any"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmQuantity();
                }
              }}
              className="mt-2"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelQuantityPrompt}>
              Cancel
            </Button>
            <Button onClick={handleConfirmQuantity} className="bg-blue-600 hover:bg-blue-700">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}