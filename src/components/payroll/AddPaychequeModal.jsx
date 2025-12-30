import React, { useState } from 'react';
import { PayrollTransaction } from '@/entities/all';
import { base44 } from '@/api/base44Client';
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
    pay_period_start: '',
    pay_period_end: '',
    pay_date: '',
    gross_pay: '',
    income_tax: '',
    cpp_contribution: '',
    cpp2_contribution: '',
    ei_premium: '',
    cpp_employer: '',
    cpp2_employer: '',
    ei_employer: '',
    employer_cost: '',
    total_employer_cost: '',
    deductions: '',
    net_pay: '',
    notes: '',
    employee_reference: '',
    import_file_name: '',
    is_bus_driver_wages: 'no'
  });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');

  const handleChange = (field, value) => {
    // Helper to update specific fields without causing infinite loops
    const updateForm = (updates) => {
      setFormData(prev => {
        const newPrev = { ...prev };
        for (const key in updates) {
          if (updates.hasOwnProperty(key)) {
            newPrev[key] = updates[key];
          }
        }
        return newPrev;
      });
    };

    updateForm({ [field]: value });
    
    // Auto-calculate deductions when individual employee deduction fields change
    if (['income_tax', 'cpp_contribution', 'cpp2_contribution', 'ei_premium'].includes(field)) {
      const currentFormData = { ...formData, [field]: value }; // Use updated value for current field
      const incomeTax = parseFloat(currentFormData.income_tax) || 0;
      const cpp = parseFloat(currentFormData.cpp_contribution) || 0;
      const cpp2 = parseFloat(currentFormData.cpp2_contribution) || 0;
      const ei = parseFloat(currentFormData.ei_premium) || 0;
      
      const totalDeductions = incomeTax + cpp + cpp2 + ei;
      
      const grossPay = parseFloat(currentFormData.gross_pay) || 0;
      const netPay = (grossPay - totalDeductions).toFixed(2);

      updateForm({
        deductions: totalDeductions.toFixed(2),
        net_pay: netPay
      });
    }
    
    // Auto-calculate employer cost when employer contribution fields change
    if (['cpp_employer', 'cpp2_employer', 'ei_employer'].includes(field)) {
      const currentFormData = { ...formData, [field]: value }; // Use updated value for current field
      const cppEmp = parseFloat(currentFormData.cpp_employer) || 0;
      const cpp2Emp = parseFloat(currentFormData.cpp2_employer) || 0;
      const eiEmp = parseFloat(currentFormData.ei_employer) || 0;
      
      const totalEmployerContributionCost = cppEmp + cpp2Emp + eiEmp;
      
      const grossPay = parseFloat(currentFormData.gross_pay) || 0;
      const totalCostToEmployer = (grossPay + totalEmployerContributionCost).toFixed(2);

      updateForm({
        employer_cost: totalEmployerContributionCost.toFixed(2),
        total_employer_cost: totalCostToEmployer
      });
    }
    
    // Auto-calculate net pay and total costs when gross pay changes
    if (field === 'gross_pay') {
      const gross = parseFloat(value) || 0;
      const deductions = parseFloat(formData.deductions) || 0;
      const employerCost = parseFloat(formData.employer_cost) || 0;
      
      updateForm({ 
        net_pay: (gross - deductions).toFixed(2),
        total_employer_cost: (gross + employerCost).toFixed(2)
      });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setError(null);
    setUploadedFileName(file.name);

    try {
      // Read file content
      const fileContent = await file.text();
      
      console.log('=== File Upload Debug ===');
      console.log('File name:', file.name);
      console.log('File content:', fileContent);

      // Call backend function to parse the file
      const response = await base44.functions.invoke('parsePayrollFile', {
        fileContent,
        fileName: file.name
      });

      console.log('Backend response:', JSON.stringify(response, null, 2));
      console.log('Response data:', JSON.stringify(response.data, null, 2));

      if (response.data?.success && response.data?.data) {
        const parsedData = response.data.data;
        
        console.log('Parsed data from backend:', JSON.stringify(parsedData, null, 2));
        
        // Verify it's a paycheque
        if (parsedData.transaction_type !== 'Paycheque') {
          setUploadedFileName(''); // Clear the uploaded file name
          throw new Error('This file appears to be a remittance, not a paycheque. Please use the Add Remittance modal instead.');
        }

        // Populate form fields - with explicit logging
        const newFormData = {
          paycheque_number: parsedData.paycheque_number || '',
          pay_period_start: parsedData.pay_period_start || '',
          pay_period_end: parsedData.pay_period_end || '',
          pay_date: parsedData.pay_date || '',
          gross_pay: parsedData.gross_pay?.toString() || '',
          income_tax: parsedData.income_tax?.toString() || '',
          cpp_contribution: parsedData.cpp_contribution?.toString() || '',
          cpp2_contribution: parsedData.cpp2_contribution?.toString() || '',
          ei_premium: parsedData.ei_premium?.toString() || '',
          cpp_employer: parsedData.cpp_employer?.toString() || '',
          cpp2_employer: parsedData.cpp2_employer?.toString() || '',
          ei_employer: parsedData.ei_employer?.toString() || '',
          employer_cost: parsedData.employer_cost?.toString() || '',
          total_employer_cost: parsedData.total_employer_cost?.toString() || '',
          deductions: parsedData.deductions?.toString() || '',
          net_pay: parsedData.net_pay?.toString() || '',
          notes: parsedData.notes || '',
          employee_reference: parsedData.employee_reference || '',
          import_file_name: parsedData.import_file_name || file.name,
          is_bus_driver_wages: 'no'
        };
        
        console.log('Setting form data to:', JSON.stringify(newFormData, null, 2));
        setFormData(newFormData);

        setError(null);
      } else {
        console.error('Backend response missing success or data:', response.data);
        setUploadedFileName(''); // Clear the uploaded file name
        throw new Error(response.data?.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('Error parsing file:', err);
      console.error('Error stack:', err.stack);
      setError(err.message || 'Failed to parse paycheque file. Please check the file format.');
      setUploadedFileName(''); // Clear the uploaded file name on error
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.pay_date || !formData.gross_pay) {
        throw new Error('Pay date and gross pay are required');
      }

      // Create the transaction
      await PayrollTransaction.create({
        transaction_type: 'Paycheque',
        paycheque_number: formData.paycheque_number || null,
        pay_date: formData.pay_date,
        pay_period_start: formData.pay_period_start || null,
        pay_period_end: formData.pay_period_end || null,
        gross_pay: parseFloat(formData.gross_pay),
        income_tax: parseFloat(formData.income_tax) || 0,
        cpp_contribution: parseFloat(formData.cpp_contribution) || 0,
        cpp2_contribution: parseFloat(formData.cpp2_contribution) || 0,
        ei_premium: parseFloat(formData.ei_premium) || 0,
        cpp_employer: parseFloat(formData.cpp_employer) || 0,
        cpp2_employer: parseFloat(formData.cpp2_employer) || 0,
        ei_employer: parseFloat(formData.ei_employer) || 0,
        employer_cost: parseFloat(formData.employer_cost) || 0,
        total_employer_cost: parseFloat(formData.total_employer_cost) || 0,
        deductions: parseFloat(formData.deductions) || 0,
        net_pay: parseFloat(formData.net_pay) || 0,
        notes: formData.notes || null,
        employee_reference: formData.employee_reference || null,
        import_file_name: formData.import_file_name || null,
        import_date: formData.import_file_name ? new Date().toISOString() : null,
        is_paid: false, // Default to unpaid for manual entries
        is_bus_driver_wages: formData.is_bus_driver_wages === 'yes'
      });

      // Reset form
      setFormData({
        paycheque_number: '',
        pay_period_start: '',
        pay_period_end: '',
        pay_date: '',
        gross_pay: '',
        income_tax: '',
        cpp_contribution: '',
        cpp2_contribution: '',
        ei_premium: '',
        cpp_employer: '',
        cpp2_employer: '',
        ei_employer: '',
        employer_cost: '',
        total_employer_cost: '',
        deductions: '',
        net_pay: '',
        notes: '',
        employee_reference: '',
        import_file_name: '',
        is_bus_driver_wages: 'no'
      });
      setUploadedFileName('');

      // Close modal and trigger refresh
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating paycheque:', err);
      setError(err.message || 'Failed to create paycheque');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <DialogTitle>Add Paycheque</DialogTitle>
              <DialogDescription>Upload a paycheque file or manually enter transaction details</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Section */}
          <div className="space-y-2">
            <Label htmlFor="file-upload">Upload Paycheque File (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-upload"
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                disabled={parsing}
                className="flex-1"
              />
              {parsing && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Parsing...
                </div>
              )}
            </div>
            {uploadedFileName && (
              <Alert className="bg-green-50 border-green-200">
                <FileText className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  File uploaded: {uploadedFileName}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-slate-500">Upload a .txt file to automatically populate the form fields</p>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paycheque_number">Paycheque Number</Label>
              <Input
                id="paycheque_number"
                placeholder="e.g., 202509-006"
                value={formData.paycheque_number}
                onChange={(e) => handleChange('paycheque_number', e.target.value)}
              />
              <p className="text-xs text-slate-500">Unique identifier for cross-referencing with payroll system</p>
            </div>
            
            <div className="space-y-2">
              <Label>Bus Driver Wages? <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="bd_yes"
                    name="is_bus_driver_wages"
                    value="yes"
                    checked={formData.is_bus_driver_wages === 'yes'}
                    onChange={(e) => handleChange('is_bus_driver_wages', e.target.value)}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
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
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <Label htmlFor="bd_no" className="font-normal cursor-pointer">No</Label>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pay_period_start">Pay Period Start</Label>
              <Input
                id="pay_period_start"
                type="date"
                value={formData.pay_period_start}
                onChange={(e) => handleChange('pay_period_start', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay_period_end">Pay Period End</Label>
              <Input
                id="pay_period_end"
                type="date"
                value={formData.pay_period_end}
                onChange={(e) => handleChange('pay_period_end', e.target.value)}
              />
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
            <Input
              id="gross_pay"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.gross_pay}
              onChange={(e) => handleChange('gross_pay', e.target.value)}
              required
            />
          </div>

          {/* Employee Deduction Fields */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Employee Deductions</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="income_tax">Income Tax (Federal + Provincial)</Label>
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
            </div>
          </div>

          {/* Employer Contribution Fields */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Employer Contributions</h4>
            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label htmlFor="employer_cost">Total Employer Contributions</Label>
                <Input
                  id="employer_cost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.employer_cost}
                  readOnly
                  className="bg-slate-50 font-semibold"
                />
                <p className="text-xs text-slate-500">Auto-calculated from employer contributions</p>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="deductions">Total Employee Deductions</Label>
              <Input
                id="deductions"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.deductions}
                readOnly
                className="bg-slate-50 font-semibold"
              />
              <p className="text-xs text-slate-500">Auto-calculated from employee deduction fields</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="net_pay">Net Pay</Label>
              <Input
                id="net_pay"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.net_pay}
                readOnly
                className="bg-slate-50  font-semibold"
              />
              <p className="text-xs text-slate-500">Gross Pay - Total Employee Deductions</p>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="total_employer_cost">Total Cost to Employer</Label>
            <Input
              id="total_employer_cost"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.total_employer_cost}
              readOnly
              className="bg-indigo-50 font-bold text-lg"
            />
            <p className="text-xs text-slate-500">Gross Pay + Total Employer Contributions</p>
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
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-700">
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
  );
}