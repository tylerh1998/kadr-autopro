import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
        const { error } = await supabase
          .from('Project')
          .update({ task: task })
          .eq('id', project.id);

        if (error) throw error;
        
        onUpdate('task', task);
      } else {
        // Create new project
        const projectData = {
          task: task,
          work_order: workOrder.wo_number,
          status: 'awaiting_work',
          priority: workOrder.priority || 'medium',
        };

        const { error } = await supabase
          .from('Project')
          .insert(projectData);

        if (error) throw error;
        
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
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Connected</Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Not Connected</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!project && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800/50">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                This work order is not connected to WorkPRO. Creating a task will automatically create and connect a new WorkPRO project.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Task Name</label>
            <Textarea
              value={task}
              onChange={(e) => handleTaskChange(e.target.value)}
              placeholder="Enter the main task or project name..."
              className="h-32 resize-none"
            />
          </div>

          {project && (
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
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