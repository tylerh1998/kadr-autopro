import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';

export default function BankAccountEditModal({ open, onClose, bankAccount, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    bank_name: '',
    account_number: '',
    account_type: 'Checking',
    current_balance: '',
    gl_account: '',
    routing_number: '',
    is_active: true,
    notes: ''
  });
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    const loadAccounts = async () => {
      // Fetch only 'Asset' type accounts for GL Account selection
      const { data: accountsData, error } = await supabase
        .from('ChartOfAccount')
        .select('*')
        .eq('account_type', 'Asset')
        .order('account_number');
      if (error) {
        console.error('Error loading GL accounts:', error);
        setAccounts([]);
        return;
      }
      setAccounts(accountsData || []);
    };
    if (open) {
      loadAccounts();
    }
  }, [open]);

  useEffect(() => {
    if (bankAccount) {
      setFormData({
        name: bankAccount.name || '',
        bank_name: bankAccount.bank_name || '',
        account_number: bankAccount.account_number || '',
        account_type: bankAccount.account_type || 'Checking',
        current_balance: bankAccount.current_balance || '',
        gl_account: bankAccount.gl_account || '',
        routing_number: bankAccount.routing_number || '',
        is_active: bankAccount.is_active !== undefined ? bankAccount.is_active : true,
        notes: bankAccount.notes || ''
      });
    } else {
      setFormData({
        name: '',
        bank_name: '',
        account_number: '',
        account_type: 'Checking',
        current_balance: '',
        gl_account: '',
        routing_number: '',
        is_active: true,
        notes: ''
      });
    }
  }, [bankAccount, open]);

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
    if (!formData.name.trim() || !formData.bank_name.trim()) {
      alert('Account name and bank name are required.');
      return;
    }
    
    const submitData = {
      ...formData,
      current_balance: parseFloat(formData.current_balance) || 0
    };
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bankAccount ? 'Edit Bank Account' : 'Add New Bank Account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name *</Label>
              <Input id="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name *</Label>
              <Input id="bank_name" value={formData.bank_name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input id="account_number" value={formData.account_number} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type">Account Type</Label>
              <Select value={formData.account_type} onValueChange={(value) => handleSelectChange('account_type', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Checking">Checking</SelectItem>
                  <SelectItem value="Savings">Savings</SelectItem>
                  <SelectItem value="Credit Card">Credit Card</SelectItem>
                  <SelectItem value="Line of Credit">Line of Credit</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_balance">Current Balance</Label>
              <Input id="current_balance" type="number" step="0.01" value={formData.current_balance} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gl_account">GL Account</Label>
              <Select value={String(formData.gl_account || '')} onValueChange={(value) => handleSelectChange('gl_account', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a GL account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(account => (
                    <SelectItem key={account.id} value={String(account.account_number)}>
                      {account.account_number} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="routing_number">Routing Number</Label>
              <Input id="routing_number" value={formData.routing_number} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-6">
                <input 
                  type="checkbox" 
                  id="is_active" 
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="rounded border-slate-300 dark:border-slate-600"
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
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}