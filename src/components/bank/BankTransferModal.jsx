import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeftRight, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { BankAccount } from '@/entities/all';
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
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [locksAcquired, setLocksAcquired] = useState([]);

  useEffect(() => {
    const handleModalOpen = async () => {
      if (open && formData.fromAccountId && formData.toAccountId && currentUser) {
        try {
          // Check both accounts
          const fromAccount = bankAccounts.find(acc => acc.id === formData.fromAccountId);
          const toAccount = bankAccounts.find(acc => acc.id === formData.toAccountId);

          if (!fromAccount || !toAccount) return;

          const fromLockStatus = checkBankAccountLock(fromAccount, currentUser.email);
          const toLockStatus = checkBankAccountLock(toAccount, currentUser.email);

          if (fromLockStatus.isLocked) {
            setIsLocked(true);
            setLockMessage(`Source account is locked by ${fromLockStatus.lockedByUser}. Please try again later.`);
            return;
          }

          if (toLockStatus.isLocked) {
            setIsLocked(true);
            setLockMessage(`Destination account is locked by ${toLockStatus.lockedByUser}. Please try again later.`);
            return;
          }

          // Acquire locks on both accounts
          const locks = [];
          
          await BankAccount.update(formData.fromAccountId, {
            locked_by_user: currentUser.email,
            locked_timestamp: new Date().toISOString()
          });
          locks.push(formData.fromAccountId);

          await BankAccount.update(formData.toAccountId, {
            locked_by_user: currentUser.email,
            locked_timestamp: new Date().toISOString()
          });
          locks.push(formData.toAccountId);

          setLocksAcquired(locks);
          setIsLocked(false);
          setLockMessage('');
        } catch (error) {
          console.error('Error checking/acquiring locks:', error);
          setIsLocked(true);
          setLockMessage('Failed to acquire locks on bank accounts. Please try again.');
        }
      }
    };

    handleModalOpen();
  }, [open, formData.fromAccountId, formData.toAccountId, bankAccounts, currentUser]);

  // Release locks on close
  useEffect(() => {
    return () => {
      if (!open && locksAcquired.length > 0 && currentUser) {
        // Release all acquired locks
        locksAcquired.forEach(accountId => {
          BankAccount.update(accountId, {
            locked_by_user: null,
            locked_timestamp: null
          }).catch(error => {
            console.error('Error releasing lock:', error);
          });
        });
        setLocksAcquired([]);
      }
    };
  }, [open, locksAcquired, currentUser]);

  useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setFormData({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        transferDate: format(new Date(), 'yyyy-MM-dd'),
        description: ''
      });
      setValidationError('');
      setIsLocked(false);
      setLockMessage('');
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

    // Optional: Check if source account has sufficient funds
    const fromAccount = bankAccounts.find(acc => acc.id === formData.fromAccountId);
    if (fromAccount && fromAccount.current_balance < amount) {
      setValidationError(`Insufficient funds in ${fromAccount.name}. Available: $${fromAccount.current_balance.toFixed(2)}`);
      return false;
    }

    if (!formData.transferDate) {
      setValidationError('Please select a transfer date');
      return false;
    }

    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    onSubmit({
      fromAccountId: formData.fromAccountId,
      toAccountId: formData.toAccountId,
      amount: parseFloat(formData.amount),
      transferDate: formData.transferDate,
      description: formData.description || 'Bank Transfer'
    });
  };

  const handleClose = () => {
    // Release locks before closing
    if (locksAcquired.length > 0 && currentUser) {
      locksAcquired.forEach(accountId => {
        BankAccount.update(accountId, {
          locked_by_user: null,
          locked_timestamp: null
        }).catch(error => {
          console.error('Error releasing lock on close:', error);
        });
      });
      setLocksAcquired([]);
    }
    onClose();
  };

  // Get available destination accounts (exclude the selected source account)
  const availableToAccounts = bankAccounts.filter(
    acc => acc.id !== formData.fromAccountId
  );

  // Get available source accounts (exclude the selected destination account)
  const availableFromAccounts = bankAccounts.filter(
    acc => acc.id !== formData.toAccountId
  );

  const fromAccount = bankAccounts.find(acc => acc.id === formData.fromAccountId);
  const toAccount = bankAccounts.find(acc => acc.id === formData.toAccountId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Transfer Funds Between Accounts
          </DialogTitle>
        </DialogHeader>

        {isLocked ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lockMessage}</AlertDescription>
          </Alert>
        ) : (
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
                  <SelectTrigger className={!formData.fromAccountId ? 'border-red-300' : ''}>
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
                  <p className="text-xs text-slate-500">
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
                  <SelectTrigger className={!formData.toAccountId ? 'border-red-300' : ''}>
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
                  <p className="text-xs text-slate-500">
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
                  className={!formData.amount || parseFloat(formData.amount) <= 0 ? 'border-red-300' : ''}
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

            {/* Transfer Summary */}
            {formData.fromAccountId && formData.toAccountId && formData.amount && parseFloat(formData.amount) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" />
                  Transfer Summary
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">From:</span>
                    <span className="font-medium">{fromAccount?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">To:</span>
                    <span className="font-medium">{toAccount?.name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-slate-600">Amount:</span>
                    <span className="font-bold text-blue-700">${parseFloat(formData.amount).toFixed(2)}</span>
                  </div>
                  {fromAccount && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">New {fromAccount.name} balance:</span>
                      <span className="text-slate-700">
                        ${((fromAccount.current_balance || 0) - parseFloat(formData.amount)).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {toAccount && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">New {toAccount.name} balance:</span>
                      <span className="text-slate-700">
                        ${((toAccount.current_balance || 0) + parseFloat(formData.amount)).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isLocked}>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Transfer Funds
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}