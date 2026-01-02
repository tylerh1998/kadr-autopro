import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InventoryItem, InventoryCategory } from '@/entities/all';
import { TagAlong } from "@/entities/TagAlong";
import { base44 } from '@/api/base44Client';
import { Save, Loader2, Search, Check, AlertCircle } from "lucide-react";

export default function InventoryEditModal({ open, onClose, item, onUpdate, suppliers, salesClasses, inventoryLocations }) {
    const [formData, setFormData] = useState({
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
    const [loading, setLoading] = useState(false);
    const [calculatedMargin, setCalculatedMargin] = useState('');
    const [tagAlongs, setTagAlongs] = useState([]);
    const [inventoryCategories, setInventoryCategories] = useState([]);
    const [searchOpen, setSearchOpen] = useState(false);

    const filteredLocations = React.useMemo(() => {
        if (!formData.location) return inventoryLocations || [];
        const searchLower = formData.location.toLowerCase();
        return (inventoryLocations || []).filter(loc => 
            (loc.location_name || '').toLowerCase().includes(searchLower)
        );
    }, [formData.location, inventoryLocations]);

    const calculatePriceFromSalesClass = useCallback((costValue, salesClassId) => {
        if (!costValue || !salesClassId || !salesClasses || salesClasses.length === 0) return null;

        const selectedSalesClass = salesClasses.find(sc => sc.id === salesClassId);
        if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return null;

        try {
            const parsedData = JSON.parse(selectedSalesClass.pricing_matrix);
            if (!Array.isArray(parsedData)) {
                console.warn(`Pricing matrix for sales class "${selectedSalesClass.name}" is not a valid array.`, parsedData);
                return null;
            }
            const pricingRanges = parsedData;
            const parsedCost = parseFloat(costValue);

            const matchingRange = pricingRanges.find(range => {
                const minCost = parseFloat(range.min_cost);
                const maxCost = parseFloat(range.max_cost);
                return parsedCost >= minCost && parsedCost <= maxCost;
            });

            if (matchingRange) {
                const margin = parseFloat(matchingRange.margin);
                const sellingPrice = parsedCost / (1 - (margin / 100));
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

    // Effect to load data when the modal opens
    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        try {
            const [tagAlongsData, categoriesData] = await Promise.all([
                TagAlong.list(),
                InventoryCategory.list()
            ]);
            setTagAlongs(tagAlongsData);
            setInventoryCategories(categoriesData);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    useEffect(() => {
        if (open) {
            if (item) {
                setFormData({
                    part_number: item.part_number || "",
                    description: item.description || "",
                    unit: item.unit || "",
                    category: item.category || "",
                    supplier_id: item.supplier_id || "",
                    manufacturer: item.manufacturer || "",
                    cost: item.cost?.toString() || "",
                    selling_price: item.selling_price?.toString() || "",
                    sales_class: item.sales_class || "",
                    profit_margin: item.profit_margin?.toString() || "",
                    quantity_on_hand: item.quantity_on_hand?.toString() || "0",
                    minimum_quantity: item.minimum_quantity?.toString() || "",
                    maximum_quantity: item.maximum_quantity?.toString() || "",
                    location: item.location || "",
                    stocked_item: item.stocked_item !== undefined ? item.stocked_item : true,
                    core: item.core || false,
                    core_cost: item.core_cost?.toString() || "",
                    tag_along_id: item.tag_along_id || "",
                    is_active: item.is_active !== undefined ? item.is_active : true,
                });

                if (item.cost && item.sales_class) {
                    const calculation = calculatePriceFromSalesClass(item.cost, item.sales_class);
                    if (calculation) {
                        setCalculatedMargin(calculation.margin);
                    } else {
                        calculateMargin(item.cost, item.selling_price);
                    }
                } else {
                    calculateMargin(item.cost, item.selling_price);
                }
            } else {
                // Reset form if no item (shouldn't happen for edit modal but good practice)
                setFormData({
                    part_number: "", description: "", unit: "", category: "", supplier_id: "", manufacturer: "",
                    cost: "", selling_price: "", sales_class: "", profit_margin: "", quantity_on_hand: "",
                    minimum_quantity: "", maximum_quantity: "", location: "", stocked_item: true,
                    core: false, core_cost: "", tag_along_id: "", is_active: true,
                });
                setCalculatedMargin('');
            }
        }
    }, [open, item, calculatePriceFromSalesClass]);

    const calculateMargin = (costStr, sellingPriceStr) => {
        if (costStr && sellingPriceStr) {
            const cost = parseFloat(costStr);
            const sellingPrice = parseFloat(sellingPriceStr);
            if (cost > 0 && sellingPrice > 0 && sellingPrice > cost) {
                const margin = ((sellingPrice - cost) / sellingPrice) * 100;
                setCalculatedMargin(margin.toFixed(2));
            } else if (cost === 0 && sellingPrice > 0) {
                setCalculatedMargin('100.00');
            } else {
                setCalculatedMargin('');
            }
        } else {
            setCalculatedMargin('');
        }
    }

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
                        // Manual margin calc if no sales class match
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
            return newFormData;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newCost = parseFloat(formData.cost) || 0;
            const oldCost = parseFloat(item.cost) || 0;
            const qoh = parseInt(item.quantity_on_hand, 10) || 0;

            const dataToSubmit = {
                ...formData,
                cost: newCost,
                selling_price: parseFloat(formData.selling_price) || 0,
                profit_margin: parseFloat(formData.profit_margin) || 0,
                // quantity_on_hand is not updatable here, we use the original item's value or existing value logic if we wanted to allow edits (but usually it's locked)
                // However, the original code passed parseInt(formData.quantity_on_hand), so we keep that if it was editable, 
                // but since it's disabled in the UI, it just sends back what was there.
                quantity_on_hand: parseInt(formData.quantity_on_hand, 10) || 0,
                minimum_quantity: parseInt(formData.minimum_quantity, 10) || 0,
                maximum_quantity: parseInt(formData.maximum_quantity, 10) || 0,
                core_cost: parseFloat(formData.core_cost) || 0,
                supplier_id: formData.supplier_id === "" ? null : formData.supplier_id,
                sales_class: formData.sales_class === "" ? null : formData.sales_class,
                location: formData.location === "" ? null : formData.location,
                tag_along_id: formData.tag_along_id === "" ? null : formData.tag_along_id,
                manufacturer: formData.manufacturer === "" ? null : formData.manufacturer,
                is_active: formData.is_active,
                unit: formData.unit === "" ? null : formData.unit,
                category: formData.category === "none" || formData.category === "" ? null : formData.category,
            };

            const updatedItem = await InventoryItem.update(item.id, dataToSubmit);

            // Create GL entry if cost changed and QOH > 0
            if (newCost !== oldCost && qoh > 0) {
                const costDifference = newCost - oldCost;
                const adjustmentAmount = Math.abs(costDifference * qoh);
                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const description = `Price adjustment: ${item.part_number} (${qoh} x $${costDifference.toFixed(2)})`;

                if (costDifference > 0) {
                    await base44.entities.GLTransaction.create({
                        transaction_date: today,
                        account_number: '1200',
                        description: description,
                        debit_amount: adjustmentAmount,
                        credit_amount: 0,
                        reference: `INV-ADJ: ${item.part_number}`,
                        source_type: 'adjustment',
                        source_id: item.id
                    });
                    await base44.entities.GLTransaction.create({
                        transaction_date: today,
                        account_number: '5004',
                        description: description,
                        debit_amount: 0,
                        credit_amount: adjustmentAmount,
                        reference: `INV-ADJ: ${item.part_number}`,
                        source_type: 'adjustment',
                        source_id: item.id
                    });
                } else {
                    await base44.entities.GLTransaction.create({
                        transaction_date: today,
                        account_number: '1200',
                        description: description,
                        debit_amount: 0,
                        credit_amount: adjustmentAmount,
                        reference: `INV-ADJ: ${item.part_number}`,
                        source_type: 'adjustment',
                        source_id: item.id
                    });
                    await base44.entities.GLTransaction.create({
                        transaction_date: today,
                        account_number: '5004',
                        description: description,
                        debit_amount: adjustmentAmount,
                        credit_amount: 0,
                        reference: `INV-ADJ: ${item.part_number}`,
                        source_type: 'adjustment',
                        source_id: item.id
                    });
                }
            }

            onUpdate(updatedItem);
            onClose();
        } catch (error) {
            console.error("Failed to update item:", error);
            alert("Failed to update item. See console for details.");
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Inventory Item</DialogTitle>
                    <DialogDescription>
                        Make changes to the inventory item here. Click save when you're done.
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
                                className="bg-gray-100"
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
                                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={searchOpen}
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
                                                        setSearchOpen(false);
                                                    }}
                                                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
                                                >
                                                    <span className="text-slate-500 italic">No Location</span>
                                                    {(!formData.location || formData.location === '') && <Check className="ml-auto h-4 w-4" />}
                                                </div>
                                                {filteredLocations.length === 0 ? (
                                                    <div className="py-2 text-center text-sm text-slate-500">No locations found.</div>
                                                ) : (
                                                    filteredLocations.map((loc) => (
                                                        <div
                                                            key={loc.id}
                                                            onClick={() => {
                                                                handleInputChange('location', loc.location_name);
                                                                setSearchOpen(false);
                                                            }}
                                                            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
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
                            <Label htmlFor="category">Category</Label>
                            <Select 
                                value={formData.category || 'none'} 
                                onValueChange={(val) => handleInputChange('category', val === 'none' ? '' : val)}
                            >
                                <SelectTrigger>
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
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Changes
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