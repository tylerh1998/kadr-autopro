import { supabase } from '@/lib/supabase';
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, X, Loader2, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';


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

const extractQuantityFromDescription = (description) => {
  if (!description) return null;

  const slashMatch = description.match(/\/x(\d+(?:\.\d+)?)\//i);
  if (slashMatch) return parseFloat(slashMatch[1]);

  const qtyMatch = description.match(/qty\s*(\d+(?:\.\d+)?)/i);
  if (qtyMatch) return parseFloat(qtyMatch[1]);

  return null;
};

export default function EditInventoryTransactionModal({ isOpen, onClose, transaction, onUpdate }) {
  const { employee } = useAuth();
  const [formData, setFormData] = useState({
    invoice_number: '',
    invoice_date: '',
    quantity: '',
    amount_per_unit: ''
  });
  
  const [invoiceDateInput, setInvoiceDateInput] = useState('');
  const [dateError, setDateError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [supplierLocked, setSupplierLocked] = useState(false);
  const [lockedByUser, setLockedByUser] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  // Populate form when transaction changes
  useEffect(() => {
    const checkLock = async () => {
      if (transaction?.supplier_id) {
        try {
          const { data: supplierRows, error: supplierError } = await supabase
            .from('Supplier')
            .select('*')
            .eq('id', transaction.supplier_id);
          if (supplierError) throw supplierError;
          const supplier = supplierRows?.[0];
          const userEmail = employee?.email || null;
          setCurrentUserEmail(userEmail);

          if (supplier?.LockedByUser && supplier.LockedByUser !== userEmail) {
            setSupplierLocked(true);
            setLockedByUser(supplier.LockedByUser);
            setError(`This supplier is currently locked by ${supplier.LockedByUser}. You cannot make changes.`);
          } else {
            setSupplierLocked(false);
            setLockedByUser(supplier?.LockedByUser || null);
          }
        } catch (err) {
          console.error('Error checking supplier lock:', err);
        }
      }
    };

    if (transaction && isOpen) {
      // Parse quantity from explicit value first, then from description
      let qty = transaction.quantity;
      if (!qty && transaction.description) {
        qty = extractQuantityFromDescription(transaction.description);
      }

      // Calculate unit price from charge and parsed quantity when needed
      let unitPrice = transaction.amountPerUnit;
      if (!unitPrice && transaction.purchase_amount && qty && parseFloat(qty) > 0) {
        unitPrice = parseFloat(transaction.purchase_amount) / parseFloat(qty);
      }

      setFormData({
        invoice_number: transaction.invoice_number || '',
        invoice_date: transaction.invoice_date || '',
        quantity: qty?.toString() || '',
        amount_per_unit: unitPrice ? Number(unitPrice).toFixed(2) : ''
      });
      setInvoiceDateInput(formatDateForInput(transaction.invoice_date));
      setDateError(null);
      setError(null);
      setSupplierLocked(false);
      setLockedByUser(null);
      checkLock();
    } else {
      // Reset form when closed
      setFormData({
        invoice_number: '',
        invoice_date: '',
        quantity: '',
        amount_per_unit: ''
      });
      setInvoiceDateInput('');
      setDateError(null);
      setError(null);
      setSaving(false);
      setSupplierLocked(false);
      setLockedByUser(null);
      setCurrentUserEmail(null);
    }
  }, [transaction, isOpen]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null); // Clear error when user makes changes
  };

  const handleInvoiceDateChange = (value) => {
    setInvoiceDateInput(value);
    setDateError(null);
    setError(null);
  };

  const handleInvoiceDateBlur = () => {
    const parseResult = parseAndValidateDateInput(invoiceDateInput);
    
    if (!parseResult.valid) {
      setDateError(parseResult.error);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      invoice_date: parseResult.date
    }));
    setInvoiceDateInput(formatDateForInput(parseResult.date));
    setDateError(null);
  };

  const handleInvoiceDateSelect = (date) => {
    if (!date) return;
    
    const isoDate = format(date, 'yyyy-MM-dd');
    setFormData(prev => ({
      ...prev,
      invoice_date: isoDate
    }));
    setInvoiceDateInput(formatDateForInput(isoDate));
    setDateError(null);
    setError(null);
  };

  const validateForm = () => {
    // Check required fields
    if (!formData.invoice_number.trim()) {
      setError('Invoice number is required');
      return false;
    }

    if (!formData.invoice_date) {
      setError('Invoice date is required');
      return false;
    }

    if (dateError) {
      setError(dateError);
      return false;
    }

    // Validate quantity
    const quantity = parseFloat(formData.quantity);
    if (!formData.quantity || isNaN(quantity) || quantity <= 0) {
      setError('Quantity must be a positive number');
      return false;
    }

    // Validate amount per unit
    const amountPerUnit = parseFloat(formData.amount_per_unit);
    if (!formData.amount_per_unit || isNaN(amountPerUnit) || amountPerUnit <= 0) {
      setError('Amount per unit must be a positive number');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    // Client-side validation
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await supabase.functions.invoke('autopro-processInventoryReceipt', {
        body: {
          action: 'edit',
          supplier_invoice_line_id: transaction.id,
          invoice_number: formData.invoice_number,
          invoice_date: formData.invoice_date,
          quantity: parseFloat(formData.quantity),
          amount_per_unit: parseFloat(formData.amount_per_unit)
        }
      });

      if (response.data && response.data.success) {
        // Success - close modal and trigger refresh
        if (onUpdate) {
          onUpdate();
        }
        onClose();
      } else {
        // Backend returned error
        const errorMessage = response.data?.message || response.data?.error || 'Failed to save changes';
        setError(errorMessage);
        console.error('Edit failed:', response.data);
      }
    } catch (err) {
      console.error('Error saving transaction edit:', err);
      setError(err.message || 'An unexpected error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) return; // Prevent closing while saving
    onClose();
  };

  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={saving ? undefined : onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Transaction</DialogTitle>
          <DialogDescription>
            Modify the details of this supplier invoice transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Invoice Number */}
          <div className="space-y-2">
            <Label htmlFor="invoice_number">Invoice Number *</Label>
            <Input
              id="invoice_number"
              value={formData.invoice_number}
              onChange={(e) => handleInputChange('invoice_number', e.target.value)}
              placeholder="Enter invoice number"
              disabled={saving}
            />
          </div>

          {/* Invoice Date */}
          <div className="space-y-2">
            <Label>Invoice Date *</Label>
            <div className="flex items-center gap-1">
              <Input
                type="text"
                value={invoiceDateInput}
                onChange={(e) => handleInvoiceDateChange(e.target.value)}
                onBlur={handleInvoiceDateBlur}
                placeholder="MM/DD/YYYY"
                className={`flex-1 ${dateError ? 'text-red-600 dark:text-red-400 border-red-500 dark:border-red-700' : ''}`}
                title={dateError || ''}
                disabled={saving}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-10 w-10"
                    disabled={saving}
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar 
                    mode="single" 
                    selected={safeParseDateForCalendar(formData.invoice_date)} 
                    onSelect={handleInvoiceDateSelect}
                    initialFocus 
                  />
                </PopoverContent>
              </Popover>
            </div>
            {dateError && (
              <p className="text-sm text-red-600 dark:text-red-400">{dateError}</p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', e.target.value)}
              placeholder="Enter quantity"
              disabled={saving}
            />
          </div>

          {/* Amount Per Unit */}
          <div className="space-y-2">
            <Label htmlFor="amount_per_unit">Amount Per Unit *</Label>
            <Input
              id="amount_per_unit"
              type="number"
              step="0.01"
              value={formData.amount_per_unit}
              onChange={(e) => handleInputChange('amount_per_unit', e.target.value)}
              placeholder="0.00"
              disabled={saving}
            />
          </div>

          {/* Calculated Total */}
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Charge:</span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                ${(parseFloat(formData.quantity || 0) * parseFloat(formData.amount_per_unit || 0)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={saving || supplierLocked || !formData.invoice_number || !formData.invoice_date || !formData.quantity || !formData.amount_per_unit || dateError}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}