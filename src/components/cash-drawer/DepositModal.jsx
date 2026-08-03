import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

import { checkBankAccountLock } from '../utils/mountainTimeUtils';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function DepositModal({ open, onClose, bankAccounts, totalAmount, forDepositItems, onSubmit }) {
  const { employee } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);
  const [formData, setFormData] = useState({
    bankAccountId: '',
    depositDate: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  });

  useEffect(() => {
    if (open) {
      const primaryAccount = bankAccounts.find(acc => acc.primary);
      setFormData({
        bankAccountId: primaryAccount?.id || bankAccounts[0]?.id || '',
        depositDate: format(new Date(), 'yyyy-MM-dd'),
        notes: ''
      });
    }
  }, [open, bankAccounts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.bankAccountId) {
      alert('Please select a bank account.');
      return;
    }

    setLoading(true);
    try {
      // Check if bank account is locked
      const accountResponse = await base44.functions.invoke('SupabaseProxy', {
        action: 'filter',
        table: 'BankAccount',
        params: { id: formData.bankAccountId }
      });
      const account = accountResponse.data?.data?.[0];
      
      // Check if any lock exists (even for current user) that is not expired
      if (account?.locked_by_user && account?.locked_timestamp) {
        const lockStatus = checkBankAccountLock(account, currentUser?.email || '');
        
        // If lock is not expired, show error (regardless of who owns it)
        if (!lockStatus.isExpired) {
          alert(`This bank account is currently locked by ${account.locked_by_user}. Please wait until the lock is released before making a deposit.`);
          setLoading(false);
          return;
        }
      }

      await onSubmit(formData);
    } catch (error) {
      console.error('Error processing deposit:', error);
      alert('Failed to process deposit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedBankAccount = bankAccounts.find(acc => acc.id === formData.bankAccountId);

  // Calculate breakdown by payment method
  const getDepositBreakdown = () => {
    if (!forDepositItems) return [];
    
    const breakdown = [];
    const paymentMethods = ['cash', 'debit', 'credit_card', 'cheque', 'e_transfer', 'other'];
    
    paymentMethods.forEach(method => {
      const items = forDepositItems[method] || [];
      if (items.length > 0) {
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        breakdown.push({
          method: method,
          displayName: method.replace('_', ' ').charAt(0).toUpperCase() + method.replace('_', ' ').slice(1),
          count: items.length,
          total: total
        });
      }
    });
    
    return breakdown;
  };

  const breakdown = getDepositBreakdown();
  const hasMultipleMethods = breakdown.length > 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Make Deposit
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Deposit Summary */}
          <div className="space-y-2">
            <Label>Deposit Summary</Label>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              {breakdown.length === 0 ? (
                <p className="text-sm text-slate-600">No items selected for deposit</p>
              ) : hasMultipleMethods ? (
                <>
                  {breakdown.map(item => (
                    <div key={item.method} className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">
                        {item.displayName} ({item.count} {item.count === 1 ? 'item' : 'items'})
                      </span>
                      <span className="font-medium text-slate-900">${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-900">Total</span>
                    <span className="text-lg font-bold text-slate-900">${totalAmount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{breakdown[0].displayName}</p>
                    <p className="text-xs text-slate-600">{breakdown[0].count} {breakdown[0].count === 1 ? 'item' : 'items'}</p>
                  </div>
                  <span className="text-lg font-bold text-slate-900">${totalAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankAccountId">Deposit To Bank Account *</Label>
            <Select
              value={formData.bankAccountId}
              onValueChange={(value) => setFormData(prev => ({...prev, bankAccountId: value}))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bank account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} - {account.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="depositDate">Deposit Date *</Label>
            <Input
              id="depositDate"
              type="date"
              value={formData.depositDate}
              onChange={(e) => setFormData(prev => ({...prev, depositDate: e.target.value}))}
              required
            />
          </div>

          {/* GL Account info removed from UI */}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Optional deposit notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Process Deposit
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}