import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Save, X, FileText } from 'lucide-react';

export default function WONotesModal({ open, onClose, workOrder, onUpdate, viewOnly = false }) {
  const [formData, setFormData] = useState({
    customer_complaint: '',
    notes_to_customer: ''
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (workOrder && open) {
      setFormData({
        customer_complaint: workOrder.customer_complaint || '',
        notes_to_customer: workOrder.notes_to_customer || ''
      });
      setHasChanges(false);
    }
  }, [workOrder, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(formData);
    setHasChanges(false);
    onClose();
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
        setHasChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Work Order Notes
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="space-y-3">
            <Label htmlFor="customer_complaint" className="text-base font-semibold text-slate-900">
              Customer Complaint
            </Label>
            <Textarea
              id="customer_complaint"
              value={formData.customer_complaint}
              onChange={(e) => handleChange('customer_complaint', e.target.value)}
              placeholder="Enter the customer's description of the issue or concern..."
              className="h-32 resize-none"
              readOnly={viewOnly}
              disabled={viewOnly}
            />
            <p className="text-sm text-slate-500">
              Record the customer's original complaint or description of the problem.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <div className="space-y-3">
              <Label htmlFor="notes_to_customer" className="text-base font-semibold text-slate-900">
                Notes to Customer
              </Label>
              <Textarea
                id="notes_to_customer"
                value={formData.notes_to_customer}
                onChange={(e) => handleChange('notes_to_customer', e.target.value)}
                placeholder="Enter notes that will be visible to the customer on their work order..."
                className="h-32 resize-none"
                readOnly={viewOnly}
                disabled={viewOnly}
              />
              <p className="text-sm text-slate-500">
                These notes will appear on the customer's copy of the work order and any communications.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          {viewOnly ? (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges}>
                <Save className="w-4 h-4 mr-2" />
                Save Notes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}