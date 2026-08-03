import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AddPaychequeModal({ open, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    paycheque_number: '',
    pay_date: '',
    gross_pay: '',
    income_tax: '',
    cpp_contribution: '',
    cpp2_contribution: '',
    ei_premium: '',
    cpp_employer: '',
    cpp2_employer: '',
    ei_employer: '',
    notes: '',
    employee_reference: '',
    import_file_name: '',
    is_bus_driver_wages: '',
    additional_deductions: []
  });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setError(null);
    setUploadedFileName(file.name);

    try {
      const fileContent = await file.text();

      const { data: responseData, error: parseError } = await supabase.functions.invoke('autopro-parsePayrollFile', {
        body: { fileContent, fileName: file.name }
      });

      if (parseError) throw parseError;

      if (responseData?.success && responseData?.data) {
        const parsedData = responseData.data;
        
        if (parsedData.transaction_type !== 'Paycheque') {
          setUploadedFileName('');
          throw new Error('This file appears to be a remittance, not a paycheque. Please use the Add Remittance modal instead.');
        }

        const newFormData = {
          paycheque_number: parsedData.paycheque_number || '',
          pay_date: parsedData.pay_date || '',
          gross_pay: parsedData.gross_pay?.toString() || '',
          income_tax: parsedData.income_tax?.toString() || '',
          cpp_contribution: parsedData.cpp_contribution?.toString() || '',
          cpp2_contribution: parsedData.cpp2_contribution?.toString() || '',
          ei_premium: parsedData.ei_premium?.toString() || '',
          cpp_employer: parsedData.cpp_employer?.toString() || '',
          cpp2_employer: parsedData.cpp2_employer?.toString() || '',
          ei_employer: parsedData.ei_employer?.toString() || '',
          notes: parsedData.notes || '',
          employee_reference: parsedData.employee_reference || '',
          import_file_name: parsedData.import_file_name || file.name,
          is_bus_driver_wages: '',
          additional_deductions: parsedData.additional_deductions || []
        };
        
        setFormData(newFormData);
        setError(null);
      } else {
        setUploadedFileName('');
        throw new Error(responseData?.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('Error parsing file:', err);
      setError(err.message || 'Failed to parse paycheque file. Please check the file format.');
      setUploadedFileName('');
    } finally {
      setParsing(false);
    }
  };

  const handlePreSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.pay_date || !formData.gross_pay) {
      setError('Pay date and gross pay are required');
      return;
    }

    if (!formData.is_bus_driver_wages) {
      setError('Please select whether this is for Bus Driver Wages');
      return;
    }

    setShowConfirm(true);
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: createError } = await supabase.from('PayrollTransaction').insert({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        transaction_type: 'Paycheque',
        paycheque_number: formData.paycheque_number || null,
        pay_date: formData.pay_date,
        gross_pay: parseFloat(formData.gross_pay),
        income_tax: parseFloat(formData.income_tax) || 0,
        cpp_contribution: parseFloat(formData.cpp_contribution) || 0,
        cpp2_contribution: parseFloat(formData.cpp2_contribution) || 0,
        ei_premium: parseFloat(formData.ei_premium) || 0,
        cpp_employer: parseFloat(formData.cpp_employer) || 0,
        cpp2_employer: parseFloat(formData.cpp2_employer) || 0,
        ei_employer: parseFloat(formData.ei_employer) || 0,
        notes: formData.notes || null,
        employee_reference: formData.employee_reference || null,
        import_file_name: formData.import_file_name || null,
        import_date: formData.import_file_name ? new Date().toISOString() : null,
        is_paid: false,
        is_bus_driver_wages: formData.is_bus_driver_wages === 'yes',
        additional_deductions: JSON.stringify(formData.additional_deductions || [])
      });
      if (createError) throw createError;

      setFormData({
        paycheque_number: '',
        pay_date: '',
        gross_pay: '',
        income_tax: '',
        cpp_contribution: '',
        cpp2_contribution: '',
        ei_premium: '',
        cpp_employer: '',
        cpp2_employer: '',
        ei_employer: '',
        notes: '',
        employee_reference: '',
        import_file_name: '',
        is_bus_driver_wages: '',
        additional_deductions: []
      });
      setUploadedFileName('');

      onSuccess();
      onClose();
      setShowConfirm(false);
    } catch (err) {
      console.error('Error creating paycheque:', err);
      setError(err.message || 'Failed to create paycheque');
      setShowConfirm(false); // Close confirm modal on error so user can fix form
    } finally {
      setLoading(false);
    }
  };

  const calculateNetPay = () => {
    const gross = parseFloat(formData.gross_pay || 0);
    let deductions = (parseFloat(formData.income_tax || 0) + 
                        parseFloat(formData.cpp_contribution || 0) + 
                        parseFloat(formData.cpp2_contribution || 0) + 
                        parseFloat(formData.ei_premium || 0));
    
    // Add additional deductions
    if (formData.additional_deductions && formData.additional_deductions.length > 0) {
      deductions += formData.additional_deductions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }
    
    return gross - deductions;
  };

  return (
    <>
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-[400px] z-[100]">
          <DialogHeader>
            <DialogTitle>Verify Net Pay</DialogTitle>
            <DialogDescription>
              Please verify the calculated amount.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center">
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Calculated Net Pay</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              ${calculateNetPay().toFixed(2)}
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm font-medium dark:bg-yellow-900/20 dark:border-yellow-900/40 dark:text-yellow-300">
              Verify that this Net Pay matches PayPRO
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-center sm:justify-end">
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleFinalSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Adding...' : 'Confirm & Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <DialogTitle>Add Paycheque</DialogTitle>
              <DialogDescription>Upload a paycheque file or manually enter transaction details</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handlePreSubmit} className="space-y-6">
          {/* File Upload Section */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
            <Label htmlFor="file-upload" className="mb-2 block">Upload Paycheque File (Optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="file-upload"
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                disabled={parsing}
                className="flex-1 bg-white dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
              />
              {parsing && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  Parsing...
                </div>
              )}
            </div>
            {uploadedFileName && (
              <Alert className="mt-3 bg-white border-green-200 py-2 dark:bg-slate-900 dark:border-green-900/40">
                <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 ml-2 dark:text-green-300">
                  File uploaded: {uploadedFileName}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Key Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="paycheque_number">Paycheque Number</Label>
              <Input
                id="paycheque_number"
                placeholder="e.g., 202509-006"
                value={formData.paycheque_number}
                onChange={(e) => handleChange('paycheque_number', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center">
                Bus Driver Wages? <span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="flex items-center gap-4 h-10">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="bd_yes"
                    name="is_bus_driver_wages"
                    value="yes"
                    checked={formData.is_bus_driver_wages === 'yes'}
                    onChange={(e) => handleChange('is_bus_driver_wages', e.target.value)}
                    className="h-4 w-4 border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                  />
                  <Label htmlFor="bd_yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="bd_no"
                    name="is_bus_driver_wages"
                    value="no"
                    checked={formData.is_bus_driver_wages === 'no'}
                    onChange={(e) => handleChange('is_bus_driver_wages', e.target.value)}
                    className="h-4 w-4 border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                  />
                  <Label htmlFor="bd_no" className="font-normal cursor-pointer">No</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay_date">Pay Date <span className="text-red-500">*</span></Label>
              <Input
                id="pay_date"
                type="date"
                value={formData.pay_date}
                onChange={(e) => handleChange('pay_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gross_pay">Gross Pay <span className="text-red-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400">$</span>
                <Input
                  id="gross_pay"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.gross_pay}
                  onChange={(e) => handleChange('gross_pay', e.target.value)}
                  className="pl-7"
                  required
                />
              </div>
            </div>
          </div>

          {/* Deductions Section */}
          <div className="border border-slate-200 rounded-lg overflow-hidden dark:border-slate-700">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Employee Deductions</h4>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="income_tax">Income Tax</Label>
                <Input
                  id="income_tax"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.income_tax}
                  onChange={(e) => handleChange('income_tax', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ei_premium">EI Premium</Label>
                <Input
                  id="ei_premium"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.ei_premium}
                  onChange={(e) => handleChange('ei_premium', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpp_contribution">CPP Contribution</Label>
                <Input
                  id="cpp_contribution"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cpp_contribution}
                  onChange={(e) => handleChange('cpp_contribution', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpp2_contribution">CPP2 Contribution</Label>
                <Input
                  id="cpp2_contribution"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cpp2_contribution}
                  onChange={(e) => handleChange('cpp2_contribution', e.target.value)}
                />
              </div>
            </div>
            
            {/* Additional Deductions Display */}
            {formData.additional_deductions && formData.additional_deductions.length > 0 && (
              <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 mt-2 pt-2">
                <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Additional Deductions</h5>
                <div className="space-y-2">
                  {formData.additional_deductions.map((deduction, index) => (
                    <div key={index} className="flex justify-between text-sm bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-700 shadow-sm">
                      <span className="text-slate-700 dark:text-slate-300">
                        {deduction.description}
                        <span className="text-slate-400 dark:text-slate-500 ml-1 text-xs">(GL: {deduction.gl_account})</span>
                      </span>
                      <span className="font-mono text-slate-900 dark:text-slate-100">${deduction.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Employer Section */}
          <div className="border border-slate-200 rounded-lg overflow-hidden dark:border-slate-700">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Employer Contributions</h4>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ei_employer">EI Employer Premium (1.4x)</Label>
                <Input
                  id="ei_employer"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.ei_employer}
                  onChange={(e) => handleChange('ei_employer', e.target.value)}
                />
              </div>
              
              <div className="hidden md:block"></div>

              <div className="space-y-2">
                <Label htmlFor="cpp_employer">CPP Employer Contribution</Label>
                <Input
                  id="cpp_employer"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cpp_employer}
                  onChange={(e) => handleChange('cpp_employer', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpp2_employer">CPP2 Employer Contribution</Label>
                <Input
                  id="cpp2_employer"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cpp2_employer}
                  onChange={(e) => handleChange('cpp2_employer', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <Alert className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/40">
              <AlertDescription className="text-red-700 dark:text-red-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading || parsing}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || parsing} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Adding...' : 'Add Paycheque'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}