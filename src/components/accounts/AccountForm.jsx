import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function AccountForm({ account, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    account_number: '',
    account_name: '',
    account_type: '',
    parent_account: '',
    description: '',
    is_active: true,
    controlled: false
  });

  useEffect(() => {
    if (account) {
      setFormData({
        account_number: account.account_number || '',
        account_name: account.account_name || '',
        account_type: account.account_type || '',
        parent_account: account.parent_account || '',
        description: account.description || '',
        is_active: account.is_active !== undefined ? account.is_active : true,
        controlled: account.controlled || false
      });
    }
  }, [account]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.account_number || !formData.account_name || !formData.account_type) {
      alert('Account number, name, and type are required.');
      return;
    }
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account ? 'Edit Account' : 'Add New Account'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input
                value={formData.account_number}
                onChange={(e) => handleChange('account_number', e.target.value)}
                placeholder="e.g., 1000, 5000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                value={formData.account_name}
                onChange={(e) => handleChange('account_name', e.target.value)}
                placeholder="e.g., Cash, Accounts Payable"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type *</Label>
              <Select value={formData.account_type} onValueChange={(val) => handleChange('account_type', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asset">Asset</SelectItem>
                  <SelectItem value="Liability">Liability</SelectItem>
                  <SelectItem value="Equity">Equity</SelectItem>
                  <SelectItem value="Revenue">Revenue</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parent Account</Label>
              <Input
                value={formData.parent_account}
                onChange={(e) => handleChange('parent_account', e.target.value)}
                placeholder="Parent account number (optional)"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Account description..."
              rows={3}
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleChange('is_active', checked)}
              />
              <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="controlled"
                checked={formData.controlled}
                onCheckedChange={(checked) => handleChange('controlled', checked)}
              />
              <Label htmlFor="controlled" className="cursor-pointer">Controlled</Label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {account ? 'Update Account' : 'Create Account'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}