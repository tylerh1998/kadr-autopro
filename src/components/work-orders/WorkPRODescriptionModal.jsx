import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function WorkPRODescriptionModal({ open, onClose, workOrder, project, onUpdate }) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open && project) {
      setDescription(project.description || '');
      setHasChanges(false);
    } else if (open && !project) {
      setDescription('');
      setHasChanges(false);
    }
  }, [open, project]);

  const handleDescriptionChange = (value) => {
    setDescription(value);
    setHasChanges(value !== (project?.description || ''));
  };

  const handleSave = async () => {
    if (!project) {
      alert('Please create a task first before adding a description');
      onClose();
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('workProProxy', {
        entityName: 'Project',
        method: 'update',
        id: project.id,
        params: { description: description }
      });

      if (!response.data.success) throw new Error(response.data.error || 'Failed to update WorkPRO description');
      
      onUpdate('description', description);
      setHasChanges(false);
      alert('Description updated successfully');
      onClose();
    } catch (error) {
      console.error('Error saving WorkPRO description:', error);
      alert('Failed to save description. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
            WorkPRO Description
            {project ? (
              <Badge variant="outline" className="bg-green-100 text-green-800">Connected</Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Not Connected</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!project && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                This work order is not connected to WorkPRO. Please create a task first to establish the connection.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Project Description</label>
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Enter detailed description of the work to be performed..."
              className="h-40 resize-none"
              disabled={!project}
            />
          </div>

          {project && (
            <div className="text-sm text-slate-600 space-y-1">
              <p><strong>Task:</strong> {project.name || 'No task name'}</p>
              <p><strong>Status:</strong> {project.status}</p>
              <p><strong>Assigned:</strong> {project.employee_assigned || 'Not assigned'}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || loading || !project}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Update Description
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}