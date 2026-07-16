import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, X, FileText, Ban } from 'lucide-react';

export default function WorkOrderDetailsEditModal({ open, onClose, workOrder, onSave, lineItems, onUpdateLineItems }) {
  const [formData, setFormData] = useState({
    description: '',
    po_number: '',
    cvip: '',
    default_taxable: true,
    est_date: '',
    wo_date: ''
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (workOrder && open) {
      setFormData({
        description: workOrder.description || '',
        po_number: workOrder.po_number || '',
        cvip: workOrder.cvip || '',
        default_taxable: workOrder.default_taxable !== undefined ? workOrder.default_taxable : true,
        est_date: workOrder.est_date || '',
        wo_date: workOrder.wo_date || ''
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
    // Save work order details first, then update line items
    onSave(formData, false, null, { should_keep_lock: true });
    
    // If default_taxable changed, update all line items AFTER work order is updated
    if (formData.default_taxable !== workOrder.default_taxable && onUpdateLineItems && lineItems) {
      // Use setTimeout to ensure work order update completes first
      setTimeout(() => {
        const updatedLines = lineItems.map(line => ({
          ...line,
          taxable: formData.default_taxable
        }));
        onUpdateLineItems(updatedLines);
      }, 0);
    }
    
    setHasChanges(false);
    onClose(); // Close modal after saving
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

  const handleVoid = () => {
    // Only check for inventory parts if it's NOT an estimate
    if (workOrder?.stage !== 'estimate') {
      if (lineItems) {
        const hasParts = lineItems.some(item => item.inventory_item_id);
        if (hasParts) {
          alert("Cannot void a work order with parts on it, please remove the parts and try again.");
          return;
        }
      }
    }

    if (window.confirm("Are you sure you want to void this repair order?")) {
      onSave({ stage: 'void' }, false, null, { should_keep_lock: true });
      onClose();
    }
  };

  const isEstimateStage = workOrder?.stage === 'estimate';
  const isWorkOrderStage = workOrder?.stage === 'work_order';

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Edit Work Order Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Enter work description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{isEstimateStage ? 'Estimate Date' : 'Work Order Date'}</Label>
              <Input
                id="date"
                type="date"
                value={isEstimateStage ? formData.est_date : formData.wo_date}
                onChange={(e) => handleChange(isEstimateStage ? 'est_date' : 'wo_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                value={formData.po_number}
                onChange={(e) => handleChange('po_number', e.target.value)}
                placeholder="Customer PO number..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cvip">CVIP</Label>
              <Input
                id="cvip"
                value={formData.cvip}
                onChange={(e) => handleChange('cvip', e.target.value)}
                placeholder="CVIP number..."
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="default_taxable"
              checked={formData.default_taxable}
              onCheckedChange={(checked) => handleChange('default_taxable', checked)}
            />
            <Label htmlFor="default_taxable" className="cursor-pointer">
              Default Taxable (All line items will be taxable by default)
            </Label>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div className="flex justify-start">
            <Button variant="destructive" onClick={handleVoid}>
              <Ban className="w-4 h-4 mr-2" />
              Void
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}