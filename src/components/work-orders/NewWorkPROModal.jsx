import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, Droplet } from 'lucide-react';
import { Employee } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function NewWorkPROModal({ open, onClose, customers, vehicles, onProjectCreated, initialData, lockedFields = [] }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    customer: '',
    vehicle: '',
    vin: '',
    work_order: '',
    priority: 'medium',
    task: '',
    assigned_employees: [],
    // time_estimate: '',
    default_category: 'billable',
    promised_by: '',
    status: 'to_do',
    description: '',
    project_type: 'work_order',
    // Oil change fields
    filter: '',
    oil_qty: '',
    oil: '',
    oil_type: '',
    air: '',
    cabin: '',
    tire_rotation: '',
    tpms_reset: '',
    oil_change_type: ''
  });

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
    if (open) {
      if (initialData) {
        setFormData(prev => ({
          ...prev,
          ...initialData
        }));
      }
    } else {
      // Reset form when modal closes
      setFormData({
        customer: '',
        vehicle: '',
        vin: '',
        work_order: '',
        priority: 'medium',
        task: '',
        assigned_employees: [],
        // time_estimate: '',
        default_category: 'billable',
        promised_by: '',
        status: 'to_do',
        description: '',
        project_type: 'work_order',
        filter: '',
        oil_qty: '',
        oil: '',
        oil_type: '',
        air: '',
        cabin: '',
        tire_rotation: '',
        tpms_reset: '',
        oil_change_type: ''
      });
    }
  }, [open, initialData]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEmployeeToggle = (employeeName, checked) => {
    setFormData(prev => ({
      ...prev,
      assigned_employees: checked
        ? [...prev.assigned_employees, employeeName]
        : prev.assigned_employees.filter(name => name !== employeeName)
    }));
  };

  const handleSaveProject = async () => {
    if (!formData.customer || formData.customer.trim() === '') {
      alert('Please enter a customer name');
      return;
    }

    if (!formData.vehicle || formData.vehicle.trim() === '') {
      alert('Please enter a vehicle');
      return;
    }

    setSaving(true);
    try {
      const projectData = {
        name: `${formData.customer}${formData.task ? ' - ' + formData.task : ''}`,
        customer: formData.customer,
        vehicle: formData.vehicle,
        vin: formData.vin,
        work_order: formData.work_order,
        priority: formData.priority,
        task: formData.task,
        employees_assigned: formData.assigned_employees,
        default_category: formData.default_category,
        promised_by: formData.promised_by || null,
        status: formData.status,
        description: formData.description,
        project_type: formData.project_type
      };

      // Add oil change fields if project_type is oil_change
      if (formData.project_type === 'oil_change') {
        projectData.filter = formData.filter;
        projectData.oil_qty = formData.oil_qty;
        projectData.oil = formData.oil;
        projectData.oil_type = formData.oil_type;
        projectData.air = formData.air;
        projectData.cabin = formData.cabin;
        projectData.wind_wash = formData.wind_wash;
        projectData.tire_rotation = formData.tire_rotation;
        projectData.tpms_reset = formData.tpms_reset;
        projectData.oil_change_type = formData.oil_change_type;
      }

      const response = await base44.functions.invoke('workProProxy', {
        entityName: 'Project',
        method: 'create',
        params: projectData
      });

      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to create project');

      const newProject = response.data.data;
      
      if (onProjectCreated) {
        onProjectCreated(newProject);
      }
      
      alert('Project created successfully!');
      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getEmployeeName = (employee) => {
    return employee.full_name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
  };

  const statusButtons = [
    { key: 'to_do', label: 'To Do', color: 'bg-slate-900 hover:bg-slate-800 text-white', inactiveColor: 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-blue-600 hover:bg-blue-700 text-white', inactiveColor: 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300' },
    { key: 'parts_needed', label: 'Parts Needed', color: 'bg-red-600 hover:bg-red-700 text-white', inactiveColor: 'bg-white hover:bg-red-50 text-red-600 border border-red-300' },
    { key: 'on_hold', label: 'On Hold', color: 'bg-orange-500 hover:bg-orange-600 text-white', inactiveColor: 'bg-white hover:bg-orange-50 text-orange-500 border border-orange-300' },
    { key: 'done', label: 'Done', color: 'bg-green-600 hover:bg-green-700 text-white', inactiveColor: 'bg-white hover:bg-green-50 text-green-600 border border-green-300' },
    { key: 'archived', label: 'Archived', color: 'bg-gray-600 hover:bg-gray-700 text-white', inactiveColor: 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-300' }
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New WorkPRO Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Field */}
          <div>
            <Label className="text-sm font-medium">Customer *</Label>
            <Input
              value={formData.customer}
              onChange={(e) => handleFieldChange('customer', e.target.value)}
              placeholder="Enter customer name"
            />
          </div>

          {/* Vehicle Field - NOW REQUIRED */}
          <div>
            <Label className="text-sm font-medium">Vehicle *</Label>
            <Input
              value={formData.vehicle}
              onChange={(e) => handleFieldChange('vehicle', e.target.value)}
              placeholder="e.g., 2020 Honda Civic"
            />
          </div>

          {/* VIN and WO# Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">VIN</Label>
              <Input
                value={formData.vin}
                onChange={(e) => handleFieldChange('vin', e.target.value)}
                placeholder="Enter VIN"
                disabled={lockedFields.includes('vin')}
                className={lockedFields.includes('vin') ? 'bg-slate-100 text-slate-500' : ''}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">WO #</Label>
              <Input
                value={formData.work_order}
                onChange={(e) => handleFieldChange('work_order', e.target.value)}
                placeholder="WO Number"
                disabled={lockedFields.includes('work_order')}
                className={lockedFields.includes('work_order') ? 'bg-slate-100 text-slate-500' : ''}
              />
            </div>
          </div>

          {/* Project Type Toggle */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Project Type</Label>
            <div className="flex gap-2">
              <button
                onClick={() => handleFieldChange('project_type', 'work_order')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  formData.project_type === 'work_order' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300'
                }`}
              >
                Work Order
              </button>
              <button
                onClick={() => handleFieldChange('project_type', 'oil_change')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  formData.project_type === 'oil_change' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300'
                }`}
              >
                Oil Change
              </button>
            </div>
          </div>

          {/* Task */}
          <div>
            <Label className="text-sm font-medium">Task</Label>
            <Input
              value={formData.task}
              onChange={(e) => handleFieldChange('task', e.target.value)}
              placeholder="e.g., Oil Change, Brake Inspection"
            />
          </div>

          {/* Oil Change Details Section - Only shown when project_type is 'oil_change' */}
          {formData.project_type === 'oil_change' && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Droplet className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Oil Change Details</h3>
                </div>
                
                <div className="space-y-3">
                  {/* Oil Change Type - Radio Selection */}
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-2 block">Oil Change Type</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="oil_change_type"
                          value="regular"
                          checked={formData.oil_change_type === 'regular'}
                          onChange={(e) => handleFieldChange('oil_change_type', e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm text-slate-900">Regular</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="oil_change_type"
                          value="winter"
                          checked={formData.oil_change_type === 'winter'}
                          onChange={(e) => handleFieldChange('oil_change_type', e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm text-slate-900">Winter</span>
                      </label>
                    </div>
                  </div>

                  {/* Filter, Oil Qty, Oil Grade, Oil Type - 4 columns */}
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Filter</Label>
                      <Input
                        value={formData.filter}
                        onChange={(e) => handleFieldChange('filter', e.target.value)}
                        placeholder="Filter #"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Oil Qty</Label>
                      <Input
                        value={formData.oil_qty}
                        onChange={(e) => handleFieldChange('oil_qty', e.target.value)}
                        placeholder="e.g., 5L"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Oil Grade</Label>
                      <Input
                        value={formData.oil}
                        onChange={(e) => handleFieldChange('oil', e.target.value)}
                        placeholder="e.g., 5W-30"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Oil Type</Label>
                      <Select value={formData.oil_type} onValueChange={(val) => handleFieldChange('oil_type', val)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="synthetic">Synthetic</SelectItem>
                          <SelectItem value="blend">Blend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Air Filter, Cabin Filter - 2 columns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Air Filter</Label>
                      <Input
                        value={formData.air}
                        onChange={(e) => handleFieldChange('air', e.target.value)}
                        placeholder="Air filter details"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Cabin Filter</Label>
                      <Input
                        value={formData.cabin}
                        onChange={(e) => handleFieldChange('cabin', e.target.value)}
                        placeholder="Cabin filter details"
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {/* Tire Rotation, TPMS Reset - 2 columns with dropdowns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Tire Rotation</Label>
                      <Select value={formData.tire_rotation} onValueChange={(val) => handleFieldChange('tire_rotation', val)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">TPMS Reset</Label>
                      <Select value={formData.tpms_reset} onValueChange={(val) => handleFieldChange('tpms_reset', val)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employees Assigned */}
          <div>
            <Label className="text-sm font-medium">Employees Assigned</Label>
            <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-lg bg-slate-50 max-h-32 overflow-y-auto">
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
                      className="text-sm leading-none cursor-pointer"
                    >
                      {employeeName}
                    </label>
                  </div>
                );
              })}
              {employees.length === 0 && (
                <p className="text-slate-500 text-sm col-span-2">No employees found</p>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Optional: Leave unassigned for auto-assignment when clocking in
            </p>
          </div>

          {/* Default Category, Priority, Promised By */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Default Category</Label>
              <Select value={formData.default_category} onValueChange={(val) => handleFieldChange('default_category', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billable">Billable</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="shop_work">Shop Work</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={formData.priority} onValueChange={(val) => handleFieldChange('priority', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Scheduled for</Label>
              <Input
                type="datetime-local"
                value={formData.promised_by}
                onChange={(e) => handleFieldChange('promised_by', e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-sm font-medium text-center block mb-2">Status</Label>
            <div className="flex flex-wrap justify-center gap-2">
              {statusButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => handleFieldChange('status', btn.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    formData.status === btn.key ? btn.color : btn.inactiveColor
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Project details and requirements..."
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSaveProject} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}