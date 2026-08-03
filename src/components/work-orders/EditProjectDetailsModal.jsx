import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function EditProjectDetailsModal({ open, onClose, project, onProjectUpdated }) {
  const [formData, setFormData] = useState({
    customer: '',
    vehicle: '',
    vin: '',
    work_order: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && project) {
      setFormData({
        customer: project.customer || '',
        vehicle: project.vehicle || '',
        vin: project.vin || '',
        work_order: project.work_order || ''
      });
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!project) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('Project')
        .update(formData)
        .eq('id', project.id);

      if (error) throw error;

      if (onProjectUpdated) {
        onProjectUpdated();
      }
      
      onClose();
      alert('Project details updated successfully!');
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-sm font-medium">Customer</Label>
            <Input
              value={formData.customer}
              onChange={(e) => setFormData(prev => ({ ...prev, customer: e.target.value }))}
              placeholder="Customer name"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Vehicle</Label>
            <Input
              value={formData.vehicle}
              onChange={(e) => setFormData(prev => ({ ...prev, vehicle: e.target.value }))}
              placeholder="e.g., 2020 Honda Civic"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">VIN</Label>
            <Input
              value={formData.vin}
              onChange={(e) => setFormData(prev => ({ ...prev, vin: e.target.value }))}
              placeholder="Vehicle VIN"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Work Order #</Label>
            <Input
              value={formData.work_order}
              onChange={(e) => setFormData(prev => ({ ...prev, work_order: e.target.value }))}
              placeholder="WO number (optional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}