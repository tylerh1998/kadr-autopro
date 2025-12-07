import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ChartOfAccount } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function LineOfCreditTransactionModal({ open, onClose, lineOfCredit, onTransactionMade }) {
  const [formData, setFormData] = useState({
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    reference: '',
    transaction_type: 'charge',
    amount: '',
    offset_gl_account: ''
  });

  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      loadChartOfAccounts();
      // Reset form when opening
      setFormData({
        transaction_date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        reference: '',
        transaction_type: 'charge',
        amount: '',
        offset_gl_account: ''
      });
      setError(null);
    }
  }, [open]);

  const loadChartOfAccounts = async () => {
    try {
      const accounts = await ChartOfAccount.filter({ is_active: true }, 'account_number');
      setChartOfAccounts(accounts);
    } catch (error) {
      console.error('Error loading chart of accounts:', error);
      setChartOfAccounts([]);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Client-side validation
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    if (!formData.transaction_date) {
      setError('Transaction date is required');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (!formData.offset_gl_account) {
      setError('Please select an offset GL account');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await base44.functions.invoke('processLineOfCreditTransaction', {
        line_of_credit_id: lineOfCredit.id,
        transaction_date: formData.transaction_date,
        description: formData.description,
        reference: formData.reference,
        transaction_type: formData.transaction_type,
        amount: parseFloat(formData.amount),
        offset_gl_account: formData.offset_gl_account
      });

      if (response.data && response.data.success) {
        // Success - close modal and notify parent
        if (onTransactionMade) {
          onTransactionMade();
        }
        onClose();
      } else {
        // Backend returned error
        const errorMessage = response.data?.message || response.data?.error || 'Failed to process transaction';
        setError(errorMessage);
        console.error('Transaction failed:', response.data);
      }
    } catch (err) {
      console.error('Error processing LOC transaction:', err);
      setError(err.message || 'An unexpected error occurred while processing the transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Manual Transaction</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Transaction Date *</Label>
              <Input
                id="transaction_date"
                type="date"
                value={formData.transaction_date}
                onChange={(e) => handleChange('transaction_date', e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Reference number (optional)"
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Transaction description..."
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              disabled={loading}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_type">Transaction Type *</Label>
              <Select
                value={formData.transaction_type}
                onValueChange={(value) => handleChange('transaction_type', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge">Charge (Draw from LOC)</SelectItem>
                  <SelectItem value="credit">Credit (Refund/Return)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offset_gl_account">Offset GL Account *</Label>
            <Select
              value={formData.offset_gl_account}
              onValueChange={(value) => handleChange('offset_gl_account', value)}
              disabled={loading}
              required
            >
              <SelectTrigger className={!formData.offset_gl_account ? 'border-red-300' : ''}>
                <SelectValue placeholder="Select GL Account..." />
              </SelectTrigger>
              <SelectContent>
                {chartOfAccounts.filter(account => !account.controlled).map((account) => (
                  <SelectItem key={account.id} value={account.account_number}>
                    {account.account_number} - {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-600 mb-2">Transaction Summary:</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-slate-700">Line of Credit:</span>
                <span className="text-sm font-medium text-slate-900">{lineOfCredit?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-700">Type:</span>
                <span className="text-sm font-medium text-slate-900">
                  {formData.transaction_type === 'charge' ? 'Charge (Draw)' : 'Credit (Refund)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-700">Amount:</span>
                <span className={`text-sm font-bold ${formData.transaction_type === 'charge' ? 'text-red-600' : 'text-blue-600'}`}>
                  {formData.transaction_type === 'charge' ? '+' : '-'}${parseFloat(formData.amount || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={loading || !formData.description || !formData.amount || !formData.offset_gl_account}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Create Transaction'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}