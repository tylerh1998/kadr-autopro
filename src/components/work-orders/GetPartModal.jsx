import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Minus, Package, DollarSign, ShoppingCart, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SalesClass, TagAlong, OtherChargeList } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { debounce } from 'lodash';

export default function GetPartModal({ open, onClose, onAddParts, contextLineItem, workOrder }) {
  const [searchTerm, setSearchTerm] = useState('');
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

  // Fetch initial data and default inventory on modal open
  useEffect(() => {
    const fetchData = async () => {
      try {
        setSearching(true);
        setSearchError('');
        
        const [salesClassesData, tagAlongsData, otherChargesData, defaultInventory] = await Promise.all([
          SalesClass.list(),
          TagAlong.list(),
          OtherChargeList.list(),
          base44.functions.invoke('searchInventory', { limit: 50 })
        ]);
        
        setSalesClasses(salesClassesData || []);
        setTagAlongs(tagAlongsData || []);
        setOtherCharges(otherChargesData || []);
        
        if (defaultInventory?.data?.records) {
          setInventoryResults(defaultInventory.data.records);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setSearchError('Failed to load inventory. Please try again.');
      } finally {
        setSearching(false);
      }
    };

    if (open) {
      fetchData();
    } else {
      // Clear state when modal closes
      setInventoryResults([]);
      setSearchTerm('');
      setSelectedParts([]);
      setSearchError('');
    }
  }, [open]);

  // Handle contextLineItem auto-selection
  useEffect(() => {
    const handleContextItem = async () => {
      if (open && contextLineItem && contextLineItem.part_number && !showQuantityPrompt) {
        try {
          setSearching(true);
          const response = await base44.functions.invoke('searchInventory', {
            searchTerm: contextLineItem.part_number,
            limit: 50
          });
          
          if (response?.data?.records && response.data.records.length > 0) {
            const matchingItem = response.data.records.find(
              item => item.part_number === contextLineItem.part_number
            );
            
            if (matchingItem && !selectedParts.find(p => p.id === matchingItem.id)) {
              setPartForQuantityPrompt(matchingItem);
              setQuantityInput(contextLineItem.qty ? String(contextLineItem.qty) : '1');
              setShowQuantityPrompt(true);
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
  }, [open, contextLineItem, selectedParts, showQuantityPrompt]);

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce(async (term) => {
      setSearching(true);
      setSearchError('');
      try {
        const response = await base44.functions.invoke('searchInventory', {
          searchTerm: term,
          limit: 100
        });
        
        if (response?.data?.records) {
          setInventoryResults(response.data.records);
        } else {
          setInventoryResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchError('Search failed. Please try again.');
        setInventoryResults([]);
      } finally {
        setSearching(false);
      }
    }, 300),
    []
  );

  // Handle search term changes
  useEffect(() => {
    if (searchTerm.trim() === '') {
      // If search is cleared, load default 50 items
      const loadDefault = async () => {
        setSearching(true);
        setSearchError('');
        try {
          const response = await base44.functions.invoke('searchInventory', { limit: 50 });
          if (response?.data?.records) {
            setInventoryResults(response.data.records);
          }
        } catch (error) {
          console.error('Error loading default inventory:', error);
          setSearchError('Failed to load inventory. Please try again.');
        } finally {
          setSearching(false);
        }
      };
      loadDefault();
    } else {
      debouncedSearch(searchTerm);
    }
  }, [searchTerm, debouncedSearch]);

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
    const existingPart = selectedParts.find(p => p.id === item.id);
    if (existingPart) {
      return;
    }

    // Show quantity prompt dialog
    setPartForQuantityPrompt(item);
    setQuantityInput('1');
    setShowQuantityPrompt(true);
  };

  const handleConfirmQuantity = () => {
    if (!partForQuantityPrompt) return;
    
    const qty = parseInt(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity greater than 0');
      return;
    }

    const pricePerUnit = calculatePrice(partForQuantityPrompt, qty);
    
    setSelectedParts(prev => [...prev, {
      ...partForQuantityPrompt,
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

  const handleQuantityChange = (itemId, newQuantity) => {
    const qty = Math.max(0, parseInt(newQuantity) || 0);
    setSelectedParts(prev => prev.map(part => {
      if (part.id === itemId) {
        const newPrice = calculatePrice(part, qty);
        return { ...part, selectedQuantity: qty, calculatedPrice: newPrice };
      }
      return part;
    }));
  };

  const handleRemovePart = (itemId) => {
    setSelectedParts(prev => prev.filter(p => p.id !== itemId));
  };

  const handleAddSelectedParts = async () => {
    if (selectedParts.length === 0) {
      alert('Please select at least one part to add.');
      return;
    }
    setLoading(true);

    const partsToAdd = [];
    const inventoryAdjustments = [];

    for (const selectedPart of selectedParts) {
      const invItem = inventoryResults.find(item => item.id === selectedPart.id);
      if (!invItem) {
        console.warn(`Inventory item with ID ${selectedPart.id} not found.`);
        continue;
      }

      const requestedQuantity = selectedPart.selectedQuantity;

      // Call the backend function to adjust inventory
      try {
        const adjustmentResponse = await base44.functions.invoke('WOGetPart', {
          inventoryItemId: invItem.id,
          requestedQuantity: requestedQuantity,
          workOrderId: workOrder.id,
          roNumber: workOrder.ro_number,
          lineDescription: invItem.description,
          linePartNumber: invItem.part_number
        });

        if (!adjustmentResponse.data.success) {
          alert(`Failed to adjust inventory for ${invItem.part_number}: ${adjustmentResponse.data.message}`);
          continue;
        }

        const { issuedQuantity, onOrderQuantity, newInventoryQOH, newInventoryQOO } = adjustmentResponse.data;

        // Create the line item with the processed inventory data
        const partLineItem = {
          id: Date.now() + Math.random(),
          inventory_item_id: invItem.id,
          qty: requestedQuantity, // Total requested quantity
          qty_on_order: onOrderQuantity, // Quantity that needs to be ordered
          hrs: 0,
          description: invItem.description || '',
          part_number: invItem.part_number || '',
          unit: invItem.unit || '',
          parts_ea: selectedPart.calculatedPrice,
          tot_parts: requestedQuantity * selectedPart.calculatedPrice, // Total for full requested quantity
          labour: 0,
          total: requestedQuantity * selectedPart.calculatedPrice, // Total for full requested quantity
          taxable: workOrder?.default_taxable !== undefined ? workOrder.default_taxable : true,
          complete: false,
          bold: false,
          cost_ea: invItem.cost || 0,
          Core_num: invItem.core ? 1 : 0,
          core_ret: 0,
          core_cost: invItem.core_cost || 0,
          core_osamt: invItem.core ? (invItem.core_cost || 0) : 0,
          inventory_processed: true,
          is_other_charge: false,
          oc_total: 0,
          supplier_invoice_line_id: null,
          manually_inserted: false
        };

        partsToAdd.push(partLineItem);

        // Store the adjustment info for updating local inventory list in parent component
        inventoryAdjustments.push({
          inventoryItemId: invItem.id,
          newQOH: newInventoryQOH,
          newQOO: newInventoryQOO
        });

        // Re-add TagAlong logic for the requested quantity
        if (invItem.tag_along_id) {
          const tagAlong = tagAlongs.find(ta => ta.id === invItem.tag_along_id);
          
          if (tagAlong && tagAlong.other_charge_id) {
            const otherCharge = otherCharges.find(oc => oc.id === tagAlong.other_charge_id);
            
            if (otherCharge) {
              const tagAlongTotal = (otherCharge.base_amount || 0) * requestedQuantity;
              
              const tagAlongLineItem = {
                id: Date.now() + Math.random() + 0.1,
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
                complete: false,
                bold: false,
                is_other_charge: true,
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

      } catch (error) {
        console.error('Error calling WOGetPart:', error);
        alert(`Failed to process inventory for ${invItem.part_number}. Please try again.`);
      }
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

  const totalSelectedCost = selectedParts.reduce((sum, part) => 
    sum + (part.calculatedPrice * part.selectedQuantity), 0
  );

  const handleKeyDown = (e, item, isSelected) => {
    if ((e.key === 'Enter' || e.key === ' ') && !isSelected) {
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by part number, description, or manufacturer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
              )}
            </div>

            {/* Error Message */}
            {searchError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
                {searchError}
              </div>
            )}

            {/* Two Column Layout */}
            <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
              {/* Left: Available Parts */}
              <div className="flex flex-col">
                <h3 className="font-semibold mb-2 text-slate-700">Available Parts</h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '400px' }}>
                  {inventoryResults.map(item => {
                    const isSelected = selectedParts.some(p => p.id === item.id);
                    const tagAlong = item.tag_along_id ? tagAlongs.find(ta => ta.id === item.tag_along_id) : null;
                    
                    return (
                      <Card
                        key={item.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          isSelected ? 'border-blue-500 bg-blue-50' : ''
                        }`}
                        onClick={() => !isSelected && handleSelectPart(item)}
                        tabIndex={0}
                        onKeyDown={(e) => handleKeyDown(e, item, isSelected)}
                      >
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{item.part_number}</p>
                              <p className="text-xs text-slate-600">{item.description}</p>
                            </div>
                            <Badge variant={item.quantity_on_hand > 0 ? 'default' : 'destructive'} className="ml-2">
                              {item.quantity_on_hand || 0} {item.unit || 'ea'}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center text-xs text-slate-500">
                            <span>${(item.selling_price || 0).toFixed(2)}</span>
                            {tagAlong && (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                + {tagAlong.name}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Parts */}
              <div className="flex flex-col">
                <h3 className="font-semibold mb-2 text-slate-700">Selected Parts ({selectedParts.length})</h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {selectedParts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <div className="text-center">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No parts selected</p>
                      </div>
                    </div>
                  ) : (
                    selectedParts.map(part => {
                      const originalInvItem = inventoryResults.find(item => item.id === part.id);
                      const tagAlong = originalInvItem?.tag_along_id ? tagAlongs.find(ta => ta.id === originalInvItem.tag_along_id) : null;
                      const otherCharge = tagAlong?.other_charge_id ? otherCharges.find(oc => oc.id === tagAlong.other_charge_id) : null;
                      const tagAlongTotal = otherCharge ? (otherCharge.base_amount || 0) * part.selectedQuantity : 0;
                      
                      return (
                        <Card key={part.id} className="border-blue-200">
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{part.part_number}</p>
                                <p className="text-xs text-slate-600">{part.description}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePart(part.id)}
                                className="h-6 w-6 p-0"
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-2">
                              <Label className="text-xs">Qty:</Label>
                              <Input
                                type="number"
                                min="1"
                                value={part.selectedQuantity}
                                onChange={(e) => handleQuantityChange(part.id, e.target.value)}
                                className="w-20 h-7 text-sm"
                              />
                              <span className="text-xs text-slate-500">
                                @ ${part.calculatedPrice.toFixed(2)} ea
                              </span>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm font-semibold text-blue-600">
                                Total: ${(part.calculatedPrice * part.selectedQuantity).toFixed(2)}
                              </p>
                            </div>
                            
                            {tagAlong && otherCharge && (
                              <div className="mt-2 pt-2 border-t border-slate-200">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-purple-700 font-medium">
                                    + {tagAlong.name}
                                  </span>
                                  <span className="text-purple-700 font-semibold">
                                    ${tagAlongTotal.toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
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
                <div className="text-sm text-slate-600">
                  {selectedParts.length} part{selectedParts.length !== 1 ? 's' : ''} selected
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600">Total Cost</p>
                  <p className="text-2xl font-bold text-blue-600">
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
              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <p className="font-semibold">{partForQuantityPrompt.part_number}</p>
                <p className="text-sm text-slate-600">{partForQuantityPrompt.description}</p>
              </div>
            )}
            <Label htmlFor="quantity-input">Quantity</Label>
            <Input
              id="quantity-input"
              type="number"
              min="1"
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