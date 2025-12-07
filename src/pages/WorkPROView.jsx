import React, { useState, useEffect, useCallback } from 'react';
import { WorkOrder, Customer, Vehicle, Employee, TechTimeLog } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Clock, Gauge, X, CheckCircle2, Droplet, Pencil } from 'lucide-react';
import TechTimeModal from '../components/work-orders/TechTimeModal';
import EditProjectDetailsModal from '../components/work-orders/EditProjectDetailsModal';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

const INSPECTION_SECTIONS = [
  {
    section_name: "Fluids",
    display_order: 1,
    inspection_items: ["Differential Fluid", "Transfer Case Fluid", "Brake Fluid", "Coolant", "Power Steering Fluid", "Windshield Wash", "Transmission Fluid"]
  },
  {
    section_name: "Tires (Visual Only)",
    display_order: 2,
    inspection_items: ["Tread Depth", "Tires/Rims"]
  },
  {
    section_name: "Electrical & Misc",
    display_order: 3,
    inspection_items: ["Battery", "Lights & Signals", "Shock/Strut (visual)", "Brakes (visual)", "Ball Joints", "Air/Cabin Filter", "Drive Belt(s)", "Wiper Blades", "Driveline (visual)", "Exhaust (visual)", "Block Heater"]
  }
];

export default function WorkPROViewPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const roNumber = urlParams.get('id');
  const projectId = urlParams.get('project_id');

  // Parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(year, month - 1, day);
  };

  const [workOrder, setWorkOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [project, setProject] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [techTimeTotal, setTechTimeTotal] = useState(0);
  const [showTechTimeModal, setShowTechTimeModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    priority: '',
    task: '',
    assigned_employees: [],
    time_estimate: '',
    promised_by: '',
    status: '',
    description: '',
    filter: '',
    oil_qty: '',
    oil: '',
    oil_type: '',
    air: '',
    cabin: '',
    tire_rotation: '',
    tpms_reset: '',
    oil_change_type: '',
    reset_oil_light: '',
    next_oil_change_odometer: ''
  });
  const [hasChanges, setHasChanges] = useState(false);

  const fetchTechTimeTotal = useCallback(async (projectId) => {
    try {
      const techTimeLogs = await TechTimeLog.filter({ workpro_project_id: projectId });
      const totalHours = techTimeLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);
      setTechTimeTotal(totalHours);
    } catch (error) {
      console.error('Error fetching tech time total:', error);
      setTechTimeTotal(0);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!roNumber && !projectId) {
        setError('No RO number or Project ID provided');
        setLoading(false);
        return;
      }

      try {
        let foundProject = null;
        
        // If roNumber is provided, load work order and fetch project by work order
        if (roNumber) {
          // Load work order - try both ro_number and wo_number
          let workOrders = await WorkOrder.filter({ ro_number: roNumber });
          if (!workOrders || workOrders.length === 0) {
            workOrders = await WorkOrder.filter({ wo_number: roNumber });
          }
          if (!workOrders || workOrders.length === 0) {
            setError('Work order not found');
            setLoading(false);
            return;
          }
          const wo = workOrders[0];
          setWorkOrder(wo);

          // Load customer and vehicle
          const [customerData, vehicleData] = await Promise.all([
            Customer.get(wo.customer_id),
            Vehicle.get(wo.vehicle_id)
          ]);
          setCustomer(customerData);
          setVehicle(vehicleData);

          // Load WorkPRO project by work order
          const workOrderIdentifier = wo.wo_number || wo.ro_number;
          const projectResponse = await fetch(`${API_BASE_URL}/Project?work_order=${workOrderIdentifier}`, {
            headers: { 'api_key': WORKPRO_API_KEY }
          });

          if (projectResponse.ok) {
            const projectsData = await projectResponse.json();
            const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
            foundProject = projects.length > 0 ? projects[0] : null;
          }
        }
        
        // If no project found by work order, or projectId is provided directly, fetch by project ID
        if (!foundProject && projectId) {
          const projectResponse = await fetch(`${API_BASE_URL}/Project/${projectId}`, {
            headers: { 'api_key': WORKPRO_API_KEY }
          });

          if (projectResponse.ok) {
            foundProject = await projectResponse.json();
          }
        }

        // Load employees
        const allEmployees = await Employee.list();
        const techs = allEmployees.filter(emp => 
          emp.position === 'technician' || 
          emp.position === 'apprentice' ||
          emp.position === 'service_advisor'
        );
        setEmployees(techs);

        if (foundProject) {
          setProject(foundProject);

          const assignedEmployeesList = foundProject.employee_assigned 
            ? foundProject.employee_assigned.split(',').map(name => name.trim())
            : [];
          
          setFormData({
            priority: foundProject.priority || '',
            task: foundProject.task || '',
            assigned_employees: assignedEmployeesList,
            time_estimate: foundProject.time_estimate || '',
            promised_by: foundProject.promised_by || '',
            status: foundProject.status || '',
            description: foundProject.description || '',
            filter: foundProject.filter || '',
            oil_qty: foundProject.oil_qty || '',
            oil: foundProject.oil || '',
            oil_type: foundProject.oil_type || '',
            air: foundProject.air || '',
            cabin: foundProject.cabin || '',
            tire_rotation: foundProject.tire_rotation || '',
            tpms_reset: foundProject.tpms_reset || '',
            oil_change_type: foundProject.oil_change_type || '',
            reset_oil_light: foundProject.reset_oil_light || '',
            next_oil_change_odometer: foundProject.next_oil_change_odometer || ''
          });

          await fetchTechTimeTotal(foundProject.id);
        } else {
          setError('No WorkPRO project found');
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data');
        setLoading(false);
      }
    };

    loadData();
  }, [roNumber, projectId, fetchTechTimeTotal]);

  const handleProjectUpdated = () => {
    // Reload data after project details are updated
    window.location.reload();
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSaveProject = async () => {
    if (!project) return;

    setSaving(true);
    try {
      const updateData = {
        priority: formData.priority,
        task: formData.task,
        employee_assigned: formData.assigned_employees.join(', '),
        time_estimate: parseFloat(formData.time_estimate) || 0,
        promised_by: formData.promised_by,
        status: formData.status,
        description: formData.description,
        filter: formData.filter,
        oil_qty: formData.oil_qty,
        oil: formData.oil,
        oil_type: formData.oil_type,
        air: formData.air,
        cabin: formData.cabin,
        tire_rotation: formData.tire_rotation,
        tpms_reset: formData.tpms_reset,
        oil_change_type: formData.oil_change_type,
        reset_oil_light: formData.reset_oil_light,
        next_oil_change_odometer: formData.next_oil_change_odometer ? parseFloat(formData.next_oil_change_odometer) : null
      };

      const response = await fetch(`${API_BASE_URL}/Project/${project.id}`, {
        method: 'PUT',
        headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) throw new Error('Failed to update project');

      setProject(prev => ({
        ...prev,
        ...updateData
      }));
      
      setHasChanges(false);
      alert('Project updated successfully!');
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTechTimeModalClose = async () => {
    setShowTechTimeModal(false);
    if (project?.id) {
      await fetchTechTimeTotal(project.id);
    }
  };

  const getEmployeeName = (employee) => {
    return `${employee.first_name} ${employee.last_name}`;
  };

  const getStatusBadge = (status) => {
    const colors = {
      'to_do': 'bg-slate-100 text-slate-800',
      'in_progress': 'bg-blue-100 text-blue-800',
      'parts_needed': 'bg-red-100 text-red-800',
      'on_hold': 'bg-orange-100 text-orange-800',
      'done': 'bg-green-100 text-green-800',
      'archived': 'bg-gray-100 text-gray-800'
    };
    
    return (
      <Badge className={colors[status] || colors['to_do']}>
        {status?.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  };

  const statusButtons = [
    { key: 'to_do', label: 'To Do', color: 'bg-slate-900 hover:bg-slate-800 text-white', inactiveColor: 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-blue-600 hover:bg-blue-700 text-white', inactiveColor: 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300' },
    { key: 'parts_needed', label: 'Parts Needed', color: 'bg-red-600 hover:bg-red-700 text-white', inactiveColor: 'bg-white hover:bg-red-50 text-red-600 border border-red-300' },
    { key: 'on_hold', label: 'On Hold', color: 'bg-orange-500 hover:bg-orange-600 text-white', inactiveColor: 'bg-white hover:bg-orange-50 text-orange-500 border border-orange-300' },
    { key: 'done', label: 'Done', color: 'bg-green-600 hover:bg-green-700 text-white', inactiveColor: 'bg-white hover:bg-green-50 text-green-600 border border-green-300' },
    { key: 'archived', label: 'Archived', color: 'bg-gray-600 hover:bg-gray-700 text-white', inactiveColor: 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-300' }
  ];

  const isOilChangeProject = project?.task?.toLowerCase().includes('oil change') || 
                             project?.filter || 
                             project?.oil_qty || 
                             project?.oil;

  const getInspectionResult = (sectionName, itemName) => {
    if (!project?.inspection_results) return null;
    const key = `${sectionName}-${itemName}`;
    return project.inspection_results[key] || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading WorkPRO project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg font-semibold mb-4">{error}</p>
          <Button onClick={() => window.close()} variant="outline">
            <X className="w-4 h-4 mr-2" />
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">WorkPRO Project</h1>
              {project && (
                <div className="flex items-center gap-3 text-sm text-slate-600 mt-1">
                  <span>{project.name}</span>
                  {project.work_order && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span>{project.work_order}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {project && !project.work_order && (
                <Button 
                  onClick={() => setShowEditProjectModal(true)} 
                  variant="outline"
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Project
                </Button>
              )}
              <Button onClick={() => window.close()} variant="outline">
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto p-6 pb-24">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
            <div>
              <Label className="text-sm font-medium">Task</Label>
              <Input
                value={formData.task}
                onChange={(e) => handleFieldChange('task', e.target.value)}
                placeholder="e.g., Oil Change, Brake Inspection"
              />
            </div>

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

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Estimate (Hrs)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.time_estimate}
                  onChange={(e) => handleFieldChange('time_estimate', e.target.value)}
                  placeholder="e.g., 4.5"
                />
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
                <Label className="text-sm font-medium">Promised By</Label>
                <Input
                  type="datetime-local"
                  value={formData.promised_by}
                  onChange={(e) => handleFieldChange('promised_by', e.target.value)}
                />
              </div>
            </div>

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

            {/* Oil Change Details Section */}
            {isOilChangeProject && (
              <>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Droplet className="w-5 h-5 text-blue-600" />
                      <h3 className="text-sm font-semibold text-slate-900">Oil Change Details</h3>
                    </div>
                    
                    <div className="space-y-3">
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

                      <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-blue-200">
                        {formData.reset_oil_light && (
                          <div>
                            <span className="text-slate-600 font-medium">Reset Oil Light:</span>
                            <p className="text-slate-900 capitalize">{formData.reset_oil_light.replace(/_/g, ' ')}</p>
                          </div>
                        )}
                        
                        {formData.next_oil_change_odometer && (
                          <div>
                            <span className="text-slate-600 font-medium">Next Oil Change:</span>
                            <p className="text-slate-900">{parseFloat(formData.next_oil_change_odometer).toLocaleString()} km</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Inspection Results Table */}
                {project.inspection_results && Object.keys(project.inspection_results).length > 0 && (
                  <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3">Inspection Results</h3>
                      
                      <div className="space-y-4">
                        {INSPECTION_SECTIONS.sort((a, b) => a.display_order - b.display_order).map((section) => (
                          <div key={section.section_name}>
                            <h4 className="text-xs font-semibold text-slate-700 mb-2">{section.section_name}</h4>
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-slate-100 border-b border-slate-200">
                                    <th className="text-left p-2 font-medium text-slate-700">Item</th>
                                    <th className="text-center p-2 font-medium text-slate-700 w-16">Good</th>
                                    <th className="text-center p-2 font-medium text-slate-700 w-16">Fair</th>
                                    <th className="text-center p-2 font-medium text-slate-700 w-16">Poor</th>
                                    <th className="text-center p-2 font-medium text-slate-700 w-16">N/A</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.inspection_items.map((item) => {
                                    const result = getInspectionResult(section.section_name, item);
                                    return (
                                      <tr key={item} className="border-b border-slate-100 last:border-0">
                                        <td className="p-2 text-slate-900">{item}</td>
                                        <td className="p-2 text-center">
                                          {result === 'good' && <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'fair' && <CheckCircle2 className="w-4 h-4 text-yellow-600 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'poor' && <CheckCircle2 className="w-4 h-4 text-red-600 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'n/a' && <CheckCircle2 className="w-4 h-4 text-slate-400 mx-auto" />}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 fixed bottom-0 left-0 right-0 shadow-sm z-10">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <button
                onClick={() => setShowTechTimeModal(true)}
                className="flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <Clock className="w-4 h-4" />
                <span>Tech Time {techTimeTotal.toFixed(1)}hrs</span>
              </button>
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4" />
                <span>Odometer {project?.odometer_reading ? `${project.odometer_reading.toLocaleString()} km` : 'N/A'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.close()}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveProject} 
                disabled={!hasChanges || saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tech Time Modal */}
      <TechTimeModal
        open={showTechTimeModal}
        onClose={handleTechTimeModalClose}
        project={project}
      />

      {/* Edit Project Details Modal */}
      <EditProjectDetailsModal
        open={showEditProjectModal}
        onClose={() => setShowEditProjectModal(false)}
        project={project}
        onProjectUpdated={handleProjectUpdated}
      />
    </>
  );
}