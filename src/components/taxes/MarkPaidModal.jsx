import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

export default function MarkPaidModal({ open, onClose, gstReturn, onComplete }) {
  const [paymentDate, setPaymentDate] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (open) {
      // Set default payment date to today
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      loadBankAccounts();
    } else {
      // Reset form when modal closes
      setPaymentDate('');
      setBankAccountId('');
    }
  }, [open]);

  const loadBankAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const accounts = await base44.entities.BankAccount.list();
      const activeAccounts = accounts.filter(acc => acc.is_active);
      setBankAccounts(activeAccounts);
    } catch (error) {
      console.error('Error loading bank accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleConfirm = async () => {
    if (!paymentDate || !bankAccountId) {
      alert('Please select both payment date and bank account');
      return;
    }

    const isRefund = gstReturn.net_gst_due < 0;
    const confirmMessage = isRefund
      ? `Confirm GST refund of $${Math.abs(gstReturn.net_gst_due).toFixed(2)} received on ${format(new Date(paymentDate), 'MMM d, yyyy')}?`
      : `Confirm GST payment of $${gstReturn.net_gst_due.toFixed(2)} made on ${format(new Date(paymentDate), 'MMM d, yyyy')}?`;

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await base44.functions.invoke('processGSTPayment', {
        gst_return_id: gstReturn.id,
        payment_date: paymentDate,
        bank_account_id: bankAccountId
      });

      if (response.data.error) {
        alert(`Error: ${response.data.error}`);
        return;
      }

      alert(response.data.message || 'GST payment processed successfully!');
      onComplete();
    } catch (error) {
      console.error('Error processing GST payment:', error);
      alert('Failed to process GST payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!gstReturn) return null;

  const isRefund = gstReturn.net_gst_due < 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRefund ? 'Mark GST Refund Received' : 'Mark GST Payment Made'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className={`rounded-lg p-4 ${isRefund ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Period</p>
                <p className="text-sm text-slate-900">
                  {format(new Date(gstReturn.period_start_date), 'MMM d, yyyy')} - {format(new Date(gstReturn.period_end_date), 'MMM d, yyyy')}
                </p>
              </div>
              <DollarSign className={`w-8 h-8 ${isRefund ? 'text-green-400' : 'text-red-400'}`} />
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                {isRefund ? 'Refund Amount' : 'Payment Amount'}
              </p>
              <p className={`text-2xl font-bold ${isRefund ? 'text-green-700' : 'text-red-700'}`}>
                ${Math.abs(gstReturn.net_gst_due).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Bank Account */}
          <div>
            <Label>Bank Account</Label>
            {loadingAccounts ? (
              <div className="flex items-center justify-center py-3 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            ) : (
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} - {account.bank_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !paymentDate || !bankAccountId}
            className={isRefund ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm {isRefund ? 'Refund' : 'Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}