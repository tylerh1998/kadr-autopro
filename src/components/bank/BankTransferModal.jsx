import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeftRight, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { checkBankAccountLock } from '../utils/mountainTimeUtils';

export default function BankTransferModal({ open, onClose, bankAccounts, onSubmit, currentUser }) {
  const [formData, setFormData] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    transferDate: format(new Date(), 'yyyy-MM-dd'),
    description: ''
  });

  const [validationError, setValidationError] = useState('');
  const [locksAcquired, setLocksAcquired] = useState([]);
  const [prevAccounts, setPrevAccounts] = useState({ from: '', to: '' });
  const [lockedByOthers, setLockedByOthers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getBankAccount = async (accountId) => {
    const { data, error } = await supabase
      .from('BankAccount')
      .select('*')
      .eq('id', accountId);
    if (error) throw error;
    return data?.[0] || null;
  };

  const updateBankAccount = async (accountId, data) => {
    await supabase
      .from('BankAccount')
      .update(data)
      .eq('id', accountId);
  };

  const releaseLock = async (accountId) => {
    if (!accountId || !currentUser) return;

    setLockedByOthers(prev => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });

    if (locksAcquired.includes(accountId)) {
      try {
        await updateBankAccount(accountId, {
          locked_by_user: null,
          locked_timestamp: null
        });
        setLocksAcquired(prev => prev.filter(id => id !== accountId));
      } catch (error) {
        console.error('Error releasing lock:', error);
      }
    }
  };

  const acquireLock = async (accountId) => {
    if (!accountId || !currentUser) return;
    if (locksAcquired.includes(accountId)) return;

    try {
      const account = await getBankAccount(accountId);
      const lockStatus = checkBankAccountLock(account, currentUser.email);

      if (lockStatus.isLocked) {
        setLockedByOthers(prev => ({
          ...prev,
          [accountId]: lockStatus.lockedByUser
        }));
        return;
      }

      setLockedByOthers(prev => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });

      await updateBankAccount(accountId, {
        locked_by_user: currentUser.email,
        locked_timestamp: new Date().toISOString()
      });

      setLocksAcquired(prev => [...prev, accountId]);
    } catch (error) {
      console.error('Error acquiring lock:', error);
    }
  };

  useEffect(() => {
    if (!open || !currentUser) return;

    const handleSelectionChange = async () => {
      if (formData.fromAccountId !== prevAccounts.from) {
        if (prevAccounts.from) await releaseLock(prevAccounts.from);
        if (formData.fromAccountId) await acquireLock(formData.fromAccountId);
      }

      if (formData.toAccountId !== prevAccounts.to) {
        if (prevAccounts.to) await releaseLock(prevAccounts.to);
        if (formData.toAccountId) await acquireLock(formData.toAccountId);
      }

      setPrevAccounts({
        from: formData.fromAccountId,
        to: formData.toAccountId
      });
    };

    handleSelectionChange();
  }, [formData.fromAccountId, formData.toAccountId, open, currentUser]);

  useEffect(() => {
    return () => {
      if (locksAcquired.length > 0) {
        locksAcquired.forEach(accountId => {
          updateBankAccount(accountId, {
            locked_by_user: null,
            locked_timestamp: null
          }).catch(console.error);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!open && locksAcquired.length > 0) {
      locksAcquired.forEach(accountId => {
        updateBankAccount(accountId, {
          locked_by_user: null,
          locked_timestamp: null
        }).catch(console.error);
      });
      setLocksAcquired([]);
      setPrevAccounts({ from: '', to: '' });
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setFormData({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        transferDate: format(new Date(), 'yyyy-MM-dd'),
        description: ''
      });
      setValidationError('');
      setLockedByOthers({});
    }
  }, [open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setValidationError('');
  };

  const validateForm = () => {
    if (!formData.fromAccountId) {
      setValidationError('Please select a source account');
      return false;
    }

    if (!formData.toAccountId) {
      setValidationError('Please select a destination account');
      return false;
    }

    if (formData.fromAccountId === formData.toAccountId) {
      setValidationError('Source and destination accounts must be different');
      return false;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      setValidationError('Please enter a valid transfer amount greater than 0');
      return false;
    }

    if (!formData.transferDate) {
      setValidationError('Please select a transfer date');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        fromAccountId: formData.fromAccountId,
        toAccountId: formData.toAccountId,
        amount: parseFloat(formData.amount),
        transferDate: formData.transferDate,
        description: formData.description && formData.description.trim()
          ? `Bank Transfer - ${formData.description.trim()}`
          : 'Bank Transfer'
      });
    } catch (error) {
      console.error('Transfer error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (locksAcquired.length > 0 && currentUser) {
      locksAcquired.forEach(accountId => {
        updateBankAccount(accountId, {
          locked_by_user: null,
          locked_timestamp: null
        }).catch(error => {
          console.error('Error releasing lock on close:', error);
        });
      });
      setLocksAcquired([]);
      setPrevAccounts({ from: '', to: '' });
    }
    onClose();
  };

  const availableToAccounts = bankAccounts.filter(acc => acc.id !== formData.fromAccountId);
  const availableFromAccounts = bankAccounts.filter(acc => acc.id !== formData.toAccountId);

  const fromAccount = bankAccounts.find(acc => acc.id === formData.fromAccountId);
  const toAccount = bankAccounts.find(acc => acc.id === formData.toAccountId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Transfer Funds Between Accounts
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromAccount">From Account *</Label>
              <Select
                value={formData.fromAccountId}
                onValueChange={(value) => handleChange('fromAccountId', value)}
                required
              >
                <SelectTrigger className={!formData.fromAccountId ? 'border-red-300 dark:border-red-700' : ''}>
                  <SelectValue placeholder="Select source account..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFromAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} - ${(account.current_balance || 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromAccount && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Available Balance: ${(fromAccount.current_balance || 0).toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="toAccount">To Account *</Label>
              <Select
                value={formData.toAccountId}
                onValueChange={(value) => handleChange('toAccountId', value)}
                required
              >
                <SelectTrigger className={!formData.toAccountId ? 'border-red-300 dark:border-red-700' : ''}>
                  <SelectValue placeholder="Select destination account..." />
                </SelectTrigger>
                <SelectContent>
                  {availableToAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} - ${(account.current_balance || 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toAccount && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Current Balance: ${(toAccount.current_balance || 0).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Transfer Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                required
                className={!formData.amount || parseFloat(formData.amount) <= 0 ? 'border-red-300 dark:border-red-700' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transferDate">Transfer Date *</Label>
              <Input
                id="transferDate"
                type="date"
                value={formData.transferDate}
                onChange={(e) => handleChange('transferDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Transfer description or notes..."
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
            />
          </div>

          {formData.fromAccountId && formData.toAccountId && formData.amount && parseFloat(formData.amount) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" />
                Transfer Summary
              </h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">From:</span>
                  <span className="font-medium">{fromAccount?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">To:</span>
                  <span className="font-medium">{toAccount?.name}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-slate-600 dark:text-slate-400">Amount:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-400">${parseFloat(formData.amount).toFixed(2)}</span>
                </div>
                {fromAccount && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">New {fromAccount.name} balance:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      ${((fromAccount.current_balance || 0) - parseFloat(formData.amount)).toFixed(2)}
                    </span>
                  </div>
                )}
                {toAccount && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">New {toAccount.name} balance:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      ${((toAccount.current_balance || 0) + parseFloat(formData.amount)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {Object.keys(lockedByOthers).length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The following accounts are locked:
                <ul className="list-disc pl-5 mt-1">
                  {Object.entries(lockedByOthers).map(([id, user]) => {
                    const acc = bankAccounts.find(a => a.id === id);
                    return (
                      <li key={id}>
                        {acc ? acc.name : 'Account'} is locked by {user}
                      </li>
                    );
                  })}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={Object.keys(lockedByOthers).length > 0 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4 mr-2" />
                  Transfer Funds
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}