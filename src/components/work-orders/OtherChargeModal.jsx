import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OtherChargeList, ChartOfAccount } from '@/entities/all';
import { Separator } from '@/components/ui/separator';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';

export default function OtherChargeModal({ open, onClose, onAddCharge, onEditCharge, editingChargeLine, workOrderNumber }) {
  const [chargeTypes, setChargeTypes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [selectedChargeType, setSelectedChargeType] = useState(null);
  const [selectedChargeTypeId, setSelectedChargeTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [priceEach, setPriceEach] = useState('');
  const [isTaxable, setIsTaxable] = useState(true);
  
  // Cost application state
  const [applyCost, setApplyCost] = useState(false);
  const [linkedSupplierId, setLinkedSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('');
  const [supplierPurchaseAmount, setSupplierPurchaseAmount] = useState('');
  const [supplierGstAmount, setSupplierGstAmount] = useState('');
  const [supplierGlAccount, setSupplierGlAccount] = useState('');
  
  const [loadingSupplierInvoiceLine, setLoadingSupplierInvoiceLine] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceDateDisplay, setInvoiceDateDisplay] = useState('');
  
  const selectTriggerRef = useRef(null);

  // Fetch data when modal opens
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [typesData, suppliersResponse, accountsData] = await Promise.all([
          OtherChargeList.filter({ is_active: true }),
          base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'Supplier'
          }),
          ChartOfAccount.list('account_number')
        ]);
        setChargeTypes(typesData || []);
        setSuppliers(((suppliersResponse.data?.data) || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setGlAccounts(accountsData || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setChargeTypes([]);
        setSuppliers([]);
        setGlAccounts([]);
      }
    };

    if (open) {
      fetchData();
      
      // Reset form when opening for new charge
      if (!editingChargeLine) {
        setSelectedChargeTypeId('');
        setSelectedChargeType(null);
        setDescription('');
        setQuantity('1');
        setPriceEach('');
        setIsTaxable(true);
        setApplyCost(false);
        setLinkedSupplierId('');
        setSupplierInvoiceNumber('');
        setSupplierInvoiceDate('');
        setInvoiceDateDisplay('');
        setSupplierPurchaseAmount('');
        setSupplierGstAmount('');
        setSupplierGlAccount('');
      }
    }
  }, [open, editingChargeLine]);

  // Separate effect for pre-filling form when editing - waits for chargeTypes to be loaded
  useEffect(() => {
    if (open && editingChargeLine && chargeTypes.length > 0) {
      setDescription(editingChargeLine.description || '');
      setQuantity(editingChargeLine.qty?.toString() || '1');
      setPriceEach((editingChargeLine.oc_total / (editingChargeLine.qty || 1))?.toFixed(2) || '');
      setIsTaxable(editingChargeLine.taxable !== false);
      
      // Try to find the matching charge type
      if (editingChargeLine.other_charge_id) {
        // First try by explicit ID if available
        const matchingChargeType = chargeTypes.find(ct => ct.id === editingChargeLine.other_charge_id);
        if (matchingChargeType) {
          setSelectedChargeTypeId(String(matchingChargeType.id));
          setSelectedChargeType(matchingChargeType);
        }
      } else if (editingChargeLine.gl_account) {
        // Fallback: match by description and gl_account
        const matchingChargeType = chargeTypes.find(ct => 
          ct.gl_account === editingChargeLine.gl_account && 
          ct.description === editingChargeLine.description
        );
        if (matchingChargeType) {
          setSelectedChargeTypeId(String(matchingChargeType.id));
          setSelectedChargeType(matchingChargeType);
        }
      }
      
      // If supplier_invoice_line_id exists, fetch the SupplierInvoiceLine details
      if (editingChargeLine.supplier_invoice_line_id) {
        setApplyCost(true);
        setLoadingSupplierInvoiceLine(true);
        
        base44.functions.invoke('SupabaseProxy', {
          action: 'read',
          table: 'SupplierInvoiceLine',
          match: { id: editingChargeLine.supplier_invoice_line_id }
        })
          .then(response => {
            const sil = (response.data?.data || [])[0];
            if (!sil) throw new Error('Supplier invoice line not found');
            console.log('=== DEBUG: Fetched SupplierInvoiceLine for editing:', sil);
            setLinkedSupplierId(sil.supplier_id ? String(sil.supplier_id) : '');
            setSupplierInvoiceNumber(sil.invoice_number || '');
            setSupplierInvoiceDate(sil.invoice_date || '');
            if (sil.invoice_date) {
              try {
                setInvoiceDateDisplay(format(parseISO(sil.invoice_date), 'MM/dd/yyyy'));
              } catch {
                setInvoiceDateDisplay(sil.invoice_date);
              }
            } else {
              setInvoiceDateDisplay('');
            }
            setSupplierPurchaseAmount(sil.purchase_amount?.toString() || '');
            setSupplierGstAmount(sil.gst_amount?.toString() || '');
            setSupplierGlAccount(sil.gl_account ? String(sil.gl_account) : '');
          })
          .catch(error => {
            console.error('Error fetching SupplierInvoiceLine:', error);
            alert('Failed to load cost details. The supplier invoice line may have been deleted.');
          })
          .finally(() => {
            setLoadingSupplierInvoiceLine(false);
          });
      } else {
        setApplyCost(false);
        setLinkedSupplierId('');
        setSupplierInvoiceNumber('');
        setSupplierInvoiceDate('');
        setInvoiceDateDisplay('');
        setSupplierPurchaseAmount('');
        setSupplierGstAmount('');
        setSupplierGlAccount('');
      }
    }
  }, [open, editingChargeLine, chargeTypes]);

  // Auto-focus the predefined charge dropdown when modal opens (for new charges only)
  useEffect(() => {
    if (open && !editingChargeLine && chargeTypes.length > 0 && selectTriggerRef.current) {
      // Delay to ensure modal is fully rendered and data is loaded
      const timer = setTimeout(() => {
        selectTriggerRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, editingChargeLine, chargeTypes.length]);

  const handleChargeTypeSelect = (chargeTypeId) => {
    const normalizedChargeTypeId = String(chargeTypeId);
    const chargeType = chargeTypes.find(ct => String(ct.id) === normalizedChargeTypeId);
    if (chargeType) {
      setSelectedChargeTypeId(normalizedChargeTypeId);
      setSelectedChargeType(chargeType);
      setDescription(chargeType.description || '');
      setPriceEach(chargeType.base_amount?.toString() || '');
      setIsTaxable(chargeType.is_taxable !== false);
      
      // Set cost application defaults from charge type
      setApplyCost(chargeType.apply_cost || false);
      setLinkedSupplierId(chargeType.linked_supplier_id ? String(chargeType.linked_supplier_id) : '');
      
      // If apply_cost is true and we have a linked supplier, pre-fill the GL account
      if (chargeType.apply_cost && chargeType.linked_supplier_id) {
        const supplier = suppliers.find(s => String(s.id) === String(chargeType.linked_supplier_id));
        if (supplier && supplier.default_gl_account) {
          setSupplierGlAccount(String(supplier.default_gl_account));
        }
      }
    }
  };

  // Auto-calculate GST when purchase amount or taxable status changes
  useEffect(() => {
    if (applyCost && supplierPurchaseAmount) {
      const purchaseAmt = parseFloat(supplierPurchaseAmount) || 0;
      if (isTaxable) {
        setSupplierGstAmount((purchaseAmt * 0.05).toFixed(2));
      } else {
        setSupplierGstAmount('0');
      }
    }
  }, [supplierPurchaseAmount, isTaxable, applyCost]);

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(priceEach) || 0;
  const subtotal = qty * price;
  
  // Calculate supplier total if cost is being applied
  const supplierTotal = parseFloat(supplierPurchaseAmount || 0) + parseFloat(supplierGstAmount || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedChargeTypeId) {
      alert('Please select a predefined charge type');
      return;
    }
    
    if (!selectedChargeTypeId || !description.trim()) {
      alert('Please select a valid other charge');
      return;
    }

    if (qty <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }
    
    // Validate cost application fields if applyCost is checked
    if (applyCost) {
      if (!linkedSupplierId) {
        alert('Please select a supplier for cost application');
        return;
      }
      
      // Fetch fresh supplier data to check if locked (only for new charges, not edits)
      if (!editingChargeLine) {
        try {
          setSubmitting(true);
          const supplierResponse = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'Supplier',
            match: { id: linkedSupplierId }
          });
          const freshSupplier = (supplierResponse.data?.data || [])[0];
          if (freshSupplier && freshSupplier.LockedByUser) {
            alert(`Supplier locked by: ${freshSupplier.LockedByUser}`);
            setSubmitting(false);
            return;
          }
        } catch (error) {
          console.error('Error fetching supplier:', error);
          alert('Failed to verify supplier status. Please try again.');
          setSubmitting(false);
          return;
        }
      }
      if (!supplierInvoiceNumber.trim()) {
        alert('Please enter a supplier invoice number');
        return;
      }
      if (!supplierInvoiceDate) {
        alert('Please select an invoice date');
        return;
      }
      if (supplierPurchaseAmount === '' || isNaN(parseFloat(supplierPurchaseAmount))) {
        alert('Please enter a valid purchase amount');
        return;
      }
      if (!supplierGlAccount) {
        alert('Please select a GL account');
        return;
      }
    }
    
    setSubmitting(true);
    
    let finalDescription = description.trim();
    if (applyCost && workOrderNumber) {
        const formattedRO = workOrderNumber.startsWith('RO') && !workOrderNumber.includes('#') 
            ? workOrderNumber.replace(/^RO/, 'RO#') 
            : workOrderNumber;
        finalDescription = `${formattedRO}/${finalDescription}`;
    }

    const chargeData = {
      id: editingChargeLine?.id || Date.now(),
      description: description.trim(), // Keep original description for the Work Order line item
      supplierLineDescription: finalDescription, // Pass the augmented description for the Supplier Invoice Line
      qty,
      oc_total: subtotal,
      total: subtotal,
      taxable: isTaxable,
      gl_account: selectedChargeType?.gl_account || '', // Add GL account to the charge data
      other_charge_id: selectedChargeTypeId, // Track which OtherChargeList item was selected
      applyCost,
      linkedSupplierId,
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      supplierInvoiceDate,
      supplierPurchaseAmount: parseFloat(supplierPurchaseAmount) || 0,
      supplierGstAmount: parseFloat(supplierGstAmount) || 0,
      supplierGlAccount,
    };
    
    try {
      if (editingChargeLine) {
        await onEditCharge(chargeData);
      } else {
        await onAddCharge(chargeData);
      }
    } catch (error) {
      console.error('Error submitting charge:', error);
      alert('Failed to save charge. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingChargeLine ? 'Edit Other Charge' : 'Add Other Charge'}</DialogTitle>
        </DialogHeader>
        
        {loadingSupplierInvoiceLine ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-slate-600">Loading cost details...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Charge Details */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Description *</Label>
                <Select value={selectedChargeTypeId || ''} onValueChange={handleChargeTypeSelect}>
                  <SelectTrigger ref={selectTriggerRef}>
                    <SelectValue placeholder="Select an other charge..." />
                  </SelectTrigger>
                  <SelectContent>
                    {chargeTypes
                      .filter(ct => !ct.levy || ct.id === editingChargeLine?.chargeTypeId || ct.id === selectedChargeTypeId)
                      .sort((a, b) => (a.description || '').localeCompare(b.description || ''))
                      .map(ct => (
                      <SelectItem key={ct.id} value={String(ct.id)}>
                        {ct.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priceEach">Price Each *</Label>
                  <Input
                    id="priceEach"
                    type="number"
                    step="0.01"
                    value={priceEach}
                    onChange={(e) => setPriceEach(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded">
                <Checkbox
                  id="taxable"
                  checked={isTaxable}
                  onCheckedChange={setIsTaxable}
                />
                <Label htmlFor="taxable" className="cursor-pointer">
                  This charge is taxable
                </Label>
              </div>
              
              <div className="flex gap-4 bg-blue-50 p-3 rounded">
                <div className="flex-1 text-center">
                  <p className="text-xs text-blue-700">Subtotal</p>
                  <p className="text-sm font-medium text-blue-900">${subtotal.toFixed(2)}</p>
                </div>
                <div className="flex-1 text-center border-l border-blue-200">
                  <p className="text-xs text-blue-700">GST {isTaxable ? '(5%)' : '(N/A)'}</p>
                  <p className="text-sm font-medium text-blue-900">${isTaxable ? (subtotal * 0.05).toFixed(2) : '0.00'}</p>
                </div>
                <div className="flex-1 text-center border-l border-blue-200">
                  <p className="text-xs text-blue-700">Charge Total</p>
                  <p className="text-sm font-bold text-blue-900">${(subtotal + (isTaxable ? subtotal * 0.05 : 0)).toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Cost Application Section */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="applyCost"
                  checked={applyCost}
                  onCheckedChange={setApplyCost}
                  disabled={!!editingChargeLine?.supplier_invoice_line_id}
                />
                <Label htmlFor="applyCost" className="cursor-pointer">
                  Apply Cost (track this charge as an expense)
                </Label>
              </div>

              {editingChargeLine?.supplier_invoice_line_id && (
                <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  To change the cost details, go to the Supplier Transactions page and edit them there.
                </p>
              )}
              
              {applyCost && (
                <div className="space-y-4 bg-slate-50 p-4 rounded border border-slate-200">
                  <h4 className="font-semibold text-slate-900">Cost Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplier">Supplier *</Label>
                      <Select 
                        value={linkedSupplierId || ''} 
                        onValueChange={(value) => {
                          setLinkedSupplierId(value);
                          const supplier = suppliers.find(s => s.id === value);
                          if (supplier && supplier.default_gl_account) {
                            setSupplierGlAccount(supplier.default_gl_account);
                          }
                        }}
                        disabled={!!editingChargeLine?.supplier_invoice_line_id}
                      >
                        <SelectTrigger id="supplier">
                          <SelectValue placeholder="Select supplier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoiceNumber">Invoice # *</Label>
                      <Input
                        id="invoiceNumber"
                        value={supplierInvoiceNumber}
                        onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                        placeholder="INV-12345"
                        disabled={!!editingChargeLine?.supplier_invoice_line_id}
                      />
                    </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoiceDate">Invoice Date *</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          id="invoiceDate"
                          type="text"
                          placeholder="MM/DD/YYYY"
                          value={invoiceDateDisplay}
                          onChange={(e) => setInvoiceDateDisplay(e.target.value)}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (!val) return;

                            const parts = val.split('/');
                            let month, day, year;

                            if (parts.length === 2) {
                              // MM/DD format - autofill current year
                              month = parts[0];
                              day = parts[1];
                              year = new Date().getFullYear().toString();
                            } else if (parts.length === 3) {
                              month = parts[0];
                              day = parts[1];
                              year = parts[2];
                              // Convert 2-digit year to 4-digit
                              if (year.length === 2) {
                                const currentYear = new Date().getFullYear();
                                const currentCentury = Math.floor(currentYear / 100) * 100;
                                const twoDigitYear = parseInt(year);
                                year = (currentCentury + twoDigitYear > currentYear + 10) 
                                  ? (currentCentury - 100 + twoDigitYear).toString() 
                                  : (currentCentury + twoDigitYear).toString();
                              }
                            } else {
                              alert('Invalid date format. Use MM/DD or MM/DD/YYYY');
                              return;
                            }

                            month = month.padStart(2, '0');
                            day = day.padStart(2, '0');

                            const isoDate = `${year}-${month}-${day}`;
                            const testDate = new Date(isoDate + 'T00:00:00');

                            if (isNaN(testDate.getTime())) {
                              alert('Invalid date');
                              return;
                            }

                            setSupplierInvoiceDate(isoDate);
                            setInvoiceDateDisplay(format(testDate, 'MM/dd/yyyy'));
                          }}
                          disabled={!!editingChargeLine?.supplier_invoice_line_id}
                          className="w-32"
                        />
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              disabled={!!editingChargeLine?.supplier_invoice_line_id}
                              className="h-10 w-10"
                              type="button"
                            >
                              <CalendarIcon className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar 
                              mode="single" 
                              selected={supplierInvoiceDate ? parseISO(supplierInvoiceDate) : undefined} 
                              onSelect={(date) => {
                                if (date) {
                                  const isoDate = format(date, 'yyyy-MM-dd');
                                  setSupplierInvoiceDate(isoDate);
                                  setInvoiceDateDisplay(format(date, 'MM/dd/yyyy'));
                                }
                              }}
                              disabled={!!editingChargeLine?.supplier_invoice_line_id}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="purchaseAmount">Subtotal *</Label>
                      <Input
                        id="purchaseAmount"
                        type="number"
                        step="0.01"
                        value={supplierPurchaseAmount}
                        onChange={(e) => setSupplierPurchaseAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={!!editingChargeLine?.supplier_invoice_line_id}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gstAmount">GST</Label>
                      <Input
                        id="gstAmount"
                        type="number"
                        step="0.01"
                        value={supplierGstAmount}
                        onChange={(e) => setSupplierGstAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={!!editingChargeLine?.supplier_invoice_line_id}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Total</Label>
                      <div className="h-10 flex items-center px-3 bg-white border rounded">
                        <span className="font-semibold">${supplierTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    </div>

                    <div className="space-y-2">
                    <Label htmlFor="glAccount">GL Account *</Label>
                    <Select 
                      value={supplierGlAccount || ''} 
                      onValueChange={setSupplierGlAccount}
                      disabled={!!editingChargeLine?.supplier_invoice_line_id}
                    >
                      <SelectTrigger id="glAccount">
                        <SelectValue placeholder="Select GL account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {glAccounts.filter(acc => !acc.controlled).map(acc => (
                          <SelectItem key={acc.id} value={String(acc.account_number)}>
                            {acc.account_number} - {acc.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {editingChargeLine ? 'Updating...' : 'Adding...'}
                  </>
                ) : (
                  editingChargeLine ? 'Update Charge' : 'Add Charge'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}