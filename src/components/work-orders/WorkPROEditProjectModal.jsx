
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save } from 'lucide-react';
import { Employee } from '@/entities/all';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018'; // This line has been updated
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function WorkPROEditProjectModal({ open, onClose, project, onUpdate, onRefresh }) {
  const [formData, setFormData] = useState({
    status: '',
    time_estimate: '',
    assigned_employees: []
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const allEmployees = await Employee.list();
        const techs = allEmployees.filter(emp => 
          emp.position === 'technician' || 
          emp.position === 'apprentice' ||
          emp.position === 'service_advisor'
        );
        setEmployees(techs);
      } catch (error) {
        console.error('Error loading employees:', error);
      }
    };
    loadEmployees();
  }, []);

  useEffect(() => {
    if (project && open) {
      const assignedEmployeesList = project.employee_assigned 
        ? project.employee_assigned.split(',').map(name => name.trim())
        : [];
      
      setFormData({
        status: project.status || '',
        time_estimate: project.time_estimate || '',
        assigned_employees: assignedEmployeesList
      });
      setHasChanges(false);
    }
  }, [project, open]);

  const handleStatusChange = (value) => {
    setFormData(prev => ({ ...prev, status: value }));
    setHasChanges(true);
  };

  const handleTimeEstimateChange = (value) => {
    setFormData(prev => ({ ...prev, time_estimate: value }));
    setHasChanges(true);
  };

  const handleEmployeeToggle = (employeeName, checked) => {
    setFormData(prev => ({
      ...prev,
      assigned_employees: checked
        ? [...prev.assigned_employees, employeeName]
        : prev.assigned_employees.filter(name => name !== employeeName)
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!project) return;

    setLoading(true);
    try {
      const updateData = {
        status: formData.status,
        time_estimate: parseFloat(formData.time_estimate) || 0,
        employee_assigned: formData.assigned_employees.join(', ')
      };

      const response = await fetch(`${API_BASE_URL}/Project/${project.id}`, {
        method: 'PUT',
        headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) throw new Error('Failed to update project');

      // Update local state
      onUpdate('status', formData.status);
      onUpdate('time_estimate', formData.time_estimate);
      onUpdate('employee_assigned', formData.assigned_employees.join(', '));
      
      setHasChanges(false);
      alert('Project updated successfully!');
      onRefresh(); // Refresh the parent data
      onClose();
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeName = (employee) => {
    return `${employee.first_name} ${employee.last_name}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit WorkPRO Project</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Project Name - Display Only */}
          <div className="space-y-2">
            <Label>Project Name</Label>
            <div className="bg-slate-50 p-3 rounded-lg border">
              <p className="text-slate-700">{project?.name}</p>
              <p className="text-xs text-slate-500 mt-1">Project name is auto-assigned based on customer and vehicle data</p>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="awaiting_work">Awaiting Work</SelectItem>
                <SelectItem value="parts_needed">Parts Needed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Estimate */}
          <div className="space-y-2">
            <Label>Time Estimate (hours)</Label>
            <Input
              type="number"
              step="0.5"
              value={formData.time_estimate}
              onChange={(e) => handleTimeEstimateChange(e.target.value)}
              placeholder="Enter estimated hours"
            />
          </div>

          {/* Assigned Employees */}
          <div className="space-y-3">
            <Label>Assigned Employees</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
              {employees.map((employee) => {
                const employeeName = getEmployeeName(employee);
                const isChecked = formData.assigned_employees.includes(employeeName);
                
                return (
                  <div key={employee.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={employee.id}
                      checked={isChecked}
                      onCheckedChange={(checked) => handleEmployeeToggle(employeeName, checked)}
                    />
                    <label
                      htmlFor={employee.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {employeeName} ({employee.position})
                    </label>
                  </div>
                );
              })}
              {employees.length === 0 && (
                <p className="text-slate-500 text-sm">No employees found</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
