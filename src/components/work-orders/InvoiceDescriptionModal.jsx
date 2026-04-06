import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, FileText } from 'lucide-react';

export default function InvoiceDescriptionModal({ open, onClose, onSubmit, workOrder }) {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && workOrder) {
      // Pre-fill with existing work order description
      setDescription(workOrder.description || '');
    }
  }, [open, workOrder]);

  const handleContinue = async () => {
    // Validate that description is not empty
    if (!description.trim()) {
      alert('Internal work order description is required. Please provide a description for this work order.');
      return;
    }
    
    const newDescription = description.trim();
    if (newDescription === workOrder.description) {
      // If description hasn't changed, skip saving and just proceed
      return onSubmit({ description: newDescription, action: 'no_change' });
    }
    
    setIsLoading(true);
    try {
      // Submit the description
      await onSubmit({ description: description.trim() });
    } catch (error) {
      console.error('Error submitting description:', error);
      alert('Error saving description. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Review Internal Work Order Description
          </DialogTitle>
          <DialogDescription>
            This description is for <strong>internal use only</strong> and will <strong>NOT</strong> appear on the customer's invoice. 
            It will be used for vehicle history, internal reports, and reference purposes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">Internal Work Order Description *</Label>
            <Textarea
              id="description"
              placeholder="e.g., Oil change and filter replacement, brake inspection"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="h-32 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleContinue();
                }
              }}
            />
            <p className="text-sm text-muted-foreground">
              This description summarizes the work performed and will appear in vehicle service history.
            </p>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel Conversion
          </Button>
          <Button onClick={handleContinue} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}