import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const displayMethods = [
  { id: 'cash', label: 'Cash' },
  { id: 'debit', label: 'Debit' },
  { id: 'credit_card', label: 'Credit Card' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'e_transfer', label: 'E-Transfer' },
  { id: 'other', label: 'Other' }
];

export default function ChangePaymentMethodModal({ open, onClose, payment, onSave }) {
  const [method, setMethod] = useState(payment?.method || '');

  const handleSave = () => {
    onSave(payment, method);
    onClose();
  };

  // Update local state when payment changes (e.g. reopening modal)
  React.useEffect(() => {
    if (payment) {
      setMethod(payment.method);
    }
  }, [payment]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Payment Method</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>New Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {displayMethods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!method || method === payment?.method}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}