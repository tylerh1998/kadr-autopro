import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import GLAccountCombobox from './GLAccountCombobox';
import SupplierCombobox from './SupplierCombobox';

export default function LineEditModal({ open, onClose, line, onSave, chartOfAccounts, suppliers }) {
  const [formData, setFormData] = useState({
    invoice_number: '',
    invoice_date: '',
    description: '',
    charge: '', // Store as string to allow invalid input display
    gst: '',    // Store as string to allow invalid input display
    line_total: '', // Store as string to allow 'Error' display
    gl_account: '',
    gst_override: false,
    supplier_id: '',
  });

  useEffect(() => {
    if (line) {
      setFormData({
        invoice_number: line.invoice_number || '',
        invoice_date: line.invoice_date || '',
        description: line.description || '',
        charge: line.charge !== undefined && line.charge !== null ? String(line.charge) : '',
        gst: line.gst !== undefined && line.gst !== null ? String(line.gst) : '',
        line_total: line.line_total !== undefined && line.line_total !== null ? String(line.line_total) : '',
        gl_account: line.gl_account || '',
        gst_override: line.gst_override || false,
        supplier_id: line.supplier_id || '',
      });
    } else {
      // Reset form data if no line is provided (e.g., for adding a new line)
      setFormData({
        invoice_number: '',
        invoice_date: '',
        description: '',
        charge: '',
        gst: '',
        line_total: '',
        gl_account: '',
        gst_override: false,
        supplier_id: '',
      });
    }
  }, [line]);

  // Helper to get a numeric value, defaulting to 0 for calculations if invalid/empty
  const getNumericValue = (val) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => {
      let updated = { ...prev, [field]: value };

      // Convert current state values to numbers for calculations, using 0 for invalid/empty
      const currentCharge = getNumericValue(updated.charge);
      const currentGst = getNumericValue(updated.gst);
      const currentLineTotal = getNumericValue(updated.line_total);

      if (updated.gst_override) {
        // Manual mode: line_total = charge + gst
        if (field === 'charge' || field === 'gst') {
          const numericCharge = getNumericValue(updated.charge);
          const numericGst = getNumericValue(updated.gst);
          if (!isNaN(parseFloat(updated.charge)) && updated.charge !== '' && !isNaN(parseFloat(updated.gst)) && updated.gst !== '') {
            updated.line_total = String(Math.round((numericCharge + numericGst) * 100) / 100);
          } else {
            // If either charge or gst is invalid/empty, line_total becomes 'Error' or empty
            updated.line_total = 'Error';
            if ((updated.charge === '' || isNaN(parseFloat(updated.charge))) && (updated.gst === '' || isNaN(parseFloat(updated.gst)))) {
                updated.line_total = '';
            }
          }
        }
        // If line_total is edited directly in override mode, we assume user knows what they're doing.
        // The outline doesn't specify how to react to line_total changes in override mode, so we let it be.
      } else {
        // Automatic calculation mode (5% GST)
        if (field === 'charge') {
          const numericCharge = getNumericValue(value);
          if (!isNaN(parseFloat(value)) && value !== '') {
            // Force GST to exactly 2 decimal places
            const calculatedGst = Math.round(numericCharge * 0.05 * 100) / 100;
            updated.gst = String(calculatedGst);
            updated.line_total = String(Math.round((numericCharge + getNumericValue(updated.gst)) * 100) / 100);
          } else {
            updated.gst = '';
            updated.line_total = '';
          }
        } else if (field === 'gst') {
          // This case implies GST can be manually entered even in 'auto' mode, but only affects line total.
          // This might be an unusual business rule, but we implement the outline's logic.
          const numericGst = getNumericValue(value);
          const numericCharge = getNumericValue(updated.charge); // Use current/previous charge
          if (!isNaN(parseFloat(value)) && value !== '' && !isNaN(parseFloat(updated.charge)) && updated.charge !== '') {
            updated.line_total = String(Math.round((numericCharge + numericGst) * 100) / 100);
          } else if ((updated.charge === '' || isNaN(parseFloat(updated.charge))) && (value === '' || isNaN(parseFloat(value)))) {
            updated.line_total = ''; // If both are empty/invalid, total is empty
          } else {
            updated.line_total = 'Error';
          }
        } else if (field === 'line_total') {
          const numericTotal = getNumericValue(value);
          if (!isNaN(parseFloat(value)) && value !== '') {
            const calculatedCharge = numericTotal / 1.05;
            updated.charge = String(Math.round(calculatedCharge * 100) / 100);
            updated.gst = String(Math.round((numericTotal - getNumericValue(updated.charge)) * 100) / 100);
          } else {
            updated.charge = '';
            updated.gst = '';
          }
        }
      }

      return updated;
    });
  };

  const normalizeString = (value) => String(value ?? '');
  const originalFormValues = {
    invoice_number: normalizeString(line?.invoice_number),
    invoice_date: normalizeString(line?.invoice_date),
    description: normalizeString(line?.description),
    charge: line?.charge !== undefined && line?.charge !== null ? String(line.charge) : '',
    gst: line?.gst !== undefined && line?.gst !== null ? String(line.gst) : '',
    line_total: line?.line_total !== undefined && line?.line_total !== null ? String(line.line_total) : '',
    gl_account: normalizeString(line?.gl_account),
    gst_override: !!line?.gst_override,
    supplier_id: normalizeString(line?.supplier_id),
  };

  const supplierChangeActive = normalizeString(formData.supplier_id) !== originalFormValues.supplier_id;
  const otherFieldsDirty = (
    normalizeString(formData.invoice_number) !== originalFormValues.invoice_number ||
    normalizeString(formData.invoice_date) !== originalFormValues.invoice_date ||
    normalizeString(formData.description) !== originalFormValues.description ||
    normalizeString(formData.charge) !== originalFormValues.charge ||
    normalizeString(formData.gst) !== originalFormValues.gst ||
    normalizeString(formData.line_total) !== originalFormValues.line_total ||
    normalizeString(formData.gl_account) !== originalFormValues.gl_account ||
    !!formData.gst_override !== originalFormValues.gst_override
  );

  const supplierLocked = otherFieldsDirty;
  const standardFieldsLocked = supplierChangeActive;
  const descriptionLocked = standardFieldsLocked || line?.inventory_credit === true;
  const glAccountLocked = standardFieldsLocked || line?.inventory_credit === true;

  const handleSave = () => {
    // Validate GL Account
    if (!formData.gl_account || String(formData.gl_account).trim() === '') {
      alert('Please select a GL Account before saving.');
      return;
    }

    // Validate numeric inputs
    const chargeVal = parseFloat(formData.charge);
    const gstVal = parseFloat(formData.gst);
    const lineTotalVal = parseFloat(formData.line_total);

    if (formData.line_total === 'Error') {
      alert('Please correct the invalid numeric inputs (shown as "Error") before saving.');
      return;
    }

    if (isNaN(chargeVal) && formData.charge !== '') {
      alert('Invalid value entered for Charge. Please enter a valid number.');
      return;
    }

    if (isNaN(gstVal) && formData.gst !== '') {
      alert('Invalid value entered for GST Amount. Please enter a valid number.');
      return;
    }

    const dataToSave = {
      ...line, // Keep original line properties
      ...formData, // Overwrite with new formData
      // Ensure numeric fields are properly formatted and rounded to 2 decimals before saving
      charge: Math.round((chargeVal || 0) * 100) / 100,
      gst: Math.round((gstVal || 0) * 100) / 100,
      line_total: Math.round((lineTotalVal || 0) * 100) / 100,
    };

    onSave(dataToSave);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Invoice Line</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Supplier</Label>
              <SupplierCombobox
                suppliers={suppliers}
                currentValue={formData.supplier_id || ''}
                onChange={(value) => handleFieldChange('supplier_id', value)}
                disabled={supplierLocked}
                placeholder="Select supplier"
                className={supplierLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Supplier reassignment is saved by itself. If you change supplier, the other fields lock; if you change any other field, supplier locks.</p>
            </div>

            <div className="col-span-2">
              <Label htmlFor="description">Description (max 100 characters)</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                rows={3}
                maxLength={100}
                readOnly={descriptionLocked}
                className={descriptionLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {(formData.description || '').length}/100 characters
              </p>
            </div>

            <div>
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number || ''}
                onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
                readOnly={standardFieldsLocked}
                className={standardFieldsLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}
              />
            </div>

            <div>
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date || ''}
                onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
                readOnly={standardFieldsLocked}
                className={standardFieldsLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}
              />
            </div>

            <div>
              <Label htmlFor="charge">Charge</Label>
              <Input
                id="charge"
                type="text"
                value={formData.charge}
                onChange={(e) => handleFieldChange('charge', e.target.value)}
                placeholder="0.00"
                readOnly={standardFieldsLocked}
                className={`${isNaN(parseFloat(formData.charge)) && formData.charge !== '' ? 'border-red-300 text-red-600' : ''} ${standardFieldsLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}`}
              />
            </div>

            <div>
              <Label htmlFor="gst">GST Amount</Label>
              <Input
                id="gst"
                type="text"
                value={formData.gst}
                onChange={(e) => handleFieldChange('gst', e.target.value)}
                placeholder="0.00"
                disabled={standardFieldsLocked || !formData.gst_override}
                className={`${isNaN(parseFloat(formData.gst)) && formData.gst !== '' ? 'border-red-300 text-red-600' : ''} ${standardFieldsLocked || !formData.gst_override ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}`}
              />
            </div>

            <div>
              <Label htmlFor="line_total">Line Total (Read-only)</Label>
              <Input
                id="line_total"
                type="text"
                value={typeof formData.line_total === 'number' ? formData.line_total.toFixed(2) : formData.line_total}
                readOnly
                className={`bg-slate-100 dark:bg-slate-700 ${formData.line_total === 'Error' ? 'text-red-600' : ''} ${standardFieldsLocked ? 'cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <Label htmlFor="gl_account">GL Account</Label>
              <GLAccountCombobox
                chartOfAccounts={chartOfAccounts}
                currentValue={formData.gl_account || ''}
                onChange={(value) => handleFieldChange('gl_account', value)}
                disabled={glAccountLocked}
                placeholder="Select GL account"
                className={glAccountLocked ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-700' : ''}
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="gst_override"
                checked={formData.gst_override}
                disabled={standardFieldsLocked}
                onCheckedChange={(checked) => {
                  setFormData(prev => {
                    const updated = { ...prev, gst_override: checked };
                    
                    // If toggling OFF, recalculate GST from charge (5% rule)
                    if (!checked) {
                      const numericCharge = getNumericValue(updated.charge);
                      if (!isNaN(parseFloat(updated.charge)) && updated.charge !== '') {
                        // Force GST to exactly 2 decimal places
                        const calculatedGst = Math.round(numericCharge * 0.05 * 100) / 100;
                        updated.gst = String(calculatedGst);
                        updated.line_total = String(Math.round((numericCharge + getNumericValue(updated.gst)) * 100) / 100);
                      } else {
                        updated.gst = '';
                        updated.line_total = '';
                      }
                    } else {
                        // If toggling ON, ensure GST and Line Total are consistent with current charge + gst
                        const numericCharge = getNumericValue(updated.charge);
                        const numericGst = getNumericValue(updated.gst);
                        if (!isNaN(parseFloat(updated.charge)) && updated.charge !== '' && !isNaN(parseFloat(updated.gst)) && updated.gst !== '') {
                            updated.line_total = String(Math.round((numericCharge + numericGst) * 100) / 100);
                        } else {
                            updated.line_total = 'Error';
                            if ((updated.charge === '' || isNaN(parseFloat(updated.charge))) && (updated.gst === '' || isNaN(parseFloat(updated.gst)))) {
                                updated.line_total = '';
                            }
                        }
                    }
                    
                    return updated;
                  });
                }}
              />
              <Label htmlFor="gst_override" className="cursor-pointer">
                Override GST (Manual Entry)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}