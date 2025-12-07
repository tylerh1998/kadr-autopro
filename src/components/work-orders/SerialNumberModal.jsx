import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SerialNumberModal({ open, onClose, onSave, currentSerialNum }) {
  const [serialNum, setSerialNum] = useState('');

  useEffect(() => {
    if (open) {
      setSerialNum(currentSerialNum || '');
    }
  }, [open, currentSerialNum]);

  const handleSave = () => {
    onSave(serialNum.trim());
    onClose();
  };

  const handleClear = () => {
    onSave('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Serial Number</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="serial_num">Serial Number</Label>
            <Input
              id="serial_num"
              value={serialNum}
              onChange={(e) => setSerialNum(e.target.value)}
              placeholder="Enter serial number..."
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={!currentSerialNum}
          >
            Clear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}