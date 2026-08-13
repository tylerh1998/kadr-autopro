import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { checkBankAccountLock } from '../utils/mountainTimeUtils';

export default function BankTransactionModal({ open, onClose, bankAccountId, bankAccount, transaction, onSubmit, onDelete, currentUser }) {
  const [formData, setFormData] = useState({
    bank_account_id: '',
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

  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const handleModalOpen = async () => {
      if (open && currentUser && bankAccountId) {
        try {
          // Always fetch the latest account data to check lock status
          const { data: accountData, error: accountError } = await supabase
            .from('BankAccount')
            .select('*')
            .eq('id', bankAccountId);
          if (accountError) throw accountError;
          const account = accountData?.[0];
          const lockStatus = checkBankAccountLock(account, currentUser.email);

          if (lockStatus.isLocked) {
            setIsLocked(true);
            setLockMessage(`This bank account is currently locked by ${lockStatus.lockedByUser}. Please try again later.`);
            return;
          }

          // Acquire lock
          await supabase
            .from('BankAccount')
            .update({
              locked_by_user: currentUser.email,
              locked_timestamp: new Date().toISOString()
            })
            .eq('id', bankAccountId);
          
          setLockAcquired(true);
          setIsLocked(false);
          setLockMessage('');

          // Load chart of accounts
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
        } catch (error) {
          console.error('Error checking/acquiring lock:', error);
          setIsLocked(true);
          setLockMessage('Failed to acquire lock on bank account. Please try again.');
        }
      }
    };

    handleModalOpen();
  }, [open, transaction, bankAccountId, bankAccount, currentUser]);

  // Release lock on close
  useEffect(() => {
    if (!open && lockAcquired && currentUser && bankAccountId) {
      // Release lock when modal closes
      supabase
        .from('BankAccount')
        .update({
          locked_by_user: null,
          locked_timestamp: null
        })
        .eq('id', bankAccountId)
        .then(({ error }) => {
          if (error) console.error('Error releasing lock:', error);
        });
      setLockAcquired(false);
    }
  }, [open, lockAcquired, currentUser, bankAccountId]);

  const loadChartOfAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('ChartOfAccount')
        .select('*')
        .eq('is_active', true)
        .order('account_number');
      if (error) throw error;
      setChartOfAccounts(data || []);
    } catch (error) {
      console.error('Error loading chart of accounts:', error);
      setChartOfAccounts([]);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Helper to determine active values
      const type = field === 'source_type' ? value : newData.source_type;
      const debit = parseFloat(field === 'debit_amount' ? value : newData.debit_amount) || 0;
      const credit = parseFloat(field === 'credit_amount' ? value : newData.credit_amount) || 0;

      // Autofill GL Account logic
      // We run this if source_type changes, OR if amounts change while source_type is 'interest'
      if (field === 'source_type' || (type === 'interest' && (field === 'debit_amount' || field === 'credit_amount'))) {
        if (type === 'fee') newData.gl_account = '5150';
        else if (type === 'payment_card_fee') newData.gl_account = '5151';
        else if (type === 'registries') newData.gl_account = '4101';
        else if (type === 'interest') {
          if (debit > 0) newData.gl_account = '5152';
          else if (credit > 0) newData.gl_account = '4013';
        }
      }
      
      return newData;
    });
  };

  const handleSubmit = async (e) => {
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

    // Convert amounts to numbers
    const submitData = {
      ...formData,
      credit_amount: parseFloat(formData.credit_amount) || 0,
      debit_amount: parseFloat(formData.debit_amount) || 0
    };

    delete submitData.balance;

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      // Error handling is done in parent, but we need to stop loading
    } finally {
      if (open) setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this transaction? This action will reverse any associated GL entries.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(transaction);
    } catch (error) {
      // Error handling is done in parent
    } finally {
      if (open) setIsDeleting(false);
    }
  };

  const handleClose = () => {
    // Release lock before closing
    if (lockAcquired && currentUser && bankAccountId) {
      supabase
        .from('BankAccount')
        .update({
          locked_by_user: null,
          locked_timestamp: null
        })
        .eq('id', bankAccountId)
        .then(({ error }) => {
          if (error) console.error('Error releasing lock on close:', error);
        });
      setLockAcquired(false);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
        </DialogHeader>
        
        {isLocked ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lockMessage}</AlertDescription>
          </Alert>
        ) : (
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
                <Label htmlFor="debit_amount" className="text-red-600 dark:text-red-400">Debit Amount</Label>
                <Input
                  id="debit_amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.debit_amount}
                  onChange={(e) => handleChange('debit_amount', e.target.value)}
                  className="border-red-300 dark:border-red-700 focus:border-red-500 text-red-600 dark:text-red-400 font-semibold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit_amount" className="text-green-600 dark:text-green-400">Credit Amount</Label>
                <Input
                  id="credit_amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.credit_amount}
                  onChange={(e) => handleChange('credit_amount', e.target.value)}
                  className="border-green-300 dark:border-green-700 focus:border-green-500 text-green-600 dark:text-green-400 font-semibold"
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
                    <SelectItem value="fee">Bank Fee</SelectItem>
                    <SelectItem value="interest">Interest</SelectItem>
                    <SelectItem value="payment_card_fee">Payment Card Fee</SelectItem>
                    <SelectItem value="registries">Registries</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gl_account">GL Account *</Label>
                <Select
                  value={String(formData.gl_account || '')}
                  onValueChange={(value) => handleChange('gl_account', value)}
                  required
                >
                  <SelectTrigger className={!formData.gl_account ? 'border-red-300 dark:border-red-700' : ''}>
                    <SelectValue placeholder="Select GL Account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {chartOfAccounts.filter(account => !account.controlled).map((account) => (
                      <SelectItem key={account.id} value={String(account.account_number)}>
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
                  disabled={true}
                  onCheckedChange={(checked) => handleChange('cleared', checked)}
                />
                <Label htmlFor="cleared" className="cursor-not-allowed opacity-70">Cleared</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reconciled"
                  checked={formData.reconciled}
                  disabled={true}
                  onCheckedChange={(checked) => handleChange('reconciled', checked)}
                />
                <Label htmlFor="reconciled" className="cursor-not-allowed opacity-70">Reconciled</Label>
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
              {transaction && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={isLocked || isSubmitting || isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting || isDeleting}>Cancel</Button>
                <Button type="submit" disabled={isLocked || isSubmitting || isDeleting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {transaction ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>{transaction ? 'Update' : 'Create'} Transaction</>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}