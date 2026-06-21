import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ChartOfAccount } from '@/entities/all';
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
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import GLAccountCombobox from '@/components/suppliers/GLAccountCombobox';

export default function AddAdjustmentModal({ open, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    pay_date: '',
    amount: '',
    adjustment_reason: '',
    gl_account: '5005',
    notes: ''
  });
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      loadChartOfAccounts();
    }
  }, [open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const loadChartOfAccounts = async () => {
    try {
      const accountsData = await ChartOfAccount.list('account_number');
      setChartOfAccounts((accountsData || []).filter((account) => account.is_active !== false));
    } catch (err) {
      console.error('Error loading GL accounts:', err);
      setError('Failed to load GL accounts');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.pay_date || !formData.amount || !formData.adjustment_reason || !formData.gl_account) {
        throw new Error('Date, amount, reason, and GL account are required');
      }

      // Create the transaction
      await base44.functions.invoke('SupabaseProxy', {
        action: 'create',
        table: 'PayrollTransaction',
        data: {
          transaction_type: 'Adjustment',
          pay_date: formData.pay_date,
          amount: String(parseFloat(formData.amount) || 0),
          adjustment_reason: formData.adjustment_reason,
          gl_account: formData.gl_account,
          notes: formData.notes || null,
          is_paid: false
        }
      });

      // Reset form
      setFormData({
        pay_date: '',
        amount: '',
        adjustment_reason: '',
        gl_account: '5005',
        notes: ''
      });

      // Close modal and trigger refresh
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating adjustment:', err);
      setError(err.message || 'Failed to create adjustment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <DialogTitle>Add Adjustment</DialogTitle>
              <DialogDescription>Manually add a new adjustment transaction</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay_date">Adjustment Date <span className="text-red-500">*</span></Label>
            <Input
              id="pay_date"
              type="date"
              value={formData.pay_date}
              onChange={(e) => handleChange('pay_date', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount <span className="text-red-500">*</span></Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00 (can be negative)"
              value={formData.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              required
            />
            <p className="text-xs text-slate-500">Enter a negative amount for deductions/reversals</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustment_reason">Adjustment Reason <span className="text-red-500">*</span></Label>
            <Input
              id="adjustment_reason"
              placeholder="e.g., Vacation payout, Reversal of paycheque #1234"
              value={formData.adjustment_reason}
              onChange={(e) => handleChange('adjustment_reason', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>GL Account <span className="text-red-500">*</span></Label>
            <GLAccountCombobox
              chartOfAccounts={chartOfAccounts}
              currentValue={formData.gl_account}
              onChange={(value) => handleChange('gl_account', value)}
              disabled={loading}
              placeholder="Select GL Account *"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional details..."
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
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700">
              {loading ? 'Adding...' : 'Add Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}