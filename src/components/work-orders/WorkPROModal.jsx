import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Clock, Gauge, Link as LinkIcon, PlusCircle, Droplet, CheckCircle2, ExternalLink, X, Pencil, Search } from 'lucide-react';
import { Employee } from '@/entities/all';
import { format } from 'date-fns';
import TechTimeModal from './TechTimeModal';
import EditProjectDetailsModal from './EditProjectDetailsModal';
import NewWorkPROModal from './NewWorkPROModal';
import { createPageUrl } from '@/utils';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

// Inspection sections data
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

export default function WorkPROModal({ open, onClose, workOrder, customer, customers, vehicles, initialWorkPROProject, onConnectionChange }) {
  const [project, setProject] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [techTimeTotal, setTechTimeTotal] = useState(0);
  
  // Tech Time Modal state
  const [showTechTimeModal, setShowTechTimeModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showNewWorkPROModal, setShowNewWorkPROModal] = useState(false);
  
  // New state for connecting to existing projects
  const [showConnectToExistingSection, setShowConnectToExistingSection] = useState(false);
  const [projectsForConnection, setProjectsForConnection] = useState([]);
  const [isFetchingProjectsForConnection, setIsFetchingProjectsForConnection] = useState(false);
  const [connectSearchTerm, setConnectSearchTerm] = useState("");
  const [connectStatusFilter, setConnectStatusFilter] = useState("in_progress");
  
  const [formData, setFormData] = useState({
    priority: '',
    task: '',
    assigned_employees: [],
    time_estimate: '',
    promised_by: '',
    status: '',
    description: '',
    default_category: 'billable',
    // Oil change fields
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

  // Use wo_number or ro_number as work order identifier
  const workOrderIdentifier = workOrder?.wo_number || workOrder?.ro_number;

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

  const fetchTechTimeTotal = useCallback(async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/ProjectTimeSession?project_id=${projectId}`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });

      if (!response.ok) {
        throw new Error(`WorkPRO API error: ${response.status}`);
      }

      const data = await response.json();
      const sessions = Array.isArray(data) ? data : (data?.records || []);
      const totalHours = sessions.reduce((sum, session) => sum + (parseFloat(session.total_hours) || 0), 0);
      setTechTimeTotal(totalHours);
    } catch (error) {
      console.error('Error fetching tech time total:', error);
      setTechTimeTotal(0);
    }
  }, []);

  const fetchWorkPROData = useCallback(async () => {
    setLoading(true);
    
    try {
      let foundProject = null;

      // PRIORITY 1: Try to fetch using workOrderIdentifier
      if (workOrderIdentifier) {
        const projectResponse = await fetch(`${API_BASE_URL}/Project?work_order=${workOrderIdentifier}`, {
          headers: { 'api_key': WORKPRO_API_KEY }
        });

        if (projectResponse.ok) {
          const projectsData = await projectResponse.json();
          const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
          foundProject = projects.length > 0 ? projects[0] : null;
        }
      }

      // FALLBACK: If no project found and we have initialWorkPROProject.id, fetch by ID
      if (!foundProject && initialWorkPROProject?.id) {
        const projectResponse = await fetch(`${API_BASE_URL}/Project/${initialWorkPROProject.id}`, {
          headers: { 'api_key': WORKPRO_API_KEY }
        });

        if (projectResponse.ok) {
          foundProject = await projectResponse.json();
        }
      }

      // If no project found, just set project to null (don't set error)
      // This allows the UI to show the Create/Connect options
      setProject(foundProject);

      if (foundProject) {
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
          default_category: foundProject.default_category || 'billable',
          // Oil change fields
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
        setHasChanges(false);

        // Fetch tech time total from TechTimeLog entity
        await fetchTechTimeTotal(foundProject.id);
      }
    } catch (error) {
      console.error('Error fetching WorkPRO data:', error);
      // Even on error, don't block the UI - let user try to create/connect
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [workOrderIdentifier, initialWorkPROProject?.id, fetchTechTimeTotal]);

  useEffect(() => {
    if (open && (workOrderIdentifier || initialWorkPROProject?.id)) {
      fetchWorkPROData();
    }
  }, [open, workOrderIdentifier, initialWorkPROProject?.id, fetchWorkPROData]);

  const fetchAvailableProjectsForConnection = async () => {
    setIsFetchingProjectsForConnection(true);
    try {
      const response = await fetch(`${API_BASE_URL}/Project`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });

      if (response.ok) {
        const projectsData = await response.json();
        const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
        
        // Filter out archived projects and those already connected to a work order
        const availableProjects = projects.filter(p => 
          p.status !== 'archived' && !p.work_order
        );
        
        setProjectsForConnection(availableProjects);
        setShowConnectToExistingSection(true);
      } else {
        throw new Error('Failed to fetch projects');
      }
    } catch (error) {
      console.error('Error fetching projects for connection:', error);
      alert('Failed to load available projects. Please try again.');
    } finally {
      setIsFetchingProjectsForConnection(false);
    }
  };

  const handleConnectExistingProject = async (selectedWorkPROProject) => {
    if (!workOrderIdentifier) return;

    const confirmed = window.confirm(
      `Connect this work order (${workOrderIdentifier}) to project "${selectedWorkPROProject.name}"?\n\nThis will update the project with customer, vehicle, and VIN information from the work order.`
    );
    
    if (!confirmed) return;

    setLoading(true);
    try {
      const vehicle = vehicles && vehicles.length > 0 ? vehicles.find(v => v.id === workOrder.vehicle_id) : null;
      
      const customerName = customer?.org_name && customer.org_name.trim() !== '' 
        ? customer.org_name 
        : `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
      
      const updatePayload = {
        work_order: workOrderIdentifier,
        customer: customerName,
        vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '',
        vin: vehicle?.vin || ''
      };

      const response = await fetch(`${API_BASE_URL}/Project/${selectedWorkPROProject.id}`, {
        method: 'PUT',
        headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) throw new Error('Failed to connect project');

      // Reload the modal with the newly connected project
      await fetchWorkPROData();
      
      // Notify parent component
      if (onConnectionChange) {
        onConnectionChange();
      }
      
      // Reset connection section
      setShowConnectToExistingSection(false);
      setProjectsForConnection([]);
      
      onClose();
    } catch (error) {
      console.error('Error connecting project:', error);
      alert('Failed to connect project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    setShowNewWorkPROModal(true);
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
        default_category: formData.default_category,
        // Oil change fields
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
      onClose();
      } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTechTimeModalClose = async () => {
    setShowTechTimeModal(false);
    // Refresh tech time total when modal closes (in case new entries were synced)
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

  const getProjectCountByStatus = (status) => {
    return projectsForConnection.filter(p => p.status === status).length;
  };

  const statusButtons = [
    { key: 'to_do', label: 'To Do', color: 'bg-slate-900 hover:bg-slate-800 text-white', inactiveColor: 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-blue-600 hover:bg-blue-700 text-white', inactiveColor: 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300' },
    { key: 'parts_needed', label: 'Parts Needed', color: 'bg-red-600 hover:bg-red-700 text-white', inactiveColor: 'bg-white hover:bg-red-50 text-red-600 border border-red-300' },
    { key: 'on_hold', label: 'On Hold', color: 'bg-orange-500 hover:bg-orange-600 text-white', inactiveColor: 'bg-white hover:bg-orange-50 text-orange-500 border border-orange-300' },
    { key: 'done', label: 'Done', color: 'bg-green-600 hover:bg-green-700 text-white', inactiveColor: 'bg-white hover:bg-green-50 text-green-600 border border-green-300' },
    { key: 'archived', label: 'Archived', color: 'bg-gray-600 hover:bg-gray-700 text-white', inactiveColor: 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-300' }
  ];

  // Check if this is an oil change type project
  const isOilChangeProject = project?.task?.toLowerCase().includes('oil change') || 
                             project?.filter || 
                             project?.oil_qty || 
                             project?.oil;

  // Get inspection result for a specific item
  const getInspectionResult = (sectionName, itemName) => {
    if (!project?.inspection_results) return null;
    const key = `${sectionName}-${itemName}`;
    return project.inspection_results[key] || null;
  };

  // Parse inspection comments from JSON string
  const getInspectionComments = () => {
    if (!project?.inspection_comments) return {};
    try {
      return typeof project.inspection_comments === 'string' 
        ? JSON.parse(project.inspection_comments) 
        : project.inspection_comments;
    } catch (error) {
      console.error('Error parsing inspection comments:', error);
      return {};
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span>WorkPRO Project</span>
                {project && (
                  <div className="flex items-center gap-3 text-sm font-normal text-slate-600">
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
                    size="sm"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Project
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!project?.work_order && !project?.id}
                  onClick={() => {
                    const urlParams = project?.work_order 
                      ? `id=${project.work_order}` 
                      : `project_id=${project.id}`;
                    const url = createPageUrl(`WorkPROView?${urlParams}`);
                    window.open(url, '_blank', 'width=1200,height=900');
                    onClose();
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Window
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : !project ? (
            <div className="py-8 space-y-6">
              {!showConnectToExistingSection ? (
                <div className="text-center space-y-4">
                  <p className="text-slate-600 mb-6">No WorkPRO project connected to this work order.</p>
                  
                  <div className="flex flex-col gap-3 max-w-md mx-auto">
                    <Button 
                      onClick={handleCreateProject} 
                      className="bg-blue-600 hover:bg-blue-700" 
                      disabled={!workOrderIdentifier}
                    >
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Create New Project
                    </Button>
                    
                    <Button 
                      onClick={fetchAvailableProjectsForConnection} 
                      variant="outline"
                      disabled={!workOrderIdentifier || isFetchingProjectsForConnection}
                    >
                      {isFetchingProjectsForConnection ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <LinkIcon className="w-4 h-4 mr-2" />
                      )}
                      Connect to Existing Project
                    </Button>
                  </div>
                  
                  {!workOrderIdentifier && (
                    <p className="text-sm text-slate-500 mt-2">Work order required to create or connect a project.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Available Projects</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setShowConnectToExistingSection(false);
                        setProjectsForConnection([]);
                      }}
                    >
                      Back
                    </Button>
                  </div>
                  
                  {/* Search Box */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      placeholder="Search projects, customers, VIN..."
                      value={connectSearchTerm}
                      onChange={(e) => setConnectSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Status Filter */}
                  <Tabs value={connectStatusFilter} onValueChange={setConnectStatusFilter} className="w-full">
                    <TabsList className="grid w-full grid-cols-6 h-auto p-1 bg-slate-100 rounded-lg">
                      {['to_do', 'in_progress', 'parts_needed', 'on_hold', 'done', 'archived'].map(status => (
                        <TabsTrigger 
                          key={status} 
                          value={status}
                          className={`
                            text-xs py-2 px-1 flex flex-col items-center gap-1
                            data-[state=active]:bg-white data-[state=active]:shadow-sm
                            ${status === 'to_do' ? 'data-[state=active]:text-slate-900' : ''}
                            ${status === 'in_progress' ? 'data-[state=active]:text-blue-700' : ''}
                            ${status === 'parts_needed' ? 'data-[state=active]:text-red-700' : ''}
                            ${status === 'on_hold' ? 'data-[state=active]:text-orange-700' : ''}
                            ${status === 'done' ? 'data-[state=active]:text-green-700' : ''}
                            ${status === 'archived' ? 'data-[state=active]:text-gray-700' : ''}
                          `}
                        >
                          <span className="capitalize">{status.replace('_', ' ')}</span>
                          <span className="text-[10px] bg-slate-200 px-1.5 rounded-full min-w-[1.25rem] text-center">
                            {getProjectCountByStatus(status)}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>

                  {/* Project List */}
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {projectsForConnection.filter(p => {
                      const matchesStatus = p.status === connectStatusFilter;
                      if (!matchesStatus) return false;
                      
                      if (!connectSearchTerm) return true;
                      
                      const searchLower = connectSearchTerm.toLowerCase();
                      return (
                        p.name?.toLowerCase().includes(searchLower) ||
                        p.customer?.toLowerCase().includes(searchLower) ||
                        p.vehicle?.toLowerCase().includes(searchLower) ||
                        p.vin?.toLowerCase().includes(searchLower) ||
                        p.task?.toLowerCase().includes(searchLower)
                      );
                    }).length === 0 ? (
                      <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <p>No projects found matching current filters</p>
                      </div>
                    ) : (
                      projectsForConnection
                        .filter(p => {
                          const matchesStatus = p.status === connectStatusFilter;
                          if (!matchesStatus) return false;
                          
                          if (!connectSearchTerm) return true;
                          
                          const searchLower = connectSearchTerm.toLowerCase();
                          return (
                            p.name?.toLowerCase().includes(searchLower) ||
                            p.customer?.toLowerCase().includes(searchLower) ||
                            p.vehicle?.toLowerCase().includes(searchLower) ||
                            p.vin?.toLowerCase().includes(searchLower) ||
                            p.task?.toLowerCase().includes(searchLower)
                          );
                        })
                        .map((proj) => (
                          <Card 
                            key={proj.id}
                            className="cursor-pointer hover:shadow-md transition-all border-slate-200"
                            onClick={() => handleConnectExistingProject(proj)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold text-slate-900">{proj.name}</h4>
                                    {getStatusBadge(proj.status)}
                                  </div>
                                  {proj.customer && (
                                    <p className="text-sm text-slate-600 flex items-center gap-2">
                                      <span className="w-16 text-slate-400 text-xs">Customer:</span>
                                      {proj.customer}
                                    </p>
                                  )}
                                  {proj.vehicle && (
                                    <p className="text-sm text-slate-600 flex items-center gap-2">
                                      <span className="w-16 text-slate-400 text-xs">Vehicle:</span>
                                      {proj.vehicle}
                                    </p>
                                  )}
                                  {proj.task && (
                                    <p className="text-sm text-slate-600 flex items-center gap-2">
                                      <span className="w-16 text-slate-400 text-xs">Task:</span>
                                      {proj.task}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100">
                                    {proj.created_date && (
                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Created: {format(new Date(proj.created_date), 'MMM d, yyyy')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                  Connect <LinkIcon className="w-3 h-3 ml-1" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
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

                        {/* Read-only fields */}
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
                          {INSPECTION_SECTIONS.sort((a, b) => a.display_order - b.display_order).map((section) => {
                            const comments = getInspectionComments();
                            const sectionComment = comments[section.section_name];
                            
                            return (
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
                                {sectionComment && (
                                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-slate-700">
                                    <span className="font-medium">Comments: </span>
                                    {sectionComment}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {project && (
            <DialogFooter className="flex items-center justify-between border-t pt-4 mt-4">
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
                <Button variant="outline" onClick={onClose}>
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
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

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
        onProjectUpdated={() => {
          setShowEditProjectModal(false);
          fetchWorkPROData();
          if (onConnectionChange) {
            onConnectionChange();
          }
        }}
      />

      {/* New Project Modal */}
      <NewWorkPROModal
        open={showNewWorkPROModal}
        onClose={() => setShowNewWorkPROModal(false)}
        customers={customers}
        vehicles={vehicles}
        initialData={workOrderIdentifier ? {
          customer: customer?.org_name && customer.org_name.trim() !== '' 
            ? customer.org_name 
            : `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
          vehicle: vehicles && vehicles.length > 0 && workOrder ? vehicles.find(v => v.id === workOrder.vehicle_id)?.year + ' ' + vehicles.find(v => v.id === workOrder.vehicle_id)?.make + ' ' + vehicles.find(v => v.id === workOrder.vehicle_id)?.model : '',
          vin: vehicles && vehicles.length > 0 && workOrder ? vehicles.find(v => v.id === workOrder.vehicle_id)?.vin : '',
          work_order: workOrderIdentifier
        } : null}
        lockedFields={workOrderIdentifier ? ['vin', 'work_order'] : []}
        onProjectCreated={() => {
          setShowNewWorkPROModal(false);
          fetchWorkPROData();
          if (onConnectionChange) {
            onConnectionChange();
          }
        }}
      />
      </>
      );
      }