import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertCircle } from 'lucide-react';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function WorkPROTaskModal({ open, onClose, workOrder, project, onUpdate }) {
  const [task, setTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open && project) {
      setTask(project.task || '');
      setHasChanges(false);
    } else if (open && !project) {
      setTask('');
      setHasChanges(false);
    }
  }, [open, project]);

  const handleTaskChange = (value) => {
    setTask(value);
    setHasChanges(value !== (project?.task || ''));
  };

  const handleSave = async () => {
    if (!workOrder?.wo_number) {
      alert('Work order must be saved first');
      return;
    }

    setLoading(true);
    try {
      if (project) {
        // Update existing project
        const response = await fetch(`${API_BASE_URL}/Project/${project.id}`, {
          method: 'PUT',
          headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: task })
        });

        if (!response.ok) throw new Error('Failed to update WorkPRO task');
        
        const updatedProject = await response.json();
        onUpdate('task', task);
      } else {
        // Create new project
        const projectData = {
          task: task,
          work_order: workOrder.wo_number,
          status: 'awaiting_work',
          priority: workOrder.priority || 'medium',
        };

        const response = await fetch(`${API_BASE_URL}/Project`, {
          method: 'POST',
          headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(projectData)
        });

        if (!response.ok) throw new Error('Failed to create WorkPRO project');
        
        const newProject = await response.json();
        // This will trigger a refresh of the parent component
        window.location.reload();
      }

      setHasChanges(false);
      alert('Task updated successfully');
      onClose();
    } catch (error) {
      console.error('Error saving WorkPRO task:', error);
      alert('Failed to save task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            WorkPRO Task
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
                This work order is not connected to WorkPRO. Creating a task will automatically create and connect a new WorkPRO project.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Task Name</label>
            <Textarea
              value={task}
              onChange={(e) => handleTaskChange(e.target.value)}
              placeholder="Enter the main task or project name..."
              className="h-32 resize-none"
            />
          </div>

          {project && (
            <div className="text-sm text-slate-600 space-y-1">
              <p><strong>Status:</strong> {project.status}</p>
              <p><strong>Assigned:</strong> {project.employee_assigned || 'Not assigned'}</p>
              <p><strong>Priority:</strong> {project.priority}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            {project ? 'Update Task' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}