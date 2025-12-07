import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, TrendingUp, TrendingDown, History, DollarSign, CreditCard, Banknote, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { ChartOfAccount } from '@/entities/all';
import AdjustmentHistoryModal from './AdjustmentHistoryModal';

export default function CashDrawerAdjustmentModal({ open, onClose, onSubmit, adjustments = [] }) {
  const [formData, setFormData] = useState({
    adjustmentDate: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    type: 'shortage',
    paymentMethod: 'cash',
    glAccount: '',
    description: '',
    reference: ''
  });
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    if (open) {
      loadGLAccounts();
      // Reset form when modal opens
      setFormData({
        adjustmentDate: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        type: 'shortage',
        paymentMethod: 'cash',
        glAccount: '',
        description: '',
        reference: ''
      });
    }
  }, [open]);

  const loadGLAccounts = async () => {
    try {
      const accounts = await ChartOfAccount.filter({ is_active: true });
      // Filter for Expense and Revenue accounts that would typically be used for cash over/short
      const relevantAccounts = accounts.filter(acc => 
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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              Record Cash Drawer Adjustment
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="adjustmentDate">Adjustment Date *</Label>
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
              <Label htmlFor="type">Adjustment Type *</Label>
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
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span>Shortage (Missing Cash)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="overage">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span>Overage (Extra Cash)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => setFormData(prev => ({...prev, paymentMethod: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method..." />
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
              <p className="text-xs text-slate-500">
                Select the payment method this adjustment applies to (typically Cash)
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
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
              <p className="text-xs text-slate-500">
                Enter the absolute amount (do not include negative sign)
              </p>
            </div>

            {/* GL Account */}
            <div className="space-y-2">
              <Label htmlFor="glAccount">GL Account for Adjustment *</Label>
              <Select
                value={formData.glAccount}
                onValueChange={(value) => setFormData(prev => ({...prev, glAccount: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select GL account..." />
                </SelectTrigger>
                <SelectContent>
                  {glAccounts.map(account => (
                    <SelectItem key={account.id} value={account.account_number}>
                      {account.account_number} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Typically a "Cash Short/Over" expense or revenue account
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Explain the reason for this adjustment..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                rows={3}
                required
              />
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number (Optional)</Label>
              <Input
                id="reference"
                placeholder="Optional reference..."
                value={formData.reference}
                onChange={(e) => setFormData(prev => ({...prev, reference: e.target.value}))}
              />
            </div>

            {/* Summary */}
            {formData.amount && (
              <div className={`p-3 rounded-lg ${
                formData.type === 'shortage' 
                  ? 'bg-red-50 border border-red-200' 
                  : 'bg-green-50 border border-green-200'
              }`}>
                <p className="text-sm font-medium">
                  {formData.type === 'shortage' ? (
                    <span className="text-red-800">
                      Cash Shortage: ${parseFloat(formData.amount || 0).toFixed(2)} will be removed from {formData.paymentMethod.replace('_', ' ')} in Cash Drawer
                    </span>
                  ) : (
                    <span className="text-green-800">
                      Cash Overage: ${parseFloat(formData.amount || 0).toFixed(2)} will be added to {formData.paymentMethod.replace('_', ' ')} in Cash Drawer
                    </span>
                  )}
                </p>
              </div>
            )}

            <DialogFooter className="flex justify-between items-center">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setShowHistoryModal(true)}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              >
                <History className="w-4 h-4 mr-1" />
                View History
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className={formData.type === 'shortage' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                  disabled={loading}
                >
                  {loading ? 'Recording...' : 'Record Adjustment'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AdjustmentHistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        adjustments={adjustments}
      />
    </>
  );
}