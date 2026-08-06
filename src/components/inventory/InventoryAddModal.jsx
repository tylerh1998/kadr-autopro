import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Search, Check } from "lucide-react";

export default function InventoryAddModal({ open, onClose, onAdd, suppliers, salesClasses, inventoryLocations }) {
    const [tagAlongs, setTagAlongs] = useState([]);
    const [internalCategories, setInternalCategories] = useState([]);
    const [formData, setFormData] = useState({
        part_number: "",
        description: "",
        unit: "",
        category: "",
        supplier_id: "",
        manufacturer: "",
        sales_class: "",
        cost: "",
        selling_price: "",
        profit_margin: "",
        quantity_on_hand: "",
        minimum_quantity: "",
        maximum_quantity: "",
        location: "",
        core: false,
        core_cost: "",
        tag_along_id: "",
        stocked_item: true,
        is_active: true,
    });
    const [loading, setLoading] = useState(false);
    const [calculatedMargin, setCalculatedMargin] = useState('');
    const [locationSearchOpen, setLocationSearchOpen] = useState(false);
    
    // Smart Category State
    const [suggestingCategory, setSuggestingCategory] = useState(false);
    const [isCategorySuggested, setIsCategorySuggested] = useState(false);

    const filteredLocations = React.useMemo(() => {
        if (!formData.location) return inventoryLocations || [];
        const searchLower = formData.location.toLowerCase();
        return (inventoryLocations || []).filter(loc => 
            (loc.location_name || '').toLowerCase().includes(searchLower)
        );
    }, [formData.location, inventoryLocations]);

    const resetForm = () => {
        setFormData({
            part_number: "",
            description: "",
            unit: "",
            category: "",
            supplier_id: "",
            manufacturer: "",
            cost: "",
            selling_price: "",
            sales_class: "",
            profit_margin: "",
            quantity_on_hand: "",
            minimum_quantity: "",
            maximum_quantity: "",
            location: "",
            stocked_item: true,
            core: false,
            core_cost: "",
            tag_along_id: "",
            is_active: true,
        });
        setCalculatedMargin('');
        setIsCategorySuggested(false);
    };

    useEffect(() => {
        if (open) {
            resetForm();
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        try {
            const categoriesResult = await supabase.from('InventoryCategory').select('*').order('name');
            if (categoriesResult.error) {
                console.error('Error loading categories:', categoriesResult.error);
            }
            setInternalCategories(categoriesResult.data || []);
        } catch (error) {
            console.error('Error loading categories:', error);
        }

        try {
            const { data: tagAlongsData, error: tagAlongsError } = await supabase.from('TagAlong').select('*');
            if (tagAlongsError) throw tagAlongsError;
            setTagAlongs(tagAlongsData || []);
        } catch (error) {
            console.error('Error loading tag alongs:', error);
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
                    
                    const response = await supabase.functions.invoke('autopro-suggestInventoryCategory', {
                        body: {
                            part_number: formData.part_number,
                            description: formData.description,
                            supplier_name: supplierName
                        }
                    });

                    if (response.error) {
                        console.error('Category suggestion error:', response.error);
                        return;
                    }

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

            let newCalculatedMargin = '';

            const currentCost = parseFloat(field === 'cost' ? value : newFormData.cost);
            const currentSalesClass = field === 'sales_class' ? value : newFormData.sales_class;
            const currentSellingPrice = parseFloat(field === 'selling_price' ? value : newFormData.selling_price);

            if (field === 'cost' || field === 'sales_class') {
                if (currentCost > 0 && currentSalesClass) {
                    const calculation = calculatePriceFromSalesClass(currentCost, currentSalesClass);
                    if (calculation) {
                        newFormData.selling_price = calculation.sellingPrice;
                        newFormData.profit_margin = calculation.margin;
                        newCalculatedMargin = calculation.margin;
                    } else {
                        if (currentSellingPrice > 0) {
                             const margin = ((currentSellingPrice - currentCost) / currentSellingPrice) * 100;
                             newCalculatedMargin = margin.toFixed(2);
                        }
                    }
                } else if (currentCost > 0 && currentSellingPrice > 0) {
                     const margin = ((currentSellingPrice - currentCost) / currentSellingPrice) * 100;
                     newCalculatedMargin = margin.toFixed(2);
                }
            }
            else if (field === 'selling_price') {
                if (currentCost > 0 && currentSellingPrice > 0 && currentSellingPrice > currentCost) {
                    const margin = ((currentSellingPrice - currentCost) / currentSellingPrice) * 100;
                    newFormData.profit_margin = margin.toFixed(2);
                    newCalculatedMargin = margin.toFixed(2);
                } else if (currentCost === 0 && currentSellingPrice > 0) {
                    newFormData.profit_margin = "100.00";
                    newCalculatedMargin = "100.00";
                } else {
                    newFormData.profit_margin = "";
                    newCalculatedMargin = '';
                }
            }
            else if (field === 'profit_margin') {
                if (currentCost > 0 && parseFloat(value) >= 0 && parseFloat(value) < 100) {
                    const sellingPrice = currentCost / (1 - parseFloat(value) / 100);
                    newFormData.selling_price = sellingPrice.toFixed(2);
                    newCalculatedMargin = parseFloat(value).toFixed(2);
                } else {
                    newCalculatedMargin = '';
                }
            }

            if (field !== 'profit_margin' && newCalculatedMargin === '' && newFormData.profit_margin) {
                 newCalculatedMargin = newFormData.profit_margin;
            }

            setCalculatedMargin(newCalculatedMargin);
            
            // Reset smart category highlight if user manually changes category
            if (field === 'category') {
                setIsCategorySuggested(false);
            }
            
            return newFormData;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.part_number || !formData.description || !formData.cost || !formData.selling_price) {
            alert('Part Number, Description, Cost, and Selling Price are required.');
            return;
        }

        setLoading(true);
        try {
            const itemToCreate = {
                ...formData,
                cost: parseFloat(formData.cost) || 0,
                selling_price: parseFloat(formData.selling_price) || 0,
                profit_margin: parseFloat(formData.profit_margin) || 0,
                quantity_on_hand: parseInt(formData.quantity_on_hand, 10) || 0,
                minimum_quantity: formData.minimum_quantity === "" ? null : parseInt(formData.minimum_quantity, 10),
                maximum_quantity: formData.maximum_quantity === "" ? null : parseInt(formData.maximum_quantity, 10),
                core_cost: parseFloat(formData.core_cost) || 0,
                supplier_id: formData.supplier_id === "" ? null : formData.supplier_id,
                sales_class: formData.sales_class === "" ? null : formData.sales_class,
                location: formData.location === "" ? null : formData.location,
                tag_along_id: formData.tag_along_id === "" ? null : formData.tag_along_id,
                manufacturer: formData.manufacturer === "" ? null : formData.manufacturer,
                category: formData.category === "" ? null : formData.category,
                unit: formData.unit === "" ? null : formData.unit,
            };

            await onAdd(itemToCreate);
            onClose();
        } catch (error) {
            console.error("Error from handleSubmit in modal:", error);
            alert("Failed to add item. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add New Inventory Item</DialogTitle>
                    <DialogDescription>
                        Fill in the details below to add a new inventory item to your system.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Supplier Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="supplier_id">Supplier</Label>
                            <Select value={formData.supplier_id} onValueChange={(value) => handleInputChange("supplier_id", value === 'none' ? '' : value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {[...suppliers]
                                        .filter(s => s.inventory_supplier)
                                        .sort((a, b) => {
                                            if (a.pin_to_top && !b.pin_to_top) return -1;
                                            if (!a.pin_to_top && b.pin_to_top) return 1;
                                            return (a.name || '').localeCompare(b.name || '');
                                        })
                                        .map((supplier) => (
                                        <SelectItem key={supplier.id} value={supplier.id}>
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
                            <Label htmlFor="part_number">Part Number *</Label>
                            <Input
                                id="part_number"
                                value={formData.part_number}
                                onChange={(e) => handleInputChange("part_number", e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                        <div className="space-y-2 col-span-1 md:col-span-2 grid grid-cols-3 gap-2">
                            <div className="space-y-2 col-span-2">
                                <Label htmlFor="description">Description *</Label>
                                <Input
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => handleInputChange("description", e.target.value.replace(/\b\w/g, l => l.toUpperCase()))}
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

                    {/* Row 2: Qty On Hand, Cost, Sales Class, Tag Along */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="quantity_on_hand">Qty On Hand</Label>
                            <Input
                                id="quantity_on_hand"
                                type="number"
                                value={formData.quantity_on_hand}
                                disabled
                                className="bg-gray-100 dark:bg-slate-800"
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
                            <Label htmlFor="tag_along_id">Tag Along</Label>
                            <Select
                                value={formData.tag_along_id}
                                onValueChange={(value) => handleInputChange('tag_along_id', value === 'none' ? '' : value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {tagAlongs.map((tagAlong) => (
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
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-green-600 dark:text-green-400">
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 bg-gray-50 dark:bg-slate-800/50 p-4 rounded-md">
                            <div className="space-y-2">
                                <Label htmlFor="minimum_quantity">Minimum</Label>
                                <Input
                                    id="minimum_quantity"
                                    type="number"
                                    value={formData.minimum_quantity}
                                    onChange={(e) => handleInputChange('minimum_quantity', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maximum_quantity">Maximum</Label>
                                <Input
                                    id="maximum_quantity"
                                    type="number"
                                    value={formData.maximum_quantity}
                                    onChange={(e) => handleInputChange('maximum_quantity', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="location">Location</Label>
                                <Popover open={locationSearchOpen} onOpenChange={setLocationSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={locationSearchOpen}
                                            className="w-full justify-between font-normal"
                                        >
                                            {formData.location || "Select location..."}
                                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Search locations..."
                                                value={formData.location || ''}
                                                onChange={(e) => handleInputChange('location', e.target.value)}
                                                className="mb-2"
                                                autoFocus
                                            />
                                            <div className="max-h-[200px] overflow-y-auto space-y-1">
                                                <div
                                                    onClick={() => {
                                                        handleInputChange('location', '');
                                                        setLocationSearchOpen(false);
                                                    }}
                                                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                                >
                                                    <span className="text-slate-500 dark:text-slate-400 italic">No Location</span>
                                                    {(!formData.location || formData.location === '') && <Check className="ml-auto h-4 w-4" />}
                                                </div>
                                                {filteredLocations.length === 0 ? (
                                                    <div className="py-2 text-center text-sm text-slate-500 dark:text-slate-400">No locations found.</div>
                                                ) : (
                                                    filteredLocations.map((loc) => (
                                                        <div
                                                            key={loc.id}
                                                            onClick={() => {
                                                                handleInputChange('location', loc.location_name);
                                                                setLocationSearchOpen(false);
                                                            }}
                                                            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                                        >
                                                            <span>{loc.location_name}</span>
                                                            {formData.location === loc.location_name && (
                                                                <Check className="ml-auto h-4 w-4" />
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}

                    {/* Row 4: Category, Is Active, Buttons */}
                    <div className="flex items-end justify-between gap-4 pt-4 border-t">
                        <div className="w-64 space-y-2">
                            <Label htmlFor="category">Category {suggestingCategory && <span className="text-xs text-blue-500 dark:text-blue-400 animate-pulse">(Suggesting...)</span>}</Label>
                            <Select 
                                value={formData.category || 'none'} 
                                onValueChange={(val) => handleInputChange('category', val === 'none' ? '' : val)}
                            >
                                <SelectTrigger className={isCategorySuggested ? "border-green-500 ring-1 ring-green-500" : ""}>
                                    <SelectValue placeholder="Select a category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {[...internalCategories]
                                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                        .map(cat => (
                                        <SelectItem key={cat.id} value={cat.name}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center space-x-2 pb-2">
                            <Checkbox 
                                id="is_active" 
                                checked={formData.is_active} 
                                onCheckedChange={(checked) => handleInputChange('is_active', checked)} 
                            />
                            <Label htmlFor="is_active" className="cursor-pointer">Is Active</Label>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose} type="button" disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Add Item
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