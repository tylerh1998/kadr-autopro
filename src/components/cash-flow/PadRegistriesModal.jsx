import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const EMPTY_ROWS = Array(10).fill(null).map(() => ({ name: '', amount: '' }));

export default function PadRegistriesModal({ open, onClose, details = [], onSave }) {
  const [rows, setRows] = useState(EMPTY_ROWS);

  useEffect(() => {
    if (!open) return;
    const normalized = [...(details || [])].slice(0, 10).map((item) => ({
      name: item?.name || '',
      amount: item?.amount || ''
    }));

    while (normalized.length < 10) {
      normalized.push({ name: '', amount: '' });
    }

    setRows(normalized);
  }, [open, details]);

  const handleRowChange = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    onSave(rows);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>PAD &amp; Registries</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <Input
                value={row.name}
                onChange={(e) => handleRowChange(index, 'name', e.target.value)}
                placeholder={`Item ${index + 1} name`}
              />
              <Input
                value={row.amount}
                onChange={(e) => handleRowChange(index, 'amount', e.target.value)}
                placeholder="$0.00"
                className="text-right font-mono"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}