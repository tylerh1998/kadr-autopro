
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagAlong } from "@/entities/TagAlong";

export default function InventoryAddModal({ open, onClose, onAdd, suppliers, salesClasses, inventoryLocations }) {
    const [tagAlongs, setTagAlongs] = useState([]);
    const [formData, setFormData] = useState({
        part_number: "",
        description: "",
        unit: "", // NEW: Add unit field
        category: "other",
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

    const resetForm = () => {
        setFormData({
            part_number: "",
            description: "",
            unit: "", // Reset unit
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
        setCalculatedMargin('');
    };

    useEffect(() => {
        if (open) {
            resetForm();
            loadTagAlongs();
        }
    }, [open]);

    const loadTagAlongs = async () => {
        try {
            const tagAlongsData = await TagAlong.list();
            setTagAlongs(tagAlongsData);
        } catch (error) {
            console.error('Error loading tag alongs:', error);
            // Optionally, handle error display to the user
        }
    };

    const calculatePriceFromSalesClass = useCallback((cost, salesClassId) => {
        if (!cost || !salesClassId || !salesClasses) return null;

        const selectedSalesClass = salesClasses.find(sc => sc.id === salesClassId);
        if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return null;

        try {
            const parsedData = JSON.parse(selectedSalesClass.pricing_matrix);
            // Ensure pricing_matrix is an array. If it's an object `{}`, this will fail gracefully.
            if (!Array.isArray(parsedData)) {
                console.warn(`Pricing matrix for sales class "${selectedSalesClass.name}" is not a valid array.`, parsedData);
                return null;
            }
            const pricingRanges = parsedData;
            const costValue = parseFloat(cost);

            // Find the matching range based on cost
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
                    // Do not update calculatedMargin here as it's driven by direct input
                } else if (cost === 0 && margin === 100) {
                    newFormData.selling_price = ""; // Cannot determine selling price with 0 cost and 100% margin
                } else {
                    newFormData.selling_price = "";
                }
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
                // Convert numeric string fields to actual numbers
                cost: parseFloat(formData.cost) || 0,
                selling_price: parseFloat(formData.selling_price) || 0,
                profit_margin: parseFloat(formData.profit_margin) || 0,
                quantity_on_hand: parseInt(formData.quantity_on_hand, 10) || 0,
                minimum_quantity: formData.minimum_quantity === "" ? null : parseInt(formData.minimum_quantity, 10),
                maximum_quantity: formData.maximum_quantity === "" ? null : parseInt(formData.maximum_quantity, 10),
                core_cost: parseFloat(formData.core_cost) || 0,
                // Ensure IDs and location are null if empty string
                supplier_id: formData.supplier_id === "" ? null : formData.supplier_id,
                sales_class: formData.sales_class === "" ? null : formData.sales_class,
                location: formData.location === "" ? null : formData.location,
                tag_along_id: formData.tag_along_id === "" ? null : formData.tag_along_id,
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

    const categories = ["oil_fluids", "filters", "brakes", "engine", "transmission", "electrical", "tires", "belts_hoses", "suspension", "exhaust", "other"];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add New Inventory Item</DialogTitle>
                    <DialogDescription>
                        Fill in the details below to add a new inventory item to your system.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="part_number">Part Number *</Label>
                            <Input
                                id="part_number"
                                value={formData.part_number}
                                onChange={(e) => handleInputChange("part_number", e.target.value)}
                                required
                            />
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <div className="flex items-center space-x-2">
                            <Checkbox id="core" checked={formData.core} onCheckedChange={(checked) => handleInputChange('core', checked)} />
                            <Label htmlFor="core">Core Item</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="stocked_item" checked={formData.stocked_item} onCheckedChange={(checked) => handleInputChange('stocked_item', checked)} />
                            <Label htmlFor="stocked_item">Stocked Item</Label>
                        </div>
                    </div>

                    {formData.core && (
                        <div className="grid grid-cols-4 items-center gap-4 pl-6">
                            <Label htmlFor="core_cost" className="text-right">Core Cost</Label>
                            <Input
                                id="core_cost"
                                type="number"
                                step="0.01"
                                value={formData.core_cost}
                                onChange={(e) => handleInputChange('core_cost', e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                    )}

                    {formData.stocked_item && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-6">
                            <div className="space-y-1">
                                <Label htmlFor="quantity_on_hand">QOH</Label>
                                <Input
                                    id="quantity_on_hand"
                                    type="number"
                                    value={formData.quantity_on_hand}
                                    onChange={(e) => handleInputChange('quantity_on_hand', e.target.value)}
                                />
                            </div>
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
                                <Select value={formData.location} onValueChange={(value) => handleInputChange("location", value === 'none' ? '' : value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {inventoryLocations.map((loc) => (
                                            <SelectItem key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {/* Tag Along Field */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="tag_along_id" className="text-right">Tag Along</Label>
                        <Select
                            value={formData.tag_along_id}
                            onValueChange={(value) => handleInputChange('tag_along_id', value === 'null' ? null : value)}
                        >
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select tag along (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="null">None</SelectItem>
                                {tagAlongs.map((tagAlong) => (
                                    <SelectItem key={tagAlong.id} value={tagAlong.id}>
                                        {tagAlong.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} type="button" disabled={loading}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Adding..." : "Add Item"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
