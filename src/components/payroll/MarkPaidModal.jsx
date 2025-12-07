import React, { useState, useEffect } from 'react';
import { PayrollTransaction, BankAccount, GLTransaction } from '@/entities/all';
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
      const accounts = await BankAccount.filter({ is_active: true });
      setBankAccounts(accounts);
      if (accounts.length > 0) {
        setSelectedBankAccount(accounts[0].id);
      }
    } catch (err) {
      console.error('Error loading bank accounts:', err);
      setError('Failed to load bank accounts');
    }
  };

  const totalAmount = transactions.reduce((sum, t) => {
    if (t.transaction_type === 'Paycheque') {
      return sum + (t.net_pay || 0);
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
        await PayrollTransaction.update(transaction.id, {
          is_paid: true
        });

        // Create GL transactions based on transaction type
        const paymentDate = transaction.pay_date;
        const reference = transaction.paycheque_number || 
                         `${transaction.transaction_type}-${format(new Date(paymentDate), 'yyyy-MM-dd')}`;

        if (transaction.transaction_type === 'Paycheque') {
          // Credit Bank Account (payment out)
          await GLTransaction.create({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Paycheque payment ${transaction.paycheque_number || ''}`,
            reference: reference,
            debit_amount: 0,
            credit_amount: transaction.net_pay || 0,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Debit Payroll Expense Account
          await GLTransaction.create({
            account_number: '5000', // Payroll expense account
            transaction_date: paymentDate,
            description: `Payroll expense ${transaction.paycheque_number || ''}`,
            reference: reference,
            debit_amount: transaction.gross_pay || 0,
            credit_amount: 0,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Credit various payable accounts for deductions
          if (transaction.income_tax && transaction.income_tax > 0) {
            await GLTransaction.create({
              account_number: '2100', // Income Tax Payable
              transaction_date: paymentDate,
              description: `Income tax withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.income_tax,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          if (transaction.cpp_contribution && transaction.cpp_contribution > 0) {
            await GLTransaction.create({
              account_number: '2110', // CPP Payable
              transaction_date: paymentDate,
              description: `CPP withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.cpp_contribution,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          if (transaction.cpp2_contribution && transaction.cpp2_contribution > 0) {
            await GLTransaction.create({
              account_number: '2111', // CPP2 Payable
              transaction_date: paymentDate,
              description: `CPP2 withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.cpp2_contribution,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          if (transaction.ei_premium && transaction.ei_premium > 0) {
            await GLTransaction.create({
              account_number: '2120', // EI Payable
              transaction_date: paymentDate,
              description: `EI withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.ei_premium,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

        } else if (transaction.transaction_type === 'Remittance') {
          // Credit Bank Account (remittance payment out)
          await GLTransaction.create({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Remittance payment - ${transaction.remittance_type || ''}`,
            reference: reference,
            debit_amount: 0,
            credit_amount: transaction.amount || 0,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Debit the appropriate payable account
          let payableAccount = '2100'; // Default to tax payable
          if (transaction.remittance_type === 'CPP') {
            payableAccount = '2110';
          } else if (transaction.remittance_type === 'EI') {
            payableAccount = '2120';
          }

          await GLTransaction.create({
            account_number: payableAccount,
            transaction_date: paymentDate,
            description: `Remittance paid - ${transaction.remittance_type || ''}`,
            reference: reference,
            debit_amount: transaction.amount || 0,
            credit_amount: 0,
            source_type: 'payment',
            source_id: transaction.id
          });

        } else if (transaction.transaction_type === 'Adjustment') {
          // Handle adjustments - credit or debit based on positive/negative amount
          const amount = Math.abs(transaction.amount || 0);
          const isPositive = (transaction.amount || 0) >= 0;

          await GLTransaction.create({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Payroll adjustment - ${transaction.adjustment_reason || ''}`,
            reference: reference,
            debit_amount: isPositive ? 0 : amount,
            credit_amount: isPositive ? amount : 0,
            source_type: 'adjustment',
            source_id: transaction.id
          });

          await GLTransaction.create({
            account_number: '5000', // Payroll expense account
            transaction_date: paymentDate,
            description: `Payroll adjustment - ${transaction.adjustment_reason || ''}`,
            reference: reference,
            debit_amount: isPositive ? amount : 0,
            credit_amount: isPositive ? 0 : amount,
            source_type: 'adjustment',
            source_id: transaction.id
          });
        }
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
                    ${(t.net_pay || t.amount || 0).toFixed(2)}
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