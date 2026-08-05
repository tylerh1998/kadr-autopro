import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, TrendingUp, TrendingDown, DollarSign, CreditCard, Banknote, ArrowLeftRight, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export default function CashDrawerAdjustmentModal({ open, onClose, onSubmit, adjustments = [] }) {
  const [formData, setFormData] = useState({
    adjustmentDate: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    type: 'shortage',
    paymentMethod: 'cash',
    glAccount: '4013',
    description: '',
    reference: ''
  });
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadGLAccounts();
      // Reset form when modal opens
      setFormData({
        adjustmentDate: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        type: 'shortage',
        paymentMethod: 'cash',
        glAccount: '4013',
        description: '',
        reference: ''
      });
      setLoading(false);
    }
  }, [open]);

  const loadGLAccounts = async () => {
    try {
      const { data: accounts, error } = await supabase
        .from('ChartOfAccount')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      // Filter for Expense and Revenue accounts that would typically be used for cash over/short
      const relevantAccounts = (accounts || []).filter(acc =>
        acc.account_type === 'Expense' || acc.account_type === 'Revenue'
      );
      setGlAccounts(relevantAccounts);
    } catch (error) {
      console.error('Error loading GL accounts:', error);
      alert('Failed to load GL accounts');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.amount || parseFloat(formData.amount) === 0) {
      alert('Please enter a valid adjustment amount.');
      return;
    }
    
    if (!formData.glAccount) {
      alert('Please select a GL account for the adjustment.');
      return;
    }
    
    if (!formData.description.trim()) {
      alert('Please provide a description for the adjustment.');
      return;
    }
    
    if (!formData.paymentMethod) {
      alert('Please select a payment method for the adjustment.');
      return;
    }
    
    setLoading(true);
    onSubmit(formData);
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'cash':
        return <DollarSign className="w-4 h-4" />;
      case 'credit_card':
        return <CreditCard className="w-4 h-4" />;
      case 'debit':
        return <CreditCard className="w-4 h-4" />;
      case 'cheque':
        return <Banknote className="w-4 h-4" />;
      case 'e_transfer':
        return <ArrowLeftRight className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getPaymentMethodLabel = (method) => {
    switch (method) {
      case 'cash':
        return 'Cash';
      case 'debit':
        return 'Debit';
      case 'credit_card':
        return 'Credit Card';
      case 'cheque':
        return 'Cheque';
      case 'e_transfer':
        return 'E-Transfer';
      case 'other':
        return 'Other';
      default:
        return 'Cash';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            Cash Drawer Adjustment
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="border-b pb-6 mb-2 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="adjustmentDate">Date *</Label>
              <Input
                id="adjustmentDate"
                type="date"
                value={formData.adjustmentDate}
                onChange={(e) => setFormData(prev => ({...prev, adjustmentDate: e.target.value}))}
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData(prev => ({...prev, type: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shortage">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                      <span>Shortage</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="overage">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-500 dark:text-green-400" />
                      <span>Overage</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Method *</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => setFormData(prev => ({...prev, paymentMethod: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('cash')}
                      <span>Cash</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="debit">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('debit')}
                      <span>Debit</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="credit_card">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('credit_card')}
                      <span>Credit Card</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cheque">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('cheque')}
                      <span>Cheque</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="e_transfer">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('e_transfer')}
                      <span>E-Transfer</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="other">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon('other')}
                      <span>Other</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-slate-400">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({...prev, amount: e.target.value}))}
                  className="pl-7"
                  required
                />
              </div>
            </div>

            {/* GL Account */}
            <div className="space-y-2">
              <Label htmlFor="glAccount">GL Account *</Label>
              <Select
                value={formData.glAccount}
                onValueChange={(value) => setFormData(prev => ({...prev, glAccount: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="GL account..." />
                </SelectTrigger>
                <SelectContent>
                  {glAccounts.map(account => (
                    <SelectItem key={account.id} value={account.account_number}>
                      {account.account_number} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2 xl:col-span-3">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                placeholder="Explain the reason for this adjustment..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                required
              />
            </div>

            {/* Reference */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Optional reference..."
                value={formData.reference}
                onChange={(e) => setFormData(prev => ({...prev, reference: e.target.value}))}
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-6">
            <div className="flex-1 pr-4">
              {formData.amount && (
                <div className={`p-2 rounded-md inline-block ${
                  formData.type === 'shortage'
                    ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    : 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                }`}>
                  <p className="text-sm font-medium">
                    {formData.type === 'shortage' 
                      ? `Shortage: $${parseFloat(formData.amount || 0).toFixed(2)} will be removed from ${formData.paymentMethod.replace('_', ' ')}`
                      : `Overage: $${parseFloat(formData.amount || 0).toFixed(2)} will be added to ${formData.paymentMethod.replace('_', ' ')}`
                    }
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className={formData.type === 'shortage' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}
                disabled={loading}
              >
                {loading ? 'Recording...' : 'Record Adjustment'}
              </Button>
            </div>
          </div>
        </form>

        {/* History Table */}
        <div className="flex-1 flex flex-col min-h-[300px] mt-4">
          <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-3">Recent Adjustments</h3>

          {adjustments.length === 0 ? (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400 border rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p>No adjustments have been recorded yet.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Type</th>
                    <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                    <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Method</th>
                    <th className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          {format(new Date(adj.adjustment_date), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge
                          className={adj.type === 'shortage' ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40'}
                        >
                          {adj.type === 'shortage' ? 'Shortage' : 'Overage'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-semibold ${adj.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          ${Math.abs(adj.amount || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="truncate max-w-[200px] block" title={adj.description}>
                            {adj.description}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          {getPaymentMethodIcon(adj.payment_method)}
                          <span>{getPaymentMethodLabel(adj.payment_method)}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={adj.status === 'posted_to_gl' ? 'default' : 'secondary'}>
                          {adj.status === 'posted_to_gl' ? 'Posted' : 'Recorded'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}