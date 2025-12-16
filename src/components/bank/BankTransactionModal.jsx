import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { BankTransaction, ChartOfAccount } from '@/entities/all';

export default function BankTransactionModal({ open, onClose, bankAccountId, transaction, onSubmit }) {
  const [formData, setFormData] = useState({
    bank_account_id: '',
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    reference: '',
    credit_amount: '',
    debit_amount: '',
    balance: '', // This will still be part of formData for initial load but not used for calculation here
    cleared: false,
    reconciled: false,
    source_type: 'manual',
    source_id: '',
    gl_account: ''
  });

  const [chartOfAccounts, setChartOfAccounts] = useState([]);

  useEffect(() => {
    if (open) {
      loadChartOfAccounts();
      
      if (transaction) {
        // Editing existing transaction
        setFormData({
          bank_account_id: transaction.bank_account_id || '',
          transaction_date: transaction.transaction_date || format(new Date(), 'yyyy-MM-dd'),
          description: transaction.description || '',
          reference: transaction.reference || '',
          credit_amount: transaction.credit_amount || '',
          debit_amount: transaction.debit_amount || '',
          balance: transaction.balance || '',
          cleared: transaction.cleared || false,
          reconciled: transaction.reconciled || false,
          source_type: transaction.source_type || 'manual',
          source_id: transaction.source_id || '',
          gl_account: transaction.gl_account || ''
        });
      } else {
        // Creating new transaction
        setFormData({
          bank_account_id: bankAccountId || '',
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          description: '',
          reference: '',
          credit_amount: '',
          debit_amount: '',
          balance: '',
          cleared: false,
          reconciled: false,
          source_type: 'manual',
          source_id: '',
          gl_account: ''
        });
      }
    }
  }, [open, transaction, bankAccountId]);

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
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.description.trim()) {
      alert('Please enter a description');
      return;
    }

    if (!formData.transaction_date) {
      alert('Please select a transaction date');
      return;
    }

    if (!formData.gl_account) {
      alert('Please select a GL Account');
      return;
    }

    // Convert amounts to numbers - balance will be calculated by backend
    const submitData = {
      ...formData,
      credit_amount: parseFloat(formData.credit_amount) || 0,
      debit_amount: parseFloat(formData.debit_amount) || 0
      // balance is no longer sent from frontend, backend will calculate it
    };

    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Transaction Date *</Label>
              <Input
                id="transaction_date"
                type="date"
                value={formData.transaction_date}
                onChange={(e) => handleChange('transaction_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Check #, Confirmation #, etc."
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
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
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="debit_amount" className="text-red-600">Debit Amount</Label>
              <Input
                id="debit_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.debit_amount}
                onChange={(e) => handleChange('debit_amount', e.target.value)}
                className="border-red-300 focus:border-red-500 text-red-600 font-semibold"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credit_amount" className="text-green-600">Credit Amount</Label>
              <Input
                id="credit_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.credit_amount}
                onChange={(e) => handleChange('credit_amount', e.target.value)}
                className="border-green-300 focus:border-green-500 text-green-600 font-semibold"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source_type">Source Type</Label>
              <Select
                value={formData.source_type}
                onValueChange={(value) => handleChange('source_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="fee">Bank Fee</SelectItem>
                  <SelectItem value="interest">Interest</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gl_account">GL Account *</Label>
              <Select
                value={formData.gl_account}
                onValueChange={(value) => handleChange('gl_account', value)}
                required
              >
                <SelectTrigger className={!formData.gl_account ? 'border-red-300' : ''}>
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
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="cleared"
                checked={formData.cleared}
                onCheckedChange={(checked) => handleChange('cleared', checked)}
              />
              <Label htmlFor="cleared" className="cursor-pointer">Cleared</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="reconciled"
                checked={formData.reconciled}
                onCheckedChange={(checked) => handleChange('reconciled', checked)}
              />
              <Label htmlFor="reconciled" className="cursor-pointer">Reconciled</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{transaction ? 'Update' : 'Create'} Transaction</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}