import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ChartOfAccount, LinesOfCredit } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { checkEntityLock } from '../utils/mountainTimeUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LineOfCreditTransactionModal({ open, onClose, lineOfCredit, onTransactionMade, currentUser }) {
  const [formData, setFormData] = useState({
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    reference: '',
    charge_amount: '',
    credit_amount: '',
    source_type: 'manual',
    offset_gl_account: ''
  });

  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);

  useEffect(() => {
    const handleModalOpen = async () => {
      if (open && currentUser && lineOfCredit) {
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
          
          loadChartOfAccounts();
        } catch (error) {
          console.error('Error checking/acquiring lock:', error);
          setIsLocked(true);
          setLockMessage('Failed to acquire lock on account. Please try again.');
        }
      }
    };

    if (open) {
      handleModalOpen();
      // Reset form when opening
      setFormData({
        transaction_date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        reference: '',
        charge_amount: '',
        credit_amount: '',
        source_type: 'manual',
        offset_gl_account: ''
      });
      setError(null);
    }
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
    setFormData(prev => {
      const updates = { [field]: value };
      
      // Auto-fill logic for source_type
      if (field === 'source_type') {
        if (value === 'fee') updates.offset_gl_account = '5150';
        else if (value === 'interest') updates.offset_gl_account = '5152';
        else if (value === 'cashback') updates.offset_gl_account = '4014';
        else if (value === 'manual') updates.offset_gl_account = '';
      }

      // Logic for mutually exclusive amount fields
      if (field === 'charge_amount') {
        // Prevent negative
        if (parseFloat(value) < 0) return prev;
        
        // If entering charge, clear credit
        if (value && parseFloat(value) !== 0) {
          updates.credit_amount = '';
        }
      }

      if (field === 'credit_amount') {
        // Prevent negative
        if (parseFloat(value) < 0) return prev;
        
        // If entering credit, clear charge
        if (value && parseFloat(value) !== 0) {
          updates.charge_amount = '';
        }
      }

      return { ...prev, ...updates };
    });
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

    const chargeAmt = parseFloat(formData.charge_amount || 0);
    const creditAmt = parseFloat(formData.credit_amount || 0);

    if (chargeAmt <= 0 && creditAmt <= 0) {
      setError('Please enter a valid Charge or Credit amount');
      return;
    }

    if (chargeAmt > 0 && creditAmt > 0) {
      setError('Cannot enter both Charge and Credit amounts');
      return;
    }

    if (!formData.offset_gl_account) {
      setError('Please select an offset GL account');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const chargeAmt = parseFloat(formData.charge_amount || 0);
      const creditAmt = parseFloat(formData.credit_amount || 0);
      const isCharge = chargeAmt > 0;

      const response = await base44.functions.invoke('processLineOfCreditTransaction', {
        line_of_credit_id: lineOfCredit.id,
        transaction_date: formData.transaction_date,
        description: formData.description,
        reference: formData.reference,
        transaction_type: isCharge ? 'charge' : 'credit',
        amount: isCharge ? chargeAmt : creditAmt,
        offset_gl_account: formData.offset_gl_account,
        source_type: formData.source_type
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
    <Dialog open={open} onOpenChange={loading ? undefined : handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Manual Transaction</DialogTitle>
        </DialogHeader>

        {isLocked ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lockMessage}</AlertDescription>
          </Alert>
        ) : (
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
              <Label htmlFor="charge_amount" className="text-red-600 font-medium">Charge Amount</Label>
              <Input
                id="charge_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.charge_amount}
                onChange={(e) => handleChange('charge_amount', e.target.value)}
                disabled={loading || (parseFloat(formData.credit_amount) > 0)}
                className="border-red-200 focus:border-red-500 text-red-700 font-medium"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credit_amount" className="text-green-600 font-medium">Credit Amount</Label>
              <Input
                id="credit_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.credit_amount}
                onChange={(e) => handleChange('credit_amount', e.target.value)}
                disabled={loading || (parseFloat(formData.charge_amount) > 0)}
                className="border-green-200 focus:border-green-500 text-green-700 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source_type">Source Type</Label>
              <Select
                value={formData.source_type}
                onValueChange={(value) => handleChange('source_type', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="fee">Fee</SelectItem>
                  <SelectItem value="interest">Interest</SelectItem>
                  <SelectItem value="cashback">Cashback</SelectItem>
                </SelectContent>
              </Select>
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
                  {parseFloat(formData.charge_amount) > 0 ? 'Charge (Draw)' : 'Credit (Refund)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-700">Amount:</span>
                <span className={`text-sm font-bold ${parseFloat(formData.charge_amount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {parseFloat(formData.charge_amount) > 0 ? '+' : '-'}${(parseFloat(formData.charge_amount || 0) + parseFloat(formData.credit_amount || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={loading || !formData.description || (!formData.charge_amount && !formData.credit_amount) || !formData.offset_gl_account || isLocked}
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
        )}
      </DialogContent>
    </Dialog>
  );
}