import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X } from 'lucide-react';
import { format } from 'date-fns';

export default function GLTransactionForm({ onSubmit, onCancel, accountNumber }) {
  const [formData, setFormData] = useState({
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    reference: '',
    debit_amount: '',
    credit_amount: '',
    source_type: 'manual'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Ensure only one of debit or credit is set
    const debit = parseFloat(formData.debit_amount) || 0;
    const credit = parseFloat(formData.credit_amount) || 0;
    
    if (debit > 0 && credit > 0) {
      alert('Enter either a debit OR credit amount, not both.');
      return;
    }
    
    if (debit === 0 && credit === 0) {
      alert('Please enter either a debit or credit amount.');
      return;
    }
    
    onSubmit({
      ...formData,
      debit_amount: debit,
      credit_amount: credit
    });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear the opposite field when entering an amount
    if (field === 'debit_amount' && value) {
      setFormData(prev => ({ ...prev, credit_amount: '' }));
    } else if (field === 'credit_amount' && value) {
      setFormData(prev => ({ ...prev, debit_amount: '' }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Transaction to Account {accountNumber}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Transaction Date</Label>
              <Input
                id="date"
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
                placeholder="Invoice #, Check #, etc."
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Transaction description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="debit">Debit Amount</Label>
              <Input
                id="debit"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.debit_amount}
                onChange={(e) => handleChange('debit_amount', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="credit">Credit Amount</Label>
              <Input
                id="credit"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.credit_amount}
                onChange={(e) => handleChange('credit_amount', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source Type</Label>
            <Select value={formData.source_type} onValueChange={(value) => handleChange('source_type', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="supplier_invoice">Supplier Invoice</SelectItem>
                <SelectItem value="work_order">Work Order</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              Add Transaction
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}