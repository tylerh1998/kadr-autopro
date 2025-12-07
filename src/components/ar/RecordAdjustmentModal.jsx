import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ChartOfAccount } from '@/entities/all';

export default function RecordAdjustmentModal({ open, onClose, customer, onRecordAdjustment }) {
  const [adjustmentDate, setAdjustmentDate] = useState(new Date());
  const [amount, setAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('charge');
  const [glAccount, setGlAccount] = useState('4010');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [glAccounts, setGlAccounts] = useState([]);

  useEffect(() => {
    if (open) {
      loadGLAccounts();
    }
  }, [open]);

  const loadGLAccounts = async () => {
    try {
      const accounts = await ChartOfAccount.filter({ is_active: true }, 'account_number');
      setGlAccounts(accounts.filter(acc => !acc.controlled));
    } catch (error) {
      console.error('Error loading GL accounts:', error);
      setGlAccounts([]);
    }
  };

  const handleSubmit = () => {
    const adjustmentAmount = parseFloat(amount);
    
    if (isNaN(adjustmentAmount) || adjustmentAmount === 0) {
      alert('Please enter a valid adjustment amount.');
      return;
    }
    
    if (!description.trim()) {
      alert('Please enter a description for the adjustment.');
      return;
    }

    const finalAmount = adjustmentType === 'credit' ? -Math.abs(adjustmentAmount) : Math.abs(adjustmentAmount);

    const adjustmentData = {
      customer_id: customer.id,
      adjustment_date: format(adjustmentDate, 'yyyy-MM-dd'),
      amount: finalAmount,
      gl_account: glAccount,
      description: description.trim(),
      reference: reference.trim(),
    };
    
    onRecordAdjustment(adjustmentData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record A/R Adjustment for {customer.first_name} {customer.last_name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Adjustment Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {adjustmentDate ? format(adjustmentDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={adjustmentDate} onSelect={setAdjustmentDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge">Charge (+)</SelectItem>
                  <SelectItem value="credit">Credit (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>GL Account</Label>
            <Select value={glAccount} onValueChange={setGlAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select GL Account..." />
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

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for adjustment..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Reference (Optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference number, ticket #, etc."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>
            <FileText className="w-4 h-4 mr-2" />
            Record Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}