import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, Supplier, SalesClass, TagAlong, InventoryLocation } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Save, ArrowLeft, Plus, CalendarIcon, List, Trash2, Loader2, Lock, Truck, Check, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';

// Helper function to format date for input field (MM/DD/YYYY)
const formatDateForInput = (dateString) => {
    if (!dateString || dateString === '') return '';
    try {
        const parsed = parseISO(dateString);
        if (isNaN(parsed.getTime())) return '';
        return format(parsed, 'MM/dd/yyyy');
    } catch (error) {
        console.error('Date formatting error for input:', error, dateString);
        return '';
    }
};

// Helper function to parse and validate date input with autofill
const parseAndValidateDateInput = (inputDate) => {
    if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
    
    const trimmed = inputDate.trim();
    let month, day, year;
    
    try {
        const parts = trimmed.split('/');
        
        if (parts.length === 2) {
            // MM/DD format - autofill current year
            month = parts[0];
            day = parts[1];
            year = new Date().getFullYear().toString();
        } else if (parts.length === 3) {
            // MM/DD/YY or MM/DD/YYYY format
            month = parts[0];
            day = parts[1];
            year = parts[2];
            
            // Convert 2-digit year to 4-digit
            if (year.length === 2) {
                const currentYear = new Date().getFullYear();
                const currentCentury = Math.floor(currentYear / 100) * 100;
                const twoDigitYear = parseInt(year);
                year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
            }
        } else {
            return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
        }
        
        // Pad month and day
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
        
        // Validate numeric values
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
            return { valid: false, date: null, error: 'Date must contain valid numbers' };
        }
        
        if (monthNum < 1 || monthNum > 12) {
            return { valid: false, date: null, error: 'Month must be between 1 and 12' };
        }
        
        if (dayNum < 1 || dayNum > 31) {
            return { valid: false, date: null, error: 'Day must be between 1 and 31' };
        }
        
        if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) {
            return { valid: false, date: null, error: 'Year must be a valid 4-digit year (1900-2100)' };
        }
        
        // Create date and validate it's a real date
        const isoDate = `${year}-${month}-${day}`;
        const testDate = new Date(isoDate + 'T00:00:00');
        
        if (isNaN(testDate.getTime())) {
            return { valid: false, date: null, error: 'Invalid date' };
        }
        
        // Verify the date components match (catches invalid dates like Feb 30)
        if (testDate.getFullYear() !== yearNum || 
            testDate.getMonth() + 1 !== monthNum || 
            testDate.getDate() !== dayNum) {
            return { valid: false, date: null, error: 'Invalid date (e.g., Feb 30, April 31 do not exist)' };
        }
        
        return { valid: true, date: isoDate, error: null };
    } catch (error) {
        console.error('Date parsing error:', error, inputDate);
        return { valid: false, date: null, error: 'Error parsing date' };
    }
};

// Helper function to safely parse date for calendar component
const safeParseDateForCalendar = (dateString) => {
    if (!dateString || dateString === '') return undefined;
    try {
        const parsed = parseISO(dateString);
        if (isNaN(parsed.getTime())) return undefined;
        return parsed;
    } catch (error) {
        console.error('Date parsing error for calendar:', error, dateString);
        return undefined;
    }
};

export default function InventoryAddPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [salesClasses, setSalesClasses] = useState([]);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [tagAlongs, setTagAlongs] = useState([]);
    const [inventoryLocations, setInventoryLocations] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [supplierLockStatus, setSupplierLockStatus] = useState({ checking: false, locked: false, lockedBy: null });
    const [addToBatchError, setAddToBatchError] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [invoiceDateInput, setInvoiceDateInput] = useState(formatDateForInput(format(new Date(), 'yyyy-MM-dd')));
    const [dateError, setDateError] = useState(null);
    const [batchItems, setBatchItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState({
        part_number: '',
        description: '',
        unit: '',
        quantity_received: '',
        cost: '',
        profit_margin: '',
        selling_price: '',
        sales_class: '',
        tag_along_id: '',
        core: false,
        core_cost: '0.00',
        stocked_item: false,
        minimum_quantity: '0',
        maximum_quantity: '0',
        location: '',
    });
    const navigate = useNavigate();
    const supplierTriggerRef = React.useRef(null);
    const partNumberRef = React.useRef(null);
    const quantityReceivedRef = React.useRef(null);
    const [partSearchOpen, setPartSearchOpen] = useState(false);
    const [locationSearchOpen, setLocationSearchOpen] = useState(false);

    const filteredLocations = useMemo(() => {
        if (!currentItem.location) return inventoryLocations || [];
        const searchLower = currentItem.location.toLowerCase();
        return (inventoryLocations || []).filter(loc => 
            (loc.location_name || '').toLowerCase().includes(searchLower)
        );
    }, [currentItem.location, inventoryLocations]);

    const filteredInventory = useMemo(() => {
        if (!currentItem.part_number || currentItem.part_number.trim() === '') return [];
        const searchLower = currentItem.part_number.toLowerCase();
        
        return inventoryItems
            .map(item => {
                const partNumber = (item.part_number || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const manufacturer = (item.manufacturer || '').toLowerCase();
                
                let score = 0;
                if (partNumber === searchLower) score = 100;
                else if (partNumber.startsWith(searchLower)) score = 80;
                else if (partNumber.includes(searchLower)) score = 60;
                else if (description.startsWith(searchLower)) score = 40;
                else if (description.includes(searchLower)) score = 20;
                else if (manufacturer.includes(searchLower)) score = 10;
                
                return { ...item, _score: score };
            })
            .filter(item => item._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 50);
    }, [currentItem.part_number, inventoryItems]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [suppliersData, salesClassesData, inventoryData, tagAlongsData, locationsData] = await Promise.all([
                    Supplier.filter({ inventory_supplier: true }, 'name'),
                    SalesClass.list(),
                    InventoryItem.list(),
                    TagAlong.list(),
                    InventoryLocation.list()
                ]);
                setSuppliers(suppliersData);
                setSalesClasses(salesClassesData);
                setInventoryItems(inventoryData);
                setTagAlongs(tagAlongsData);
                setInventoryLocations(locationsData);
                
                setTimeout(() => {
                    supplierTriggerRef.current?.focus();
                }, 100);
            } catch (error) {
                console.error('Error loading data:', error);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (batchItems.length > 0 && !saving) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [batchItems, saving]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                handleAddToBatch();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (batchItems.length > 0 && !saving) {
                    handleSaveAndFinish();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [batchItems, saving, currentItem, selectedSupplier, invoiceNumber, dateError]);

    const checkSupplierLock = async (supplierId) => {
        if (!supplierId) {
            setSupplierLockStatus({ checking: false, locked: false, lockedBy: null });
            return { locked: false, lockedBy: null };
        }
        
        setSupplierLockStatus({ checking: true, locked: false, lockedBy: null });
        
        try {
            const supplier = await Supplier.filter({ id: supplierId });
            const supplierData = supplier[0];
            
            if (supplierData?.LockedByUser) {
                setSupplierLockStatus({ checking: false, locked: true, lockedBy: supplierData.LockedByUser });
                return { locked: true, lockedBy: supplierData.LockedByUser };
            } else {
                setSupplierLockStatus({ checking: false, locked: false, lockedBy: null });
                return { locked: false, lockedBy: null };
            }
        } catch (error) {
            console.error('Error checking supplier lock:', error);
            setSupplierLockStatus({ checking: false, locked: false, lockedBy: null });
            return { locked: false, lockedBy: null };
        }
    };

    const handleSupplierChange = (newSupplierId) => {
        setSelectedSupplier(newSupplierId);
        setAddToBatchError('');
        // Clear invoice fields when supplier changes
        setInvoiceNumber('');
        const todayDate = format(new Date(), 'yyyy-MM-dd');
        setInvoiceDate(todayDate);
        setInvoiceDateInput(formatDateForInput(todayDate));
        setDateError(null);
        
        // Check lock status for the new supplier
        checkSupplierLock(newSupplierId);
    };

    const calculatePriceFromSalesClass = (cost, salesClassId) => {
        if (!cost || !salesClassId || !salesClasses) return null;

        const selectedSalesClass = salesClasses.find(sc => String(sc.id) === String(salesClassId));
        if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return null;

        try {
            let parsedData = selectedSalesClass.pricing_matrix;
            if (typeof parsedData === 'string') {
                parsedData = JSON.parse(parsedData);
            }
            if (typeof parsedData === 'string') {
                parsedData = JSON.parse(parsedData);
            }
            
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
                const markupPercentage = parseFloat(matchingRange.margin);
                const sellingPrice = costValue * (1 + markupPercentage / 100);
                
                let calculatedProfitMargin = 0;
                if (sellingPrice > 0) {
                    calculatedProfitMargin = ((sellingPrice - costValue) / sellingPrice) * 100;
                }

                return {
                    sellingPrice: sellingPrice.toFixed(2),
                    margin: calculatedProfitMargin.toFixed(2)
                };
            }
        } catch (error) {
            console.error('Error calculating price from sales class matrix:', error);
        }

        return null;
    };

    const handleItemFieldChange = (field, value) => {
        setCurrentItem(prev => {
            const newItem = { ...prev, [field]: value };
            
            if ((field === 'cost' || field === 'sales_class') && newItem.cost && newItem.sales_class) {
                const salesClassCalculation = calculatePriceFromSalesClass(newItem.cost, newItem.sales_class);
                if (salesClassCalculation) {
                    newItem.selling_price = salesClassCalculation.sellingPrice;
                    newItem.profit_margin = salesClassCalculation.margin;
                    return newItem;
                }
            }

            if (field === 'cost' || field === 'selling_price') {
                const cost = parseFloat(field === 'cost' ? value : newItem.cost) || 0;
                const sellingPrice = parseFloat(field === 'selling_price' ? value : newItem.selling_price) || 0;
                
                if (cost > 0 && sellingPrice > cost) {
                    const margin = ((sellingPrice - cost) / sellingPrice) * 100;
                    newItem.profit_margin = margin.toFixed(2);
                } else if (cost === 0 && sellingPrice > 0) {
                    newItem.profit_margin = '100.00';
                } else {
                    newItem.profit_margin = '0.00';
                }
            }
            
            return newItem;
        });
    };

    const handleInvoiceDateChange = (value) => {
        setInvoiceDateInput(value);
        setDateError(null);
    };

    const handleInvoiceDateBlur = async () => {
        const parseResult = parseAndValidateDateInput(invoiceDateInput);
        
        if (!parseResult.valid) {
            setDateError(parseResult.error);
            alert(`Invalid invoice date: ${parseResult.error}`);
            return;
        }
        
        const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
        
        if (!fiscalCheck.isValid) {
            setDateError(fiscalCheck.message);
            alert(`Fiscal Period Error: ${fiscalCheck.message}`);
            return;
        }
        
        setInvoiceDate(parseResult.date);
        setInvoiceDateInput(formatDateForInput(parseResult.date));
        setDateError(null);
    };

    const handleInvoiceDateSelect = async (date) => {
        if (!date) return;
        
        const isoDate = format(date, 'yyyy-MM-dd');
        
        const fiscalCheck = await checkFiscalPeriodStatus(isoDate);
        
        if (!fiscalCheck.isValid) {
            alert(fiscalCheck.message);
            setDateError(fiscalCheck.message);
            return;
        }
        
        setInvoiceDate(isoDate);
        setInvoiceDateInput(formatDateForInput(isoDate));
        setDateError(null);
    };

    const handleAddToBatch = async () => {
        setAddToBatchError('');
        
        if (!selectedSupplier) {
            alert('Supplier is required.');
            return;
        }
        
        // Check for supplier lock before adding to batch
        const lockCheck = await checkSupplierLock(selectedSupplier);
        if (lockCheck.locked) {
            setAddToBatchError(`Cannot add to batch: Supplier is currently locked by ${lockCheck.lockedBy}. Please wait until they finish editing.`);
            return;
        }
        
        if (!invoiceNumber.trim()) {
            alert('Invoice Number is required.');
            return;
        }
        if (dateError) {
            alert('Please correct the invoice date before adding items to the batch.');
            return;
        }
        if (!currentItem.part_number.trim()) {
            alert('Part Number is required.');
            return;
        }
        if (!currentItem.description.trim()) {
            alert('Description is required.');
            return;
        }
        if (!currentItem.quantity_received || parseFloat(currentItem.quantity_received) <= 0) {
            alert('Quantity Received is required and must be greater than 0.');
            return;
        }
        if (!currentItem.cost || parseFloat(currentItem.cost) <= 0) {
            alert('Part Cost is required and must be greater than 0.');
            return;
        }
        if (!currentItem.selling_price || parseFloat(currentItem.selling_price) <= 0) {
            alert('List Price is required and must be greater than 0.');
            return;
        }
        if (!currentItem.sales_class) {
            alert('Sales Class is required.');
            return;
        }

        if (currentItem.core && (!currentItem.core_cost || parseFloat(currentItem.core_cost) <= 0)) {
            alert('Core Cost is required when Core Item is checked and must be greater than 0.');
            return;
        }

        const itemToAdd = {
            ...currentItem,
            quantity_received: parseFloat(currentItem.quantity_received),
            cost: parseFloat(currentItem.cost),
            profit_margin: parseFloat(currentItem.profit_margin),
            selling_price: parseFloat(currentItem.selling_price),
            core_cost: parseFloat(currentItem.core_cost),
            minimum_quantity: parseInt(currentItem.minimum_quantity, 10) || 0,
            maximum_quantity: parseInt(currentItem.maximum_quantity, 10) || 0,
            line_total: parseFloat(currentItem.cost) * parseFloat(currentItem.quantity_received),
            id: Date.now() + Math.random() // Temporary client-side ID for batch management
        };

        setBatchItems(prev => {
            const existingGroupIndex = prev.findIndex(group => 
                group.supplier_id === selectedSupplier &&
                group.invoice_number === invoiceNumber &&
                group.invoice_date === invoiceDate
            );

            if (existingGroupIndex !== -1) {
                const updatedGroups = [...prev];
                updatedGroups[existingGroupIndex].partItems.push(itemToAdd);
                return updatedGroups;
            } else {
                const newGroup = {
                    supplier_id: selectedSupplier,
                    invoice_number: invoiceNumber,
                    invoice_date: invoiceDate,
                    partItems: [itemToAdd]
                };
                return [...prev, newGroup];
            }
        });

        setCurrentItem({
            part_number: '',
            description: '',
            unit: '',
            quantity_received: '',
            cost: '',
            profit_margin: '',
            selling_price: '',
            sales_class: '',
            tag_along_id: '',
            core: false,
            core_cost: '0.00',
            stocked_item: false,
            minimum_quantity: '0',
            maximum_quantity: '0',
            location: '',
        });
        
        // Autofocus back to part # field
        setTimeout(() => {
            partNumberRef.current?.focus();
        }, 100);
    };

    const handleRemoveItem = (groupIndex, itemId) => {
        setBatchItems(prev => {
            const updatedGroups = [...prev];
            updatedGroups[groupIndex].partItems = updatedGroups[groupIndex].partItems.filter(
                item => item.id !== itemId
            );
            
            if (updatedGroups[groupIndex].partItems.length === 0) {
                updatedGroups.splice(groupIndex, 1);
            }
            
            return updatedGroups;
        });
    };

    const handleSaveAndFinish = async () => {
        if (batchItems.length === 0) {
            alert('At least one part is required.');
            return;
        }

        // Check all suppliers in the batch for locks
        const uniqueSupplierIds = [...new Set(batchItems.map(group => group.supplier_id))];
        const lockedSuppliers = [];
        
        for (const supplierId of uniqueSupplierIds) {
            const lockCheck = await checkSupplierLock(supplierId);
            if (lockCheck.locked) {
                const supplierName = getSupplierName(supplierId);
                lockedSuppliers.push(`${supplierName} (locked by ${lockCheck.lockedBy})`);
            }
        }
        
        if (lockedSuppliers.length > 0) {
            alert(`Cannot save batch: The following supplier(s) are currently locked:\n\n${lockedSuppliers.join('\n')}\n\nPlease wait until they finish editing and try again.`);
            return;
        }

        setSaving(true);
        try {
            // Process each invoice group
            for (const invoiceGroup of batchItems) {
                const response = await base44.functions.invoke('processInventoryReceipt', {
                    supplier_id: invoiceGroup.supplier_id,
                    invoice_number: invoiceGroup.invoice_number,
                    invoice_date: invoiceGroup.invoice_date,
                    items: invoiceGroup.partItems,
                    action: 'create'
                });

                if (!response.data.success) {
                    console.error('Error processing invoice:', invoiceGroup.invoice_number, response.data);
                    
                    if (response.data.errors && response.data.errors.length > 0) {
                        const errorMessages = response.data.errors.map(err => 
                            err.error || JSON.stringify(err)
                        ).join('\n');
                        alert(`Error processing invoice ${invoiceGroup.invoice_number}:\n${errorMessages}`);
                    } else {
                        alert(`Error processing invoice ${invoiceGroup.invoice_number}: ${response.data.message || 'Unknown error'}`);
                    }
                    
                    setSaving(false);
                    return; // Stop processing further invoices if one fails
                }

                console.log(`Successfully processed invoice ${invoiceGroup.invoice_number}:`, response.data);
            }

            alert('All batches received and inventory updated successfully!');
            window.location.reload();
        } catch (error) {
            console.error('Error saving received items:', error);
            alert(`An error occurred while saving: ${error.message || 'Please check console for details.'}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePartNumberSelect = (partNumber) => {
        const selected = inventoryItems.find(item => item.part_number === partNumber);
        if (selected) {
            setCurrentItem(prev => {
                const updatedItem = {
                    ...prev,
                    part_number: selected.part_number,
                    description: selected.description,
                    unit: selected.unit || '',
                    cost: (selected.cost || 0).toFixed(2),
                    selling_price: (selected.selling_price || 0).toFixed(2),
                    profit_margin: (selected.profit_margin || 0).toFixed(2),
                    sales_class: selected.sales_class || '',
                    tag_along_id: selected.tag_along_id || '',
                    core: selected.core || false,
                    core_cost: (selected.core_cost || 0).toFixed(2),
                    stocked_item: selected.stocked_item || false,
                    minimum_quantity: (selected.minimum_quantity || 0).toString(),
                    maximum_quantity: (selected.maximum_quantity || 0).toString(),
                    location: selected.location || ''
                };

                if (updatedItem.cost && updatedItem.sales_class) {
                    const salesClassCalculation = calculatePriceFromSalesClass(updatedItem.cost, updatedItem.sales_class);
                    if (salesClassCalculation) {
                        updatedItem.selling_price = salesClassCalculation.sellingPrice;
                        updatedItem.profit_margin = salesClassCalculation.margin;
                    }
                }
                return updatedItem;
            });
            setTimeout(() => {
                quantityReceivedRef.current?.focus();
            }, 100);
        } else {
            setCurrentItem(prev => ({
                ...prev,
                part_number: partNumber,
                description: '', 
                unit: '',
                cost: '',
                profit_margin: '',
                selling_price: '',
                sales_class: '',
                tag_along_id: '',
                core: false,
                core_cost: '0.00',
                stocked_item: false,
                minimum_quantity: '0',
                maximum_quantity: '0',
                location: '',
            }));
        }
    };

    const getTotalItemsCount = () => {
        return batchItems.reduce((total, group) => total + group.partItems.length, 0);
    };

    const getTotalBatchValue = () => {
        return batchItems.reduce((total, group) => {
            const groupTotal = group.partItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
            return total + groupTotal;
        }, 0);
    };

    const getSupplierName = (supplierId) => {
        const supplier = suppliers.find(s => s.id === supplierId);
        return supplier ? supplier.name : 'Unknown Supplier';
    };

    const handleNavigateAway = (destination) => {
        if (batchItems.length > 0) {
            if (window.confirm('You have unsaved items in your batch. Are you sure you want to leave? All batch items will be lost.')) {
                navigate(destination);
            }
        } else {
            navigate(destination);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => handleNavigateAway(createPageUrl('InventoryList'))}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Inventory
                    </Button>
                    <h1 className="text-2xl font-bold">Receive Inventory / Parts Entry</h1>
                </div>
                <Button variant="outline" onClick={() => handleNavigateAway(createPageUrl('Suppliers'))}>
                    <Truck className="w-4 h-4 mr-2" />
                    Suppliers
                </Button>
            </div>

            <Card>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="space-y-2">
                            <Label htmlFor="supplier">Supplier *</Label>
                            <Select value={selectedSupplier} onValueChange={handleSupplierChange}>
                                <SelectTrigger ref={supplierTriggerRef}>
                                    <SelectValue placeholder="Select supplier..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...suppliers]
                                        .sort((a, b) => {
                                            // Pinned first, then alphabetically
                                            if (a.pin_to_top && !b.pin_to_top) return -1;
                                            if (!a.pin_to_top && b.pin_to_top) return 1;
                                            return (a.name || '').localeCompare(b.name || '');
                                        })
                                        .map(supplier => (
                                        <SelectItem key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {supplierLockStatus.locked && (
                                <p className="text-xs text-red-600">Locked by: {supplierLockStatus.lockedBy}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="invoice_number">Invoice # *</Label>
                            <Input
                                id="invoice_number"
                                value={invoiceNumber}
                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                placeholder="Invoice number"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Invoice Date *</Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="text"
                                    value={invoiceDateInput}
                                    onChange={(e) => handleInvoiceDateChange(e.target.value)}
                                    onBlur={handleInvoiceDateBlur}
                                    placeholder="MM/DD/YYYY"
                                    className={`flex-1 ${dateError ? 'text-red-600 border-red-500' : ''}`}
                                    title={dateError || ''}
                                />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button 
                                            variant="outline" 
                                            size="icon"
                                            className="h-10 w-10"
                                        >
                                            <CalendarIcon className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar 
                                            mode="single" 
                                            selected={safeParseDateForCalendar(invoiceDate)} 
                                            onSelect={handleInvoiceDateSelect}
                                            initialFocus 
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-6">
                        <h3 className="text-lg font-semibold mb-4">Add Part to Batch</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                            <div className="space-y-2">
                                <Label htmlFor="part_number_input">Part # (Search or Create New) *</Label>
                                <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input
                                                ref={partNumberRef}
                                                id="part_number_input"
                                                placeholder="Search or type part #..."
                                                value={currentItem.part_number}
                                                onChange={(e) => {
                                                    const upperValue = e.target.value.toUpperCase();
                                                    handlePartNumberSelect(upperValue);
                                                    setPartSearchOpen(true);
                                                }}
                                                onFocus={() => setPartSearchOpen(true)}
                                                className="pl-8 uppercase"
                                                required
                                                autoComplete="off"
                                            />
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[400px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                        <div className="max-h-[300px] overflow-y-auto p-1 bg-white">
                                            {filteredInventory.length === 0 ? (
                                                <div className="py-6 text-center text-sm text-slate-500">
                                                    No existing parts found.
                                                    <br />
                                                    Continue typing to create new.
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    {filteredInventory.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => {
                                                                handlePartNumberSelect(item.part_number);
                                                                setPartSearchOpen(false);
                                                            }}
                                                            className="flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-slate-100 cursor-pointer border-b border-slate-50 last:border-0"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-slate-900">{item.part_number}</span>
                                                                <span className="text-xs text-slate-500">{item.description}</span>
                                                            </div>
                                                            {item.part_number === currentItem.part_number && (
                                                                <Check className="h-4 w-4 text-green-600" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2 col-span-1 md:col-span-2 grid grid-cols-3 gap-2">
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="description">Description *</Label>
                                    <Input
                                        id="description"
                                        value={currentItem.description}
                                        onChange={(e) => handleItemFieldChange('description', e.target.value.replace(/\b\w/g, l => l.toUpperCase()))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2 col-span-1">
                                    <Label htmlFor="unit">Unit</Label>
                                    <Input
                                        id="unit"
                                        value={currentItem.unit || ''}
                                        onChange={(e) => handleItemFieldChange('unit', e.target.value)}
                                        placeholder="/ea"
                                        maxLength="5"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="space-y-2">
                                <Label htmlFor="quantity_received">Qty Received *</Label>
                                <Input
                                    ref={quantityReceivedRef}
                                    id="quantity_received"
                                    type="number"
                                    step="0.01"
                                    value={currentItem.quantity_received}
                                    onChange={(e) => handleItemFieldChange('quantity_received', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cost">Part Cost *</Label>
                                <Input
                                    id="cost"
                                    type="number"
                                    step="0.01"
                                    value={currentItem.cost}
                                    onChange={(e) => handleItemFieldChange('cost', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sales_class">Sales Class *</Label>
                                <Select 
                                    value={currentItem.sales_class} 
                                    onValueChange={(val) => handleItemFieldChange('sales_class', val === 'none' ? '' : val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select sales class..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {salesClasses.map(salesClass => (
                                            <SelectItem key={salesClass.id} value={salesClass.id}>
                                                {salesClass.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tag_along_id">Tag Along (Optional)</Label>
                                <Select 
                                    value={currentItem.tag_along_id || 'none'} 
                                    onValueChange={(val) => handleItemFieldChange('tag_along_id', val === 'none' ? '' : val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select tag along..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {[...tagAlongs]
                                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                            .map(tagAlong => (
                                            <SelectItem key={tagAlong.id} value={tagAlong.id}>
                                                {tagAlong.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="selling_price">List Price *</Label>
                                <Input
                                    id="selling_price"
                                    type="number"
                                    step="0.01"
                                    value={currentItem.selling_price}
                                    onChange={(e) => handleItemFieldChange('selling_price', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="profit_margin">Margin % (Auto)</Label>
                                <Input
                                    id="profit_margin"
                                    type="number"
                                    step="0.01"
                                    value={currentItem.profit_margin}
                                    readOnly
                                    className="bg-gray-50"
                                />
                            </div>
                            <div className="space-y-2 flex items-center">
                                <div className="flex items-center space-x-2 h-10">
                                    <Checkbox
                                        id="core"
                                        checked={currentItem.core}
                                        onCheckedChange={(checked) => handleItemFieldChange('core', checked)}
                                    />
                                    <Label htmlFor="core" className="cursor-pointer">Core Item</Label>
                                </div>
                            </div>
                            <div className="space-y-2 flex items-center">
                                <div className="flex items-center space-x-2 h-10">
                                    <Checkbox
                                        id="stocked_item"
                                        checked={currentItem.stocked_item}
                                        onCheckedChange={(checked) => handleItemFieldChange('stocked_item', checked)}
                                    />
                                    <Label htmlFor="stocked_item" className="cursor-pointer">Stocked Item</Label>
                                </div>
                            </div>
                        </div>

                        {currentItem.core && (
                            <div className="mb-4">
                                <Label htmlFor="core_cost">Core Cost</Label>
                                <Input
                                    id="core_cost"
                                    type="number"
                                    step="0.01"
                                    value={currentItem.core_cost}
                                    onChange={(e) => handleItemFieldChange('core_cost', e.target.value)}
                                    className="max-w-xs"
                                />
                            </div>
                        )}

                        {currentItem.stocked_item && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                <div className="space-y-2">
                                    <Label htmlFor="minimum_quantity">Minimum (Optional)</Label>
                                    <Input
                                        id="minimum_quantity"
                                        type="number"
                                        value={currentItem.minimum_quantity}
                                        onChange={(e) => handleItemFieldChange('minimum_quantity', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="maximum_quantity">Maximum (Optional)</Label>
                                    <Input
                                        id="maximum_quantity"
                                        type="number"
                                        value={currentItem.maximum_quantity}
                                        onChange={(e) => handleItemFieldChange('maximum_quantity', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="location">Location (Optional)</Label>
                                    <Popover open={locationSearchOpen} onOpenChange={setLocationSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={locationSearchOpen}
                                                className="w-full justify-between font-normal"
                                            >
                                                {currentItem.location || "Select location..."}
                                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0" align="start">
                                            <div className="p-2">
                                                <Input
                                                    placeholder="Search locations..."
                                                    value={currentItem.location || ''}
                                                    onChange={(e) => handleItemFieldChange('location', e.target.value)}
                                                    className="mb-2"
                                                    autoFocus
                                                />
                                                <div className="max-h-[200px] overflow-y-auto space-y-1">
                                                    <div
                                                        onClick={() => {
                                                            handleItemFieldChange('location', '');
                                                            setLocationSearchOpen(false);
                                                        }}
                                                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
                                                    >
                                                        <span className="text-slate-500 italic">No Location</span>
                                                        {(!currentItem.location || currentItem.location === '') && <Check className="ml-auto h-4 w-4" />}
                                                    </div>
                                                    {filteredLocations.length === 0 ? (
                                                        <div className="py-2 text-center text-sm text-slate-500">No locations found.</div>
                                                    ) : (
                                                        filteredLocations.map((loc) => (
                                                            <div
                                                                key={loc.id}
                                                                onClick={() => {
                                                                    handleItemFieldChange('location', loc.location_name);
                                                                    setLocationSearchOpen(false);
                                                                }}
                                                                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
                                                            >
                                                                <span>{loc.location_name}</span>
                                                                {currentItem.location === loc.location_name && (
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

                        {addToBatchError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-sm text-red-700 flex items-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    {addToBatchError}
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end items-center gap-2">
                            <span className="text-xs text-slate-500">Ctrl + A</span>
                            <Button onClick={handleAddToBatch} className="bg-black text-white hover:bg-gray-800">
                                <Plus className="w-4 h-4 mr-2" />
                                Add to Batch
                            </Button>
                        </div>
                    </div>

                    {batchItems.length > 0 && (
                        <div className="border-t pt-6 mt-6">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-semibold">Batch Items ({getTotalItemsCount()} items, {batchItems.length} invoice{batchItems.length !== 1 ? 's' : ''})</h4>
                                <div className="text-sm font-semibold text-slate-700">
                                    Total Value: ${getTotalBatchValue().toFixed(2)}
                                </div>
                            </div>
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {batchItems.map((group, groupIndex) => (
                                    <div key={groupIndex} className="bg-slate-50 rounded-lg p-4">
                                        <div className="font-semibold text-slate-800 mb-3 pb-2 border-b border-slate-300">
                                            {getSupplierName(group.supplier_id)} - Invoice #{group.invoice_number} - {format(parseISO(group.invoice_date), 'MMM d, yyyy')}
                                        </div>
                                        <div className="space-y-2">
                                            {group.partItems.map((item) => (
                                                <div key={item.id} className="flex justify-between items-center p-2 bg-white rounded border border-slate-200">
                                                    <span className="text-sm">
                                                        <span className="font-medium">{item.part_number}</span> - {item.description} 
                                                        <span className="text-slate-600"> (Qty: {item.quantity_received})</span>
                                                        <span className="text-slate-700 font-semibold ml-2">${(item.line_total || 0).toFixed(2)}</span>
                                                    </span>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => handleRemoveItem(groupIndex, item.id)}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-300 text-right text-sm font-semibold text-slate-700">
                                            Invoice Total: ${group.partItems.reduce((sum, item) => sum + (item.line_total || 0), 0).toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between pt-6 border-t mt-6">
                        <Button type="button" variant="outline" onClick={() => handleNavigateAway(createPageUrl('InventoryList'))} disabled={saving}>
                            Cancel
                        </Button>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Ctrl + S</span>
                            <Button onClick={handleSaveAndFinish} disabled={batchItems.length === 0 || saving} className="bg-gray-600 text-white hover:bg-gray-700">
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Batch to Inventory
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}