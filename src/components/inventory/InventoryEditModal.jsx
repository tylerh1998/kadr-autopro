import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InventoryItem } from '@/entities/all';
import { TagAlong } from "@/entities/TagAlong";
import { base44 } from '@/api/base44Client';
import { Save, Loader2 } from "lucide-react";

export default function InventoryEditModal({ open, onClose, item, onUpdate, suppliers, salesClasses, inventoryLocations }) {
    const [formData, setFormData] = useState({
        part_number: "",
        description: "",
        unit: "", // NEW: Add unit field
        category: "other",
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
                const sellingPrice = parsedCost * (1 + margin / 100);
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

    // Effect to load tag alongs when the modal opens
    useEffect(() => {
        if (open) {
            loadTagAlongs();
        }
    }, [open]);

    const loadTagAlongs = async () => {
        try {
            const tagAlongsData = await TagAlong.list();
            setTagAlongs(tagAlongsData);
        } catch (error) {
            console.error('Error loading tag alongs:', error);
        }
    };

    useEffect(() => {
        if (open) {
            if (item) {
                setFormData({
                    part_number: item.part_number || "",
                    description: item.description || "",
                    unit: item.unit || "", // NEW: Load unit value
                    category: item.category || "other",
                    supplier_id: item.supplier_id || "",
                    manufacturer: item.manufacturer || "",
                    cost: item.cost?.toString() || "",
                    selling_price: item.selling_price?.toString() || "",
                    sales_class: item.sales_class || "",
                    profit_margin: item.profit_margin?.toString() || "",
                    quantity_on_hand: item.quantity_on_hand?.toString() || "",
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
                        if (item.cost && item.selling_price) {
                            const cost = parseFloat(item.cost);
                            const sellingPrice = parseFloat(item.selling_price);
                            if (cost > 0 && sellingPrice > 0 && sellingPrice > cost) {
                                const margin = ((sellingPrice - cost) / sellingPrice) * 100;
                                setCalculatedMargin(margin.toFixed(2));
                            } else {
                                setCalculatedMargin('');
                            }
                        } else {
                            setCalculatedMargin('');
                        }
                    }
                } else if (item.cost && item.selling_price) {
                    const cost = parseFloat(item.cost);
                    const sellingPrice = parseFloat(item.selling_price);
                    if (cost > 0 && sellingPrice > 0 && sellingPrice > cost) {
                        const margin = ((sellingPrice - cost) / sellingPrice) * 100;
                        setCalculatedMargin(margin.toFixed(2));
                    } else {
                        setCalculatedMargin('');
                    }
                } else {
                    setCalculatedMargin('');
                }
            } else {
                setFormData({
                    part_number: "", description: "", unit: "", category: "other", supplier_id: "", manufacturer: "",
                    cost: "", selling_price: "", sales_class: "", profit_margin: "", quantity_on_hand: "",
                    minimum_quantity: "", maximum_quantity: "", location: "", stocked_item: true,
                    core: false, core_cost: "", tag_along_id: "", is_active: true,
                });
                setCalculatedMargin('');
            }
        }
    }, [open, item, calculatePriceFromSalesClass]);

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
                        if (field === 'sales_class' || field === 'cost') {
                            newFormData.selling_price = "";
                            newFormData.profit_margin = "";
                            newCalculatedMargin = '';
                        }
                    }
                } else {
                    if (field === 'sales_class' || field === 'cost') {
                        newFormData.selling_price = "";
                        newFormData.profit_margin = "";
                        newCalculatedMargin = '';
                    }
                }
            }
            else if (field === 'selling_price') {
                if (currentCost > 0 && currentSellingPrice > 0 && currentSellingPrice > currentCost) {
                    const margin = ((currentSellingPrice - currentCost) / currentSellingPrice) * 100;
                    newFormData.profit_margin = margin.toFixed(2);
                    newCalculatedMargin = margin.toFixed(2);
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
                    newFormData.selling_price = "";
                    newCalculatedMargin = '';
                }
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
                    // Cost increased: Debit Inventory (1200), Credit Price Adjustments (5004)
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
                    // Cost decreased: Credit Inventory (1200), Debit Price Adjustments (5004)
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

    const categories = ["oil_fluids", "filters", "brakes", "engine", "transmission", "electrical", "tires", "belts_hoses", "suspension", "exhaust", "other"];

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"> {/* Changed max-w */}
                <DialogHeader>
                    <DialogTitle>Edit Inventory Item</DialogTitle>
                    <DialogDescription>
                        Make changes to the inventory item here. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6"> {/* Added space-y-6 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="part_number">Part Number *</Label>
                            <Input
                                id="part_number"
                                value={formData.part_number}
                                onChange={(e) => handleInputChange("part_number", e.target.value.toUpperCase())}
                                required
                            />
                        </div>

                        <div>
                            <Label htmlFor="category">Category</Label>
                            <Select value={formData.category || 'other'} onValueChange={(val) => handleInputChange('category', val)}>
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
                                onChange={(e) => handleInputChange("description", e.target.value)}
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

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="manufacturer">Manufacturer</Label>
                            <Input
                                id="manufacturer"
                                value={formData.manufacturer}
                                onChange={(e) => handleInputChange("manufacturer", e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="supplier_id">Supplier</Label>
                            <Select value={formData.supplier_id} onValueChange={(value) => handleInputChange("supplier_id", value === 'none' ? '' : value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {suppliers.map((supplier) => (
                                        <SelectItem key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="sales_class">Sales Class</Label>
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
                        <div>
                            <Label htmlFor="cost">Cost *</Label>
                            <Input
                                id="cost"
                                type="number"
                                step="0.01"
                                value={formData.cost}
                                onChange={(e) => handleInputChange("cost", e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600">
                                        {calculatedMargin}%
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="quantity_on_hand">Qty On Hand</Label>
                            <Input
                                id="quantity_on_hand"
                                type="number"
                                value={formData.quantity_on_hand}
                                disabled
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Tag Along Field */}
                        <div>
                            <Label htmlFor="tag_along_id">Tag Along</Label>
                            <Select
                                value={formData.tag_along_id}
                                onValueChange={(value) => handleInputChange('tag_along_id', value === 'none' ? '' : value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select tag along (optional)" />
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="core" checked={formData.core} onCheckedChange={(checked) => handleInputChange('core', checked)} />
                            <Label htmlFor="core">Core Item</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="is_active" checked={formData.is_active} onCheckedChange={(checked) => handleInputChange('is_active', checked)} />
                            <Label htmlFor="is_active">Is Active</Label>
                        </div>
                    </div>
                    {formData.core && (
                        <div>
                            <Label htmlFor="core_cost">Core Cost</Label>
                            <Input
                                id="core_cost"
                                type="number"
                                step="0.01"
                                value={formData.core_cost}
                                onChange={(e) => handleInputChange('core_cost', e.target.value)}
                            />
                        </div>
                    )}

                    <div className="flex items-center space-x-2 mt-2">
                        <Checkbox id="stocked_item" checked={formData.stocked_item} onCheckedChange={(checked) => handleInputChange('stocked_item', checked)} />
                        <Label htmlFor="stocked_item">Stocked Item</Label>
                    </div>
                    {formData.stocked_item && (
                        <div className="grid grid-cols-3 gap-4 pl-6">
                            <div className="space-y-1">
                                <Label htmlFor="minimum_quantity">Minimum</Label>
                                <Input
                                    id="minimum_quantity"
                                    type="number"
                                    value={formData.minimum_quantity}
                                    onChange={(e) => handleInputChange('minimum_quantity', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="maximum_quantity">Maximum</Label>
                                <Input
                                    id="maximum_quantity"
                                    type="number"
                                    value={formData.maximum_quantity}
                                    onChange={(e) => handleInputChange('maximum_quantity', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="location">Location</Label>
                                <Select value={formData.location} onValueChange={(val) => handleInputChange('location', val === 'none' ? '' : val)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {inventoryLocations.map(loc => (
                                            <SelectItem key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}