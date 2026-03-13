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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function LineEditModal({ open, onClose, line, onSave, chartOfAccounts }) {
  const [formData, setFormData] = useState({
    invoice_number: '',
    invoice_date: '',
    description: '',
    charge: '', // Store as string to allow invalid input display
    gst: '',    // Store as string to allow invalid input display
    line_total: '', // Store as string to allow 'Error' display
    gl_account: '',
    gst_override: false,
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
              <Label htmlFor="description">Description (max 100 characters)</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                rows={3}
                maxLength={100}
              />
              <p className="text-xs text-slate-500 mt-1">
                {(formData.description || '').length}/100 characters
              </p>
            </div>

            <div>
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number || ''}
                onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date || ''}
                onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
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
                className={isNaN(parseFloat(formData.charge)) && formData.charge !== '' ? 'border-red-300 text-red-600' : ''}
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
                disabled={!formData.gst_override} // Disable if not in override mode
                className={isNaN(parseFloat(formData.gst)) && formData.gst !== '' ? 'border-red-300 text-red-600' : ''}
              />
            </div>

            <div>
              <Label htmlFor="line_total">Line Total (Read-only)</Label>
              <Input
                id="line_total"
                type="text"
                value={typeof formData.line_total === 'number' ? formData.line_total.toFixed(2) : formData.line_total}
                readOnly
                className={`bg-slate-100 ${formData.line_total === 'Error' ? 'text-red-600' : ''}`}
              />
            </div>

            <div>
              <Label htmlFor="gl_account">GL Account</Label>
              <Select
                value={formData.gl_account || ''}
                onValueChange={(value) => handleFieldChange('gl_account', value)}
              >
                <SelectTrigger id="gl_account">
                  <SelectValue placeholder="Select GL account" />
                </SelectTrigger>
                <SelectContent>
                  {chartOfAccounts && chartOfAccounts.map(account => (
                    <SelectItem key={account.id} value={String(account.account_number)}>
                      {account.account_number} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="gst_override"
                checked={formData.gst_override}
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