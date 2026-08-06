import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileText, Check, AlertCircle, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function LegacyWorkOrderImportModal({ open, onClose }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Review
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    
    // Data State
    const [extractedData, setExtractedData] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [glAccounts, setGlAccounts] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    
    // Dialog States
    const [classifyModalOpen, setClassifyModalOpen] = useState(false);
    const [classifyingItemIndex, setClassifyingItemIndex] = useState(null);
    const [classificationType, setClassificationType] = useState('labor');
    const [selectedGlAccount, setSelectedGlAccount] = useState('');

    const [costModalOpen, setCostModalOpen] = useState(false);
    const [costItemIndex, setCostItemIndex] = useState(null);
    const [itemCost, setItemCost] = useState('');
    const [totalPartCost, setTotalPartCost] = useState('');

    // Additional fields for new parts
    const [coresEnabled, setCoresEnabled] = useState(false);
    const [coreCount, setCoreCount] = useState('');
    const [coreCost, setCoreCost] = useState('');
    const [qtyOnOrder, setQtyOnOrder] = useState('');
    
    // New Parts State
    const [newParts, setNewParts] = useState([]); // List of parts to create in inventory

    React.useEffect(() => {
        if (open) {
            const loadData = async () => {
                const { data: accounts, error } = await supabase.from('ChartOfAccount').select('*');
                if (error) {
                    console.error('Error loading chart of accounts:', error);
                    setGlAccounts([]);
                    return;
                }
                const filtered = (accounts || [])
                    .filter(a => a.is_active && !a.controlled)
                    .sort((a, b) => (a.account_number || '').localeCompare(b.account_number || '', undefined, { numeric: true }));
                setGlAccounts(filtered);
            };
            loadData();
        }
    }, [open]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const processFile = async () => {
        if (!file) return;
        setLoading(true);
        setProcessingStatus('Uploading file...');

        try {
            // Ensure lowercase extension for compatibility with extraction tool
            let uploadFile = file;
            if (file.name.toUpperCase().endsWith('.PDF')) {
                const newName = file.name.slice(0, -4) + '.pdf';
                uploadFile = new File([file], newName, { type: 'application/pdf' });
            }

            // 1. Upload File to native Storage
            const fileExt = uploadFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const storagePath = `temp/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('kadr-digital_invoice_uploads')
                .upload(storagePath, uploadFile);
            if (uploadError) {
                throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
            }

            setProcessingStatus('Extracting data with AI...');

            // 2. Extract Data via the native processLegacyWorkOrder function (extract mode)
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const { data: { session } } = await supabase.auth.getSession();
            const jwtToken = session?.access_token || supabaseAnonKey;

            const extractResponse = await fetch(`${supabaseUrl}/functions/v1/autopro-processLegacyWorkOrder?mode=extract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`
                },
                body: JSON.stringify({
                    storagePath,
                    mimeType: uploadFile.type || 'application/pdf'
                })
            });

            const extractionRes = await extractResponse.json();

            if (!extractResponse.ok || !extractionRes.success) {
                throw new Error(extractionRes.error || 'Failed to extract data from file');
            }

            const data = extractionRes.data;

            // 3. Pre-fetch Matching Records
            setProcessingStatus('Matching records...');

            // Fetch all customers/vehicles for client-side search (assuming reasonable size, otherwise search via API)
            const [customersResult, vehiclesResult] = await Promise.all([
                supabase.from('Customer').select('*'),
                supabase.from('Vehicle').select('*')
            ]);
            if (customersResult.error) throw customersResult.error;
            if (vehiclesResult.error) throw vehiclesResult.error;
            const allCustomers = customersResult.data || [];
            const allVehicles = vehiclesResult.data || [];
            setCustomers(allCustomers);
            setVehicles(allVehicles);

            // Attempt Auto-Match Customer
            if (data.customer_info?.name) {
                const searchName = data.customer_info.name.toLowerCase();
                const match = allCustomers.find(c => 
                    (c.org_name || `${c.first_name} ${c.last_name}`).toLowerCase().includes(searchName)
                );
                if (match) setSelectedCustomer(match);
            }

            // Attempt Auto-Match Vehicle
            if (data.vehicle_info?.vin) {
                const match = allVehicles.find(v => v.vin === data.vehicle_info.vin);
                if (match) setSelectedVehicle(match);
            }

            // Clean and Check Line Items for Inventory Matches
            const processedItems = await Promise.all(data.line_items.map(async (item) => {
                // Clean up "null" strings or "N/A" that might come from LLM
                let cleanPartNumber = item.part_number;
                if (cleanPartNumber === 'null' || cleanPartNumber === 'N/A' || cleanPartNumber === '') {
                    cleanPartNumber = null;
                }

                // If we have a part number, try to match it
                if (cleanPartNumber && !item.is_labor) {
                    // Try exact match first
                    const exactResult = await supabase.from('InventoryItem').select('*').eq('part_number', cleanPartNumber);
                    if (exactResult.error) throw exactResult.error;
                    let existingParts = exactResult.data || [];

                    // If no match, try swapping 'O' and '0' as a fallback
                    if (existingParts.length === 0 && (cleanPartNumber.includes('O') || cleanPartNumber.includes('0'))) {
                        const swappedPartNumber = cleanPartNumber.replace(/O/g, '0'); // Try replacing O with 0 first (most common error)
                        if (swappedPartNumber !== cleanPartNumber) {
                             const swappedResult = await supabase.from('InventoryItem').select('*').eq('part_number', swappedPartNumber);
                             if (swappedResult.error) throw swappedResult.error;
                             const swappedMatch = swappedResult.data || [];
                             if (swappedMatch.length > 0) {
                                 existingParts = swappedMatch;
                                 cleanPartNumber = swappedPartNumber; // Update to the matched one
                             }
                        }
                    }

                    return {
                        ...item,
                        part_number: cleanPartNumber,
                        inventory_match: existingParts.length > 0 ? existingParts[0] : null
                    };
                }
                
                return {
                    ...item,
                    part_number: cleanPartNumber,
                    quantity: item.quantity || 0,
                    unit_price: item.unit_price || 0,
                    total_price: item.total_price || 0
                };
            }));
            
            // Filter out Shop Supplies
            const filteredItems = processedItems.filter(item => 
                !item.description?.toLowerCase().includes('shop supplies')
            );
            
            setExtractedData({
                ...data,
                line_items: filteredItems
            });

            setStep(2);

        } catch (error) {
            console.error("Processing error:", error);
            alert("Error processing file: " + error.message);
        } finally {
            setLoading(false);
            setProcessingStatus('');
        }
    };

    const handleCreateWorkOrder = async () => {
        if (!selectedCustomer || !selectedVehicle) {
            alert("Please select a customer and vehicle.");
            return;
        }

        setLoading(true);
        setProcessingStatus('Creating Work Order...');

        try {
            // Identify new parts user wants to add
            const partsToCreate = extractedData.line_items
                .filter(item => item.create_new_part && item.part_number && !item.inventory_match)
                .map(item => ({
                    part_number: item.part_number,
                    description: item.description,
                    cost: item.cost || item.unit_price * 0.6, // Use captured cost
                    selling_price: item.unit_price,
                    quantity_on_hand: 0 // Don't add stock yet
                }));

            const payload = {
                customer_id: selectedCustomer.id,
                vehicle_id: selectedVehicle.id,
                invoice_details: extractedData.invoice_details || {},
                line_items: extractedData.line_items,
                totals: extractedData.totals,
                new_parts: partsToCreate,
                odometer: extractedData.vehicle_info?.odometer // Pass odometer explicitly
            };

            const { data, error: invokeError } = await supabase.functions.invoke('autopro-processLegacyWorkOrder', { body: payload });
            if (invokeError) throw invokeError;

            if (data.success) {
                alert("Legacy Work Order Imported Successfully!");
                onClose();
            } else {
                throw new Error(data.error || 'Unknown error');
            }

        } catch (error) {
            console.error("Creation error:", error);
            alert("Failed to create work order: " + error.message);
        } finally {
            setLoading(false);
            setProcessingStatus('');
        }
    };

    const getCustomerLabel = (c) => c.org_name || `${c.first_name} ${c.last_name}`;
    const getVehicleLabel = (v) => `${v.year} ${v.make} ${v.model} ${v.vin ? `(${v.vin})` : ''}`;

    const toggleNewPart = (index, checked) => {
        if (checked) {
            setCostItemIndex(index);
            const item = extractedData.line_items[index];
            // Pre-calculate defaults if possible, or leave blank
            setItemCost(''); 
            setTotalPartCost('');
            // Reset new fields
            setCoresEnabled(false);
            setCoreCount('');
            setCoreCost('');
            setQtyOnOrder('');
            setCostModalOpen(true);
        } else {
            const newItems = [...extractedData.line_items];
            newItems[index].create_new_part = false;
            newItems[index].cost = undefined;
            newItems[index].core_num = undefined;
            newItems[index].core_cost = undefined;
            newItems[index].core_osamt = undefined;
            newItems[index].qty_on_order = undefined;
            setExtractedData({...extractedData, line_items: newItems});
        }
    };

    const handleTotalCostChange = (value) => {
        setTotalPartCost(value);
        const total = parseFloat(value);
        const item = extractedData.line_items[costItemIndex];
        const qty = item.quantity || 1;
        
        if (!isNaN(total) && qty > 0) {
            setItemCost((total / qty).toFixed(2));
        } else {
            setItemCost('');
        }
    };

    const handleUnitCostChange = (value) => {
        setItemCost(value);
        const unit = parseFloat(value);
        const item = extractedData.line_items[costItemIndex];
        const qty = item.quantity || 1;
        
        if (!isNaN(unit)) {
            setTotalPartCost((unit * qty).toFixed(2));
        } else {
            setTotalPartCost('');
        }
    };

    const handleOpenPartInfo = (index) => {
        setCostItemIndex(index);
        const item = extractedData.line_items[index];
        
        // Pre-fill data from existing item or inventory match
        setItemCost(item.cost || item.inventory_match?.cost || '');
        
        // Cores
        const hasCore = (item.core_cost > 0) || (item.inventory_match?.core_cost > 0);
        setCoresEnabled(hasCore);
        if (hasCore) {
            setCoreCost(item.core_cost || item.inventory_match?.core_cost || '');
            setCoreCount(item.core_num || item.quantity || 1);
        } else {
            setCoreCost('');
            setCoreCount('');
        }
        
        setQtyOnOrder(item.qty_on_order || '');
        setCostModalOpen(true);
    };

    const handleSaveCost = () => {
        const newItems = [...extractedData.line_items];
        const item = newItems[costItemIndex];

        // Validation for On Order
        if (qtyOnOrder !== '') {
            const parsedOnOrder = parseFloat(qtyOnOrder);
            const itemQty = item.quantity || 0;
            if (parsedOnOrder > itemQty) {
                alert(`On Order quantity cannot exceed item quantity (${itemQty}).`);
                return;
            }
        }

        // Only mark for creation if it's not matched
        if (!item.inventory_match) {
            item.create_new_part = true;
        }
        
        item.cost = parseFloat(itemCost);
        
        // Save new fields
        if (coresEnabled) {
            item.core_num = parseFloat(coreCount) || 0;
            item.core_cost = parseFloat(coreCost) || 0;
            item.core_osamt = item.core_num * item.core_cost;
        } else {
            item.core_num = 0;
            item.core_cost = 0;
            item.core_osamt = 0;
        }

        item.qty_on_order = parseFloat(qtyOnOrder) || 0;

        setExtractedData({...extractedData, line_items: newItems});
        setCostModalOpen(false);
    };
    
    const handleQuantityChange = (index, newValue) => {
        const newItems = [...extractedData.line_items];
        const parsedValue = parseFloat(newValue);
        newItems[index].quantity = isNaN(parsedValue) ? 0 : parsedValue;
        
        // Recalculate total price if needed (assuming unit price stays constant)
        if (newItems[index].unit_price) {
             newItems[index].total_price = newItems[index].quantity * newItems[index].unit_price;
        }

        setExtractedData({...extractedData, line_items: newItems});
    };

    const handleOpenClassify = (index) => {
        const item = extractedData.line_items[index];
        setClassifyingItemIndex(index);
        setClassificationType(item.is_other_charge ? 'other_charge' : 'labor');
        setSelectedGlAccount(item.gl_account || '');
        setClassifyModalOpen(true);
    };

    const handleSaveClassification = () => {
        const newItems = [...extractedData.line_items];
        const item = newItems[classifyingItemIndex];
        
        if (classificationType === 'other_charge') {
            item.is_labor = false;
            item.is_other_charge = true;
            item.gl_account = selectedGlAccount;
        } else {
            item.is_labor = true;
            item.is_other_charge = false;
            item.gl_account = undefined;
        }
        
        setExtractedData({...extractedData, line_items: newItems});
        setClassifyModalOpen(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Import Legacy Work Order</DialogTitle>
                    </DialogHeader>

                    {step === 1 && (
                        <div className="py-8 space-y-4 text-center">
                            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <Upload className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
                                <Label htmlFor="wo-upload" className="block text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Upload Work Order PDF
                                </Label>
                                <Input 
                                    id="wo-upload" 
                                    type="file" 
                                    accept=".pdf" 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                />
                                <Button variant="outline" onClick={() => document.getElementById('wo-upload').click()}>
                                    {file ? file.name : "Select File"}
                                </Button>
                            </div>
                            
                            <div className="flex justify-end">
                                <Button onClick={processFile} disabled={!file || loading}>
                                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    {loading ? processingStatus : "Process with AI"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 2 && extractedData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                {/* Customer Selection */}
                                <div className="space-y-2">
                                    <Label>Customer</Label>
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                                        Extracted: <span className="font-medium text-slate-900 dark:text-slate-100">{extractedData.customer_info?.name}</span>
                                    </div>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn("w-full justify-between", !selectedCustomer && "text-muted-foreground")}
                                            >
                                                {selectedCustomer ? getCustomerLabel(selectedCustomer) : "Select Customer"}
                                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search customer..." />
                                                <CommandList>
                                                    <CommandEmpty>No customer found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {customers.map((c) => (
                                                            <CommandItem
                                                                key={c.id}
                                                                value={getCustomerLabel(c)}
                                                                onSelect={() => setSelectedCustomer(c)}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", selectedCustomer?.id === c.id ? "opacity-100" : "opacity-0")} />
                                                                {getCustomerLabel(c)}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* Vehicle Selection */}
                                <div className="space-y-2">
                                    <Label>Vehicle</Label>
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                                        Extracted: <span className="font-medium text-slate-900 dark:text-slate-100">{extractedData.vehicle_info?.make} {extractedData.vehicle_info?.model} ({extractedData.vehicle_info?.vin})</span>
                                    </div>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn("w-full justify-between", !selectedVehicle && "text-muted-foreground")}
                                            >
                                                {selectedVehicle ? getVehicleLabel(selectedVehicle) : "Select Vehicle"}
                                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search vehicle..." />
                                                <CommandList>
                                                    <CommandEmpty>No vehicle found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {vehicles
                                                            .filter(v => !selectedCustomer || v.customer_id === selectedCustomer.id)
                                                            .map((v) => (
                                                                <CommandItem
                                                                    key={v.id}
                                                                    value={getVehicleLabel(v)}
                                                                    onSelect={() => setSelectedVehicle(v)}
                                                                >
                                                                    <Check className={cn("mr-2 h-4 w-4", selectedVehicle?.id === v.id ? "opacity-100" : "opacity-0")} />
                                                                    {getVehicleLabel(v)}
                                                                </CommandItem>
                                                            ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            {/* Invoice Details */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-md">
                                <div>
                                    <Label className="text-xs text-slate-500 dark:text-slate-400">Document #</Label>
                                    <div className="font-medium">{extractedData.invoice_details?.invoice_number || 'N/A'}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 dark:text-slate-400">Date</Label>
                                    <div className="font-medium">{extractedData.invoice_details?.invoice_date || 'N/A'}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 dark:text-slate-400">Total Amount</Label>
                                    <div className="font-medium">${extractedData.totals?.total_amount?.toFixed(2) || '0.00'}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500 dark:text-slate-400">Odometer</Label>
                                    <Input 
                                        type="number"
                                        className="h-8 mt-1"
                                        value={extractedData.vehicle_info?.odometer || ''}
                                        onChange={(e) => {
                                            setExtractedData({
                                                ...extractedData,
                                                vehicle_info: {
                                                    ...extractedData.vehicle_info,
                                                    odometer: parseInt(e.target.value) || 0
                                                }
                                            });
                                        }}
                                    />
                                </div>
                                </div>

                                {/* Line Items */}
                            <div className="space-y-2">
                                <Label>Line Items</Label>
                                <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Desc</TableHead>
                                                <TableHead>Part #</TableHead>
                                                <TableHead className="w-20">Qty</TableHead>
                                                <TableHead className="w-24">Price</TableHead>
                                                <TableHead className="w-24">Total</TableHead>
                                                <TableHead className="w-32">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {extractedData.line_items.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="text-sm">{item.description}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {item.part_number ? (
                                                            <>
                                                                {item.part_number}
                                                                {item.inventory_match && (
                                                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                                                                        Found
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="italic text-slate-500 dark:text-slate-400">
                                                                {item.is_other_charge ? 'Other Charge' : (item.is_labor ? 'Labour' : 'Unclassified')}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20 px-2"
                                                            value={item.quantity}
                                                            onChange={(e) => handleQuantityChange(idx, e.target.value)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>${item.unit_price?.toFixed(2)}</TableCell>
                                                    <TableCell>${item.total_price?.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        {item.part_number && !item.is_labor ? (
                                                            <div className="flex items-center gap-2">
                                                                {!item.inventory_match && (
                                                                    <div className="flex items-center space-x-1">
                                                                        <Checkbox 
                                                                            id={`new-part-${idx}`} 
                                                                            checked={item.create_new_part || false}
                                                                            onCheckedChange={(checked) => toggleNewPart(idx, checked)}
                                                                        />
                                                                        <label 
                                                                            htmlFor={`new-part-${idx}`} 
                                                                            className="text-xs cursor-pointer select-none text-blue-600 dark:text-blue-400 font-medium"
                                                                        >
                                                                            Add
                                                                        </label>
                                                                    </div>
                                                                )}
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm" 
                                                                    onClick={() => handleOpenPartInfo(idx)}
                                                                    className="text-blue-600 dark:text-blue-400 h-7 px-2 text-xs"
                                                                >
                                                                    Part Info
                                                                </Button>
                                                            </div>
                                                        ) : !item.part_number ? (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="sm" 
                                                                onClick={() => handleOpenClassify(idx)}
                                                                className="text-blue-600 dark:text-blue-400 h-8 px-2"
                                                            >
                                                                Classify
                                                            </Button>
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>Back</Button>
                                <Button onClick={handleCreateWorkOrder} disabled={loading || !selectedCustomer || !selectedVehicle}>
                                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    {loading ? processingStatus : "Create Work Order"}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={classifyModalOpen} onOpenChange={setClassifyModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Classify Line Item</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <RadioGroup value={classificationType} onValueChange={setClassificationType}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="labor" id="labor" />
                                <Label htmlFor="labor">Labour</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="other_charge" id="other_charge" />
                                <Label htmlFor="other_charge">Other Charge</Label>
                            </div>
                        </RadioGroup>
                        
                        {classificationType === 'other_charge' && (
                            <div className="space-y-2">
                                <Label>GL Account</Label>
                                <Select value={selectedGlAccount} onValueChange={setSelectedGlAccount}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select GL Account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {glAccounts.map((account) => (
                                            <SelectItem key={account.account_number} value={account.account_number}>
                                                {account.account_number} - {account.account_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClassifyModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveClassification}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={costModalOpen} onOpenChange={setCostModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Part to Inventory</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="totalCost">Total Cost (for {extractedData?.line_items[costItemIndex]?.quantity || 1} items)</Label>
                            <Input 
                                id="totalCost" 
                                type="number" 
                                value={totalPartCost} 
                                onChange={(e) => handleTotalCostChange(e.target.value)} 
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cost">Cost Each</Label>
                            <Input 
                                id="cost" 
                                type="number" 
                                value={itemCost} 
                                onChange={(e) => handleUnitCostChange(e.target.value)} 
                                placeholder="0.00"
                            />
                        </div>

                        {/* On Order Section */}
                        <div className="space-y-2 pt-2 border-t">
                            <Label htmlFor="qtyOnOrder">Quantity On Order</Label>
                            <Input 
                                id="qtyOnOrder" 
                                type="number" 
                                value={qtyOnOrder} 
                                onChange={(e) => setQtyOnOrder(e.target.value)} 
                                placeholder="0"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Enter quantity currently on order (max {extractedData?.line_items[costItemIndex]?.quantity || 0}).
                            </p>
                        </div>

                        {/* Cores Section */}
                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    id="coresEnabled" 
                                    checked={coresEnabled}
                                    onCheckedChange={setCoresEnabled}
                                />
                                <Label htmlFor="coresEnabled" className="cursor-pointer">Includes Cores</Label>
                            </div>
                            
                            {coresEnabled && (
                                <div className="grid grid-cols-2 gap-4 pl-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="coreCount">Core Count</Label>
                                        <Input 
                                            id="coreCount" 
                                            type="number" 
                                            value={coreCount} 
                                            onChange={(e) => setCoreCount(e.target.value)} 
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="coreCost">Core Amount (Each)</Label>
                                        <Input 
                                            id="coreCost" 
                                            type="number" 
                                            value={coreCost} 
                                            onChange={(e) => setCoreCost(e.target.value)} 
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCostModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveCost}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}