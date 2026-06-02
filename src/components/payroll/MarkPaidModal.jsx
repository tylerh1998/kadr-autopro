import React, { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export default function MarkPaidModal({ open, onClose, transactions = [], onSuccess }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      loadBankAccounts();
    }
  }, [open]);

  const loadBankAccounts = async () => {
    try {
      const response = await base44.functions.invoke('SupabaseProxy', {
        action: 'list',
        table: 'BankAccount'
      });

      const accounts = (response.data?.data || []).filter((account) => account.is_active !== false);
      setBankAccounts(accounts);
      setSelectedBankAccount('');
    } catch (err) {
      console.error('Error loading bank accounts:', err);
      setError('Failed to load bank accounts');
    }
  };

  // Calculate net pay dynamically since it's no longer stored
  const getNetPay = (t) => {
    if (t.transaction_type !== 'Paycheque') return t.amount || 0;
    
    const gross = t.gross_pay || 0;
    let deductions = (t.income_tax || 0) + 
                      (t.cpp_contribution || 0) + 
                      (t.cpp2_contribution || 0) + 
                      (t.ei_premium || 0);
                      
    // Handle additional deductions
    if (t.additional_deductions) {
      try {
        const addDeductions = typeof t.additional_deductions === 'string' 
          ? JSON.parse(t.additional_deductions) 
          : t.additional_deductions;
          
        if (Array.isArray(addDeductions)) {
          deductions += addDeductions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        }
      } catch (e) {
        console.error('Error parsing additional deductions:', e);
      }
    }
    
    return gross - deductions;
  };

  const totalAmount = transactions.reduce((sum, t) => {
    if (t.transaction_type === 'Paycheque') {
      return sum + getNetPay(t);
    } else if (t.transaction_type === 'Remittance') {
      return sum + (t.amount || 0);
    } else if (t.transaction_type === 'Adjustment') {
      return sum + (t.amount || 0);
    }
    return sum;
  }, 0);

  const handleMarkPaid = async () => {
    if (!selectedBankAccount) {
      setError('Please select a bank account');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccount);

      for (const transaction of transactions) {
        // Update transaction as paid
        await base44.functions.invoke('SupabaseProxy', {
          action: 'update',
          table: 'PayrollTransaction',
          id: transaction.id,
          data: {
            is_paid: true
          }
        });

        const paymentDate = transaction.pay_date;
        const reference = transaction.paycheque_number || 
                         `${transaction.transaction_type}-${format(new Date(paymentDate), 'yyyy-MM-dd')}`;

        // BankTransaction and GLTransaction creation intentionally disabled until GLTransaction is migrated to Supabase.
        void selectedAccount;
        void paymentDate;
        void reference;
      }

      onSuccess();
      onClose();
      setSelectedBankAccount('');
    } catch (err) {
      console.error('Error marking transactions as paid:', err);
      setError(err.message || 'Failed to mark transactions as paid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <DialogTitle>Mark Transactions as Paid</DialogTitle>
              <DialogDescription>
                Record payment for {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="text-sm text-slate-600 mb-2">Transactions to mark as paid:</div>
            <ul className="space-y-2">
              {transactions.map((t) => (
                <li key={t.id} className="flex justify-between items-center">
                  <span className="text-sm">
                    {t.transaction_type} - {t.paycheque_number || format(new Date(t.pay_date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-sm font-semibold">
                    ${(t.transaction_type === 'Paycheque' ? getNetPay(t) : (t.amount || 0)).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t mt-3 pt-3 flex justify-between items-center">
              <span className="font-semibold">Total Amount:</span>
              <span className="text-lg font-bold text-green-600">
                ${totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-account">Payment Account</Label>
            <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
              <SelectTrigger id="bank-account">
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
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleMarkPaid} disabled={loading || !selectedBankAccount} className="bg-green-600 hover:bg-green-700">
            <DollarSign className="w-4 h-4 mr-2" />
            {loading ? 'Processing...' : 'Mark as Paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}