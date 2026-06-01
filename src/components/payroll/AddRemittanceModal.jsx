import React, { useState } from 'react';
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
import { FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AddRemittanceModal({ open, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    pay_date: '',
    remittance_period_start: '',
    remittance_period_end: '',
    income_tax: '',
    cpp_contribution: '',
    cpp_employer: '',
    ei_premium: '',
    ei_employer: '',
    amount: '',
    paycheque_numbers_included: '',
    notes: '',
    import_file_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate total amount when deduction fields change
      if (['income_tax', 'cpp_contribution', 'cpp_employer', 'ei_premium', 'ei_employer'].includes(field)) {
        const incomeTax = parseFloat(updated.income_tax) || 0;
        const cppEmployee = parseFloat(updated.cpp_contribution) || 0;
        const cppEmployer = parseFloat(updated.cpp_employer) || 0;
        const eiEmployee = parseFloat(updated.ei_premium) || 0;
        const eiEmployer = parseFloat(updated.ei_employer) || 0;
        
        updated.amount = (incomeTax + cppEmployee + cppEmployer + eiEmployee + eiEmployer).toFixed(2);
      }
      
      return updated;
    });
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

      // Call backend function to parse the file
      const response = await base44.functions.invoke('parsePayrollFile', {
        fileContent,
        fileName: file.name
      });

      if (response.data?.success && response.data?.data) {
        const parsedData = response.data.data;
        
        // Verify it's a remittance
        if (parsedData.transaction_type !== 'Remittance') {
          setUploadedFileName('');
          throw new Error('This file appears to be a paycheque, not a remittance. Please use the Add Paycheque modal instead.');
        }

        // Populate form fields with parsed data
        setFormData({
          pay_date: parsedData.pay_date || '',
          remittance_period_start: parsedData.remittance_period_start || '',
          remittance_period_end: parsedData.remittance_period_end || '',
          income_tax: parsedData.income_tax?.toString() || '',
          cpp_contribution: parsedData.cpp_contribution?.toString() || '',
          cpp_employer: parsedData.cpp_employer?.toString() || '',
          ei_premium: parsedData.ei_premium?.toString() || '',
          ei_employer: parsedData.ei_employer?.toString() || '',
          amount: parsedData.amount?.toString() || '',
          paycheque_numbers_included: parsedData.paycheque_numbers_included || '',
          notes: parsedData.notes || '',
          import_file_name: parsedData.import_file_name || file.name
        });

        setError(null);
      } else {
        setUploadedFileName('');
        throw new Error(response.data?.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('Error parsing file:', err);
      setError(err.message || 'Failed to parse remittance file. Please check the file format.');
      setUploadedFileName('');
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
      if (!formData.pay_date || !formData.amount) {
        throw new Error('Pay date and total amount are required');
      }

      // Create the transaction
      await base44.functions.invoke('SupabaseProxy', {
        action: 'create',
        table: 'PayrollTransaction',
        data: {
          transaction_type: 'Remittance',
          pay_date: formData.pay_date,
          remittance_period_start: formData.remittance_period_start || null,
          remittance_period_end: formData.remittance_period_end || null,
          income_tax: parseFloat(formData.income_tax) || 0,
          cpp_contribution: parseFloat(formData.cpp_contribution) || 0,
          cpp_employer: parseFloat(formData.cpp_employer) || 0,
          ei_premium: parseFloat(formData.ei_premium) || 0,
          ei_employer: parseFloat(formData.ei_employer) || 0,
          amount: String(parseFloat(formData.amount) || 0),
          paycheque_numbers_included: formData.paycheque_numbers_included || null,
          notes: formData.notes || null,
          import_file_name: formData.import_file_name || null,
          import_date: formData.import_file_name ? new Date().toISOString() : null,
          is_paid: false
        }
      });

      // Reset form
      setFormData({
        pay_date: '',
        remittance_period_start: '',
        remittance_period_end: '',
        income_tax: '',
        cpp_contribution: '',
        cpp_employer: '',
        ei_premium: '',
        ei_employer: '',
        amount: '',
        paycheque_numbers_included: '',
        notes: '',
        import_file_name: ''
      });
      setUploadedFileName('');

      // Close modal and trigger refresh
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating remittance:', err);
      setError(err.message || 'Failed to create remittance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle>Add Government Remittance</DialogTitle>
              <DialogDescription>Upload a remittance file or manually enter remittance details</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Section */}
          <div className="space-y-2">
            <Label htmlFor="file-upload">Upload Remittance File (Optional)</Label>
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
              <Alert className="bg-blue-50 border-blue-200">
                <FileText className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  File uploaded: {uploadedFileName}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-slate-500">Upload a .txt remittance file to automatically fill in all fields</p>
          </div>

          {/* Date Fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="remittance_period_start">Period Start</Label>
              <Input
                id="remittance_period_start"
                type="date"
                value={formData.remittance_period_start}
                onChange={(e) => handleChange('remittance_period_start', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="remittance_period_end">Period End</Label>
              <Input
                id="remittance_period_end"
                type="date"
                value={formData.remittance_period_end}
                onChange={(e) => handleChange('remittance_period_end', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay_date">Remittance Date <span className="text-red-500">*</span></Label>
              <Input
                id="pay_date"
                type="date"
                value={formData.pay_date}
                onChange={(e) => handleChange('pay_date', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Deduction Breakdown */}
          <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-sm text-slate-700">Remittance Breakdown</h3>
            
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpp_contribution">CPP (Employee)</Label>
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
                <Label htmlFor="cpp_employer">CPP (Employer)</Label>
                <Input
                  id="cpp_employer"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cpp_employer}
                  onChange={(e) => handleChange('cpp_employer', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ei_premium">EI (Employee)</Label>
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
                <Label htmlFor="ei_employer">EI (Employer)</Label>
                <Input
                  id="ei_employer"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.ei_employer}
                  onChange={(e) => handleChange('ei_employer', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Total Amount */}
          <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <Label htmlFor="amount" className="text-lg font-semibold">Total Remittance Amount <span className="text-red-500">*</span></Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              required
              className="text-lg font-bold"
              readOnly
            />
            <p className="text-xs text-slate-600">Auto-calculated from breakdown above</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paycheque_numbers_included">Paycheque Numbers Included</Label>
            <Input
              id="paycheque_numbers_included"
              placeholder="e.g., 202509-006, 202509-007, 202509-010"
              value={formData.paycheque_numbers_included}
              onChange={(e) => handleChange('paycheque_numbers_included', e.target.value)}
            />
            <p className="text-xs text-slate-500">Comma-separated list of paycheque numbers this remittance covers</p>
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
            <Button type="submit" disabled={loading || parsing} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Adding...' : 'Add Remittance'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}