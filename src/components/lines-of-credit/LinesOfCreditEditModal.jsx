import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartOfAccount, LinesOfCredit } from '@/entities/all';
import { checkEntityLock } from '../utils/mountainTimeUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function LinesOfCreditEditModal({ open, onClose, lineOfCredit, onSubmit, currentUser }) {
  const [formData, setFormData] = useState({
    name: '',
    institution_name: '',
    account_number: '',
    credit_limit: '',
    current_balance: '',
    interest_rate: '',
    gl_account: '',
    is_active: true,
    notes: ''
  });
  const [accounts, setAccounts] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);

  useEffect(() => {
    const handleModalOpen = async () => {
      if (open && currentUser) {
        if (lineOfCredit) {
          try {
            // Always fetch the latest account data to check lock status
            const account = await LinesOfCredit.get(lineOfCredit.id);
            const lockStatus = checkEntityLock(account, currentUser.email);

            if (lockStatus.isLocked) {
              setIsLocked(true);
              setLockMessage(`This account is currently locked by ${lockStatus.lockedByUser}. Please try again later.`);
              return;
            }

            // Acquire lock
            await LinesOfCredit.update(lineOfCredit.id, {
              locked_by_user: currentUser.email,
              locked_timestamp: new Date().toISOString()
            });
            
            setLockAcquired(true);
            setIsLocked(false);
            setLockMessage('');
          } catch (error) {
            console.error('Error checking/acquiring lock:', error);
            setIsLocked(true);
            setLockMessage('Failed to acquire lock on account. Please try again.');
          }
        }
        
        // Load GL accounts
        const accountsData = await ChartOfAccount.filter({ account_type: 'Liability' }, 'account_number');
        setAccounts(accountsData);
      }
    };

    handleModalOpen();
  }, [open, lineOfCredit, currentUser]);

  // Release lock on close
  useEffect(() => {
    return () => {
      if (!open && lockAcquired && currentUser && lineOfCredit) {
        // Release lock when modal closes
        LinesOfCredit.update(lineOfCredit.id, {
          locked_by_user: null,
          locked_timestamp: null
        }).catch(error => {
          console.error('Error releasing lock:', error);
        });
        setLockAcquired(false);
      }
    };
  }, [open, lockAcquired, currentUser, lineOfCredit]);

  const handleClose = () => {
    // Release lock before closing
    if (lockAcquired && currentUser && lineOfCredit) {
      LinesOfCredit.update(lineOfCredit.id, {
        locked_by_user: null,
        locked_timestamp: null
      }).catch(error => {
        console.error('Error releasing lock on close:', error);
      });
      setLockAcquired(false);
    }
    onClose();
  };

  useEffect(() => {
    if (lineOfCredit) {
      setFormData({
        name: lineOfCredit.name || '',
        institution_name: lineOfCredit.institution_name || '',
        account_number: lineOfCredit.account_number || '',
        credit_limit: lineOfCredit.credit_limit || '',
        current_balance: lineOfCredit.current_balance || '',
        interest_rate: lineOfCredit.interest_rate || '',
        gl_account: lineOfCredit.gl_account || '',
        is_active: lineOfCredit.is_active !== undefined ? lineOfCredit.is_active : true,
        notes: lineOfCredit.notes || ''
      });
    } else {
      setFormData({
        name: '',
        institution_name: '',
        account_number: '',
        credit_limit: '',
        current_balance: '',
        interest_rate: '',
        gl_account: '',
        is_active: true,
        notes: ''
      });
    }
  }, [lineOfCredit, open]);

  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSelectChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.institution_name.trim() || !formData.credit_limit) {
      alert('Account name, institution name, and credit limit are required.');
      return;
    }
    
    const submitData = {
      ...formData,
      credit_limit: parseFloat(formData.credit_limit) || 0,
      current_balance: parseFloat(formData.current_balance) || 0,
      interest_rate: parseFloat(formData.interest_rate) || 0
    };
    
    // Calculate available credit
    submitData.available_credit = submitData.credit_limit - submitData.current_balance;
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lineOfCredit ? 'Edit Line of Credit' : 'Add New Line of Credit'}</DialogTitle>
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
              <Label htmlFor="name">Account Name *</Label>
              <Input id="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="institution_name">Institution Name *</Label>
              <Input id="institution_name" value={formData.institution_name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input id="account_number" value={formData.account_number} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit_limit">Credit Limit *</Label>
              <Input id="credit_limit" type="number" step="0.01" value={formData.credit_limit} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_balance">Current Balance</Label>
              <Input id="current_balance" type="number" step="0.01" value={formData.current_balance} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest_rate">Interest Rate (%)</Label>
              <Input id="interest_rate" type="number" step="0.01" value={formData.interest_rate} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gl_account">GL Account</Label>
              <Select value={formData.gl_account} onValueChange={(value) => handleSelectChange('gl_account', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a GL account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(account => (
                    <SelectItem key={account.id} value={account.account_number}>
                      {account.account_number} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-6">
                <input 
                  type="checkbox" 
                  id="is_active" 
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="rounded border-slate-300"
                />
                <Label htmlFor="is_active">Active Account</Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={formData.notes} onChange={handleChange} rows={3} />
          </div>
          
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={isLocked}>Save Account</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}