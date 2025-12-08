import React, { useState, useEffect } from "react";
import { WorkOrder, Customer, Vehicle, TagAlong, Appointment, User, WorkOrderStatus } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Filter, FileText, Calendar, User as UserIcon, Car, RefreshCw, RotateCcw, Wrench, Clock, Users, AlertTriangle, CheckCircle, Link as LinkIcon, Settings } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { base44 } from "@/api/base44Client";

import WorkOrderForm from "../components/work-orders/WorkOrderForm";
import WorkOrderList from "../components/work-orders/WorkOrderList";
import NewWorkOrderModal from "../components/work-orders/NewWorkOrderModal";
import WorkPROTaskModal from "../components/work-orders/WorkPROTaskModal";
import WorkPRODescriptionModal from "../components/work-orders/WorkPRODescriptionModal";
import WorkPROConnectorModal from "../components/work-orders/WorkPROConnectorModal";
import WorkPROModal from "../components/work-orders/WorkPROModal";
import AppointmentsListModal from "../components/work-orders/AppointmentsListModal";
import EditApptViaWoModal from "../components/work-orders/EditApptViaWoModal";
import SchedulerViaWoModal from "../components/work-orders/SchedulerViaWoModal";
import NewWorkPROModal from "../components/work-orders/NewWorkPROModal";
import TechTimeModal from "../components/work-orders/TechTimeModal";
import KanbanDisplaySettings from "../components/work-orders/KanbanDisplaySettings";
import { useTechClockStatus } from "../components/context/TechClockStatusContext";

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFlushConfirm, setShowFlushConfirm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // WorkPRO state
  const [workPROProjects, setWorkPROProjects] = useState([]);
  const [workPROLoading, setWorkPROLoading] = useState(false);
  const [workPROLoaded, setWorkPROLoaded] = useState(false);
  const [workPROStatusFilter, setWorkPROStatusFilter] = useState('in_progress');
  
  // Appointments state
  const [appointmentsByRO, setAppointmentsByRO] = useState({});
  
  // Tech time state for WorkPRO tab
  const [projectTechTime, setProjectTechTime] = useState({});
  const [techTimeLoaded, setTechTimeLoaded] = useState(false);
  
  // WorkPRO Modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);
  const [showEditApptModal, setShowEditApptModal] = useState(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [showNewWorkPROModal, setShowNewWorkPROModal] = useState(false);
  const [showTechTimeModal, setShowTechTimeModal] = useState(false);
  const [showKanbanSettings, setShowKanbanSettings] = useState(false);
  const { openTechClockStatusModal } = useTechClockStatus();
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectWorkOrder, setSelectedProjectWorkOrder] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  
  // Kanban column sizes (local state, not persisted)
  const [kanbanColumnSizes, setKanbanColumnSizes] = useState({});
  
  // Track active main tab (list, workpro, board)
  const [mainTab, setMainTab] = useState("list");
  
  // Track active tab for list view (estimates, wip, completed, invoices)
  const [activeTab, setActiveTab] = useState("work_in_progress");

  // Work order statuses from setup
  const [workOrderStatuses, setWorkOrderStatuses] = useState([]);
  
  // Sort state for each tab
  const [estimatesSort, setEstimatesSort] = useState("customer_az");
  const [wipSort, setWipSort] = useState("customer_az");
  const [completedSort, setCompletedSort] = useState("customer_az");
  const [invoicesSort, setInvoicesSort] = useState("date_newest");

  useEffect(() => {
    loadData(true);
    loadCurrentUser();
    loadWorkOrderStatuses();
  }, []);

  const loadWorkOrderStatuses = async () => {
    try {
      const statuses = await WorkOrderStatus.filter({ is_active: true });
      const sortedStatuses = statuses.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      setWorkOrderStatuses(sortedStatuses);
    } catch (error) {
      console.error('Error loading work order statuses:', error);
      // Fallback to default statuses
      setWorkOrderStatuses([
        { name: 'Open', display_order: 1, color: 'slate' },
        { name: 'Parts On Order', display_order: 2, color: 'slate' },
        { name: 'Scheduled', display_order: 3, color: 'slate' },
        { name: 'On Hold', display_order: 4, color: 'slate' },
        { name: 'Completed', display_order: 5, color: 'slate' }
      ]);
    }
  };

  // Auto-refresh data every 20 seconds when tab is visible
  useEffect(() => {
    let refreshInterval;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, clear interval
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
        }
      } else {
        // Tab is visible, start interval
        refreshInterval = setInterval(() => {
          loadData();
          if (mainTab === 'workpro' && workPROLoaded) {
            loadWorkPROProjects();
            loadTechTimeForProjects();
          }
        }, 20000); // 20 seconds
      }
    };

    // Initial setup - only start if tab is visible
    if (!document.hidden) {
      refreshInterval = setInterval(() => {
        loadData();
        if (mainTab === 'workpro' && workPROLoaded) {
          loadWorkPROProjects();
          loadTechTimeForProjects();
        }
      }, 20000);
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mainTab, workPROLoaded]);

  useEffect(() => {
    if (mainTab === 'workpro' && !workPROLoaded) {
      loadWorkPROProjects(true);
    }
  }, [mainTab, workPROLoaded]);

  // Load appointments when WorkPRO tab is active and projects are loaded
  useEffect(() => {
    if (mainTab === 'workpro' && workPROLoaded && workPROProjects.length > 0 && workOrders.length > 0) {
      loadAppointmentsForProjects();
    }
  }, [mainTab, workPROLoaded, workPROProjects, workOrders]);

  // Load tech time data when WorkPRO tab is active and projects are loaded
  useEffect(() => {
    if (mainTab === 'workpro' && workPROLoaded && workPROProjects.length > 0 && !techTimeLoaded) {
      loadTechTimeForProjects();
    }
  }, [mainTab, workPROLoaded, workPROProjects, techTimeLoaded]);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadData = async (isInitialLoad = false) => {
    // Only show loading indicator on initial load
    if (isInitialLoad || workOrders.length === 0) {
      setLoading(true);
    }
    try {
      const [workOrdersData, customersData, vehiclesData] = await Promise.all([
        WorkOrder.list('-created_date'),
        Customer.list(),
        Vehicle.list()
      ]);
      
      // Fine-grained update: only update if data has changed
      setWorkOrders(prev => {
        if (JSON.stringify(prev.map(w => w.id + w.updated_date)) !== JSON.stringify(workOrdersData.map(w => w.id + w.updated_date))) {
          return workOrdersData;
        }
        return prev;
      });
      
      setCustomers(prev => {
        if (JSON.stringify(prev.map(c => c.id + c.updated_date)) !== JSON.stringify(customersData.map(c => c.id + c.updated_date))) {
          return customersData;
        }
        return prev;
      });
      
      setVehicles(prev => {
        if (JSON.stringify(prev.map(v => v.id + v.updated_date)) !== JSON.stringify(vehiclesData.map(v => v.id + v.updated_date))) {
          return vehiclesData;
        }
        return prev;
      });
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  const loadWorkPROProjects = async (isInitialLoad = false) => {
    // Only show loading indicator on initial load
    if (isInitialLoad || workPROProjects.length === 0) {
      setWorkPROLoading(true);
    }
    try {
      const response = await fetch(`${API_BASE_URL}/Project`, {
        method: 'GET',
        headers: {
          'api_key': WORKPRO_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const projectsData = await response.json();
        const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
        const sortedProjects = projects.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        
        // Fine-grained update: only update if data has changed
        setWorkPROProjects(prev => {
          const prevSignature = prev.map(p => p.id + (p.updated_date || '')).join(',');
          const newSignature = sortedProjects.map(p => p.id + (p.updated_date || '')).join(',');
          if (prevSignature !== newSignature) {
            return sortedProjects;
          }
          return prev;
        });
        setWorkPROLoaded(true);
      } else {
        console.error('Error fetching WorkPRO projects:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading WorkPRO projects:', error);
    } finally {
      setWorkPROLoading(false);
    }
  };

  const loadAppointmentsForProjects = async () => {
    try {
      // Load all appointments
      const allAppointments = await Appointment.list();
      
      // Group appointments by work_order_id
      const appointmentMap = {};
      
      for (const project of workPROProjects) {
        const workOrder = workOrders.find(wo => wo.wo_number === project.work_order || wo.ro_number === project.work_order);
        if (workOrder) {
          const woAppointments = allAppointments.filter(appt => 
            appt.work_order_id === workOrder.id
          );
          appointmentMap[workOrder.id] = woAppointments;
        }
      }
      
      setAppointmentsByRO(appointmentMap);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  };

  const loadTechTimeForProjects = async () => {
    try {
      // Fetch all time sessions from WorkPRO
      const response = await fetch(`${API_BASE_URL}/ProjectTimeSession`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });

      if (!response.ok) {
        console.error('Error fetching tech time sessions:', response.status);
        return;
      }

      const data = await response.json();
      const sessions = Array.isArray(data) ? data : (data?.records || []);

      // Group by project_id and calculate totals + clocked in techs
      const techTimeMap = {};
      
      for (const session of sessions) {
        if (!session.project_id) continue;
        
        if (!techTimeMap[session.project_id]) {
          techTimeMap[session.project_id] = {
            totalHours: 0,
            clockedInTechs: []
          };
        }
        
        techTimeMap[session.project_id].totalHours += parseFloat(session.total_hours) || 0;
        
        // Check if this session is incomplete (clocked in but not out)
        if (session.start_time && !session.end_time) {
          const techName = session.user_name || session.employee_name || 'Unknown';
          if (!techTimeMap[session.project_id].clockedInTechs.includes(techName)) {
            techTimeMap[session.project_id].clockedInTechs.push(techName);
          }
        }
      }
      
      // Fine-grained update: only update if data has changed
      setProjectTechTime(prev => {
        const prevSignature = JSON.stringify(prev);
        const newSignature = JSON.stringify(techTimeMap);
        if (prevSignature !== newSignature) {
          return techTimeMap;
        }
        return prev;
      });
      setTechTimeLoaded(true);
    } catch (error) {
      console.error('Error loading tech time:', error);
    }
  };

  const getAppointmentDisplay = (workOrderId) => {
    const appointments = appointmentsByRO[workOrderId] || [];
    
    if (appointments.length === 0) {
      return { text: 'No Appointments', isPast: false, isFuture: false };
    }
    
    const now = new Date();
    const futureAppointments = appointments.filter(appt => 
      appt.start_time && new Date(appt.start_time) > now
    );

    if (futureAppointments.length > 0) {
      // Show the nearest future appointment
      const nearest = futureAppointments.sort((a, b) => 
        new Date(a.start_time) - new Date(b.start_time)
      )[0];

      const nearestDate = new Date(nearest.start_time);
      return {
        text: !isNaN(nearestDate.getTime()) ? format(nearestDate, 'MMM d, h:mm a') : 'Invalid Date',
        isPast: false,
        isFuture: true
      };
    }

    // If no future appointments, check if any are in the past
    const pastAppointments = appointments.filter(appt => appt.start_time && new Date(appt.start_time) <= now);
    if (pastAppointments.length > 0) {
      return { text: 'Past Appointments', isPast: true, isFuture: false };
    }

    // Fallback, should ideally not be reached if appointments array is not empty
    return { text: 'No Future Appointments', isPast: true, isFuture: false };
  };

  const handleOpenAppointmentsModal = (e, workOrder) => {
    e.stopPropagation();
    setSelectedProjectWorkOrder(workOrder);
    
    // Check if there are appointments for this work order
    const appointments = appointmentsByRO[workOrder.id] || [];
    
    if (appointments.length === 0) {
      // No appointments - open scheduler instead
      setShowSchedulerModal(true);
    } else {
      // Has appointments - show list
      setShowAppointmentsModal(true);
    }
  };

  const handleAppointmentClick = (appointment) => {
    setShowAppointmentsModal(false);
    setSelectedAppointment(appointment);
    setShowEditApptModal(true);
  };

  const handleAppointmentUpdated = () => {
    setShowEditApptModal(false);
    setShowSchedulerModal(false);
    loadAppointmentsForProjects();
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'done':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'parts_needed':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'awaiting_work':
      case 'to_do':
        return <Clock className="w-5 h-5 text-slate-400" />;
      case 'on_hold':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'archived':
        return <Wrench className="w-5 h-5 text-gray-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'done': 'bg-green-100 text-green-800 border-green-200',
      'in_progress': 'bg-blue-100 text-blue-800 border-blue-200',
      'parts_needed': 'bg-orange-100 text-orange-800 border-orange-200',
      'awaiting_work': 'bg-slate-100 text-slate-800 border-slate-200',
      'to_do': 'bg-slate-100 text-slate-800 border-slate-200',
      'on_hold': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'archived': 'bg-gray-100 text-gray-800 border-gray-200',
    };
    
    const statusLower = status?.toLowerCase();
    const displayText = status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return (
      <Badge className={`${colors[statusLower] || colors['awaiting_work']} border font-medium`}>
        {displayText || 'Unknown'}
      </Badge>
    );
  };

  const handleOpenWorkOrder = (workOrderNumber) => {
    if (!workOrderNumber) return;
    
    const workOrder = workOrders.find(wo => wo.wo_number === workOrderNumber || wo.ro_number === workOrderNumber);
    if (workOrder) {
      handleEdit(workOrder);
    } else {
      alert(`Work order ${workOrderNumber} not found in the system.`);
    }
  };

  const handleOpenTaskModal = (e, project, workOrder) => {
    e.stopPropagation();
    setSelectedProject(project);
    setSelectedProjectWorkOrder(workOrder);
    setShowTaskModal(true);
  };

  const handleOpenDescriptionModal = (e, project, workOrder) => {
    e.stopPropagation();
    setSelectedProject(project);
    setSelectedProjectWorkOrder(workOrder);
    setShowDescriptionModal(true);
  };

  const handleOpenConnectorModal = (e, project) => {
    e.stopPropagation();
    setSelectedProject(project);
    setShowConnectorModal(true);
  };

  const handleOpenWorkPROModal = (e, project, workOrder) => {
    e.stopPropagation();
    setSelectedProject(project);
    setSelectedProjectWorkOrder(workOrder);
    setShowWorkPROModal(true);
  };

  const handleConnectionComplete = () => {
    setShowConnectorModal(false);
    loadWorkPROProjects();
  };

  const handleProjectUpdate = (field, value) => {
    setSelectedProject(prev => prev ? { ...prev, [field]: value } : null);
    
    setWorkPROProjects(prev => prev.map(p => 
      p.id === selectedProject?.id ? { ...p, [field]: value } : p
    ));
  };

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return '';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const getRelevantDate = (workOrder) => {
    if (workOrder.stage === 'estimate' && workOrder.est_date) {
      return workOrder.est_date;
    } else if (workOrder.stage === 'work_order' && workOrder.wo_date) {
      return workOrder.wo_date;
    } else if (workOrder.stage === 'invoice' && workOrder.invoice_date) {
      return workOrder.invoice_date;
    } else if (workOrder.completed_date) {
      return workOrder.completed_date;
    }
    return null;
  };

  const sortWorkOrders = (orders, sortBy) => {
    const sorted = [...orders];
    
    switch(sortBy) {
      case "customer_az":
        return sorted.sort((a, b) => {
          const nameA = getCustomerName(a.customer_id).toLowerCase();
          const nameB = getCustomerName(b.customer_id).toLowerCase();
          return nameA.localeCompare(nameB);
        });
      
      case "customer_za":
        return sorted.sort((a, b) => {
          const nameA = getCustomerName(a.customer_id).toLowerCase();
          const nameB = getCustomerName(b.customer_id).toLowerCase();
          return nameB.localeCompare(nameA);
        });
      
      case "date_newest":
        return sorted.sort((a, b) => {
          const dateA = getRelevantDate(a);
          const dateB = getRelevantDate(b);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          const dateObjA = new Date(dateA);
          const dateObjB = new Date(dateB);
          if (isNaN(dateObjA.getTime()) && isNaN(dateObjB.getTime())) return 0;
          if (isNaN(dateObjA.getTime())) return 1;
          if (isNaN(dateObjB.getTime())) return -1;
          return dateObjB - dateObjA;
        });
      
      case "date_oldest":
        return sorted.sort((a, b) => {
          const dateA = getRelevantDate(a);
          const dateB = getRelevantDate(b);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          const dateObjA = new Date(dateA);
          const dateObjB = new Date(dateB);
          if (isNaN(dateObjA.getTime()) && isNaN(dateObjB.getTime())) return 0;
          if (isNaN(dateObjA.getTime())) return 1;
          if (isNaN(dateObjB.getTime())) return -1;
          return dateObjA - dateObjB;
        });
      
      case "amount_highest":
        return sorted.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      
      case "amount_lowest":
        return sorted.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
      
      default:
        return sorted;
    }
  };

  const handleSubmit = async (workOrderData) => {
    try {
      if (editingWorkOrder && editingWorkOrder.id) {
        await WorkOrder.update(editingWorkOrder.id, workOrderData);
      } else {
        console.warn("handleSubmit called for a new work order. This should be handled by NewWorkOrderModal.");
        return;
      }
      
      setShowForm(false);
      setEditingWorkOrder(null);
      loadData();
    } catch (error) {
      console.error('Error saving work order:', error);
    }
  };

  const handleCreateNewWorkOrder = async (workOrderData) => {
    try {
      console.log('Creating work order with data:', workOrderData);
      
      const createdWorkOrder = await WorkOrder.create(workOrderData);
      console.log('Created work order:', createdWorkOrder);
      
      if (!createdWorkOrder || !createdWorkOrder.ro_number) {
        throw new Error('Work order creation failed - no RO number returned');
      }
      
      loadData();
      setShowNewWorkOrderModal(false);
      
      setTimeout(() => {
        const url = `/WorkOrderEdit?id=${createdWorkOrder.ro_number}`;
        console.log('Opening work order at:', url);
        
        // Check user's OpenNewWindow preference
        if (currentUser?.OpenNewWindow === false) {
          // Open in same tab
          window.location.href = url;
        } else {
          // Open in new window (default behavior)
          const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
          window.open(url, '_blank', windowFeatures);
        }
      }, 500);
      
    } catch (error) {
      console.error('Error creating work order:', error);
      alert(`Failed to create work order: ${error.message}`);
    }
  };

  const handleEdit = (workOrder) => {
    const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
    
    // Check user's OpenNewWindow preference
    if (currentUser?.OpenNewWindow === false) {
      // Open in same tab
      window.location.href = url;
    } else {
      // Open in new window (default behavior)
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      window.open(url, '_blank', windowFeatures);
    }
  };

  const handleStatusUpdate = async (workOrderId, newStatus) => {
    try {
      await WorkOrder.update(workOrderId, { status: newStatus });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const generateRandomString = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateCounterSale = async () => {
    try {
      const counterSaleCustomer = customers.find(c => 
        c.first_name?.toLowerCase() === 'counter' && c.last_name?.toLowerCase() === 'sale'
      );
      
      if (!counterSaleCustomer) {
        alert('Counter Sale customer not found. Please create a customer named "Counter Sale" first.');
        return;
      }
      
      const counterSaleVehicle = vehicles.find(v => 
        v.customer_id === counterSaleCustomer.id && 
        v.make === 'Counter' && 
        v.model === 'Sale'
      );
      
      if (!counterSaleVehicle) {
        alert('Counter Sale vehicle not found for the Counter Sale customer. Please create a vehicle with Make: "Counter" and Model: "Sale" for the "Counter Sale" customer.');
        return;
      }
      
      // Fetch next RO number from SystemSettings
      const { SystemSettings } = await import('@/entities/all');
      const settings = await SystemSettings.list();
      const systemSettings = settings && settings.length > 0 ? settings[0] : null;
      
      const nextRo = systemSettings?.next_ro_number || 1001;
      
      // Increment and save back to SystemSettings
      if (systemSettings) {
        await SystemSettings.update(systemSettings.id, {
          next_ro_number: nextRo + 1
        });
      } else {
        await SystemSettings.create({
          next_ro_number: nextRo + 1
        });
      }
      
      const cp_id = generateRandomString(10);
      const numbers = {
        ro_number: `RO${nextRo}`,
        wo_number: `WO${nextRo}`,
        cp_id: cp_id,
      };
      
      const counterSaleDefaultLineItems = [
        { id: Date.now() + 1, qty: "", hrs: "", description: "", part_number: "", parts_ea: 0, tot_parts: 0, labour: 0, tx: "Y", total: 0, complete: false, bold: false },
        { id: Date.now() + 2, qty: "", hrs: "", description: "", part_number: "", parts_ea: 0, tot_parts: 0, labour: 0, tx: "Y", total: 0, complete: false, bold: false },
        { id: Date.now() + 3, qty: "", hrs: "", description: "", part_number: "", parts_ea: 0, tot_parts: 0, labour: 0, tx: "Y", total: 0, complete: false, bold: false }
      ];
      
      const newWorkOrder = {
        ...numbers,
        customer_id: counterSaleCustomer.id,
        vehicle_id: counterSaleVehicle.id,
        status: "Open",
        priority: "medium",
        stage: "work_order",
        approval: "pending",
        wo_date: format(new Date(), 'yyyy-MM-dd'),
        description: "Counter Sale",
        customer_complaint: "",
        estimated_hours: null,
        labor_rate: 120,
        total_amount: 0,
        scheduled_date: "",
        technician: "",
        line_items: JSON.stringify(counterSaleDefaultLineItems),
        notes_to_customer: "",
        amount_paid: 0,
        payments: JSON.stringify([])
      };
      
      console.log('Creating counter sale work order with data:', newWorkOrder);
      
      const createdWorkOrder = await WorkOrder.create(newWorkOrder);
      console.log('Created counter sale work order:', createdWorkOrder);
      
      if (!createdWorkOrder || !createdWorkOrder.ro_number) {
        throw new Error('Counter sale work order creation failed - no RO number returned');
      }
      
      loadData();
      
      setTimeout(() => {
        const url = `/WorkOrderEdit?id=${createdWorkOrder.ro_number}`;
        console.log('Opening counter sale work order at:', url);
        
        // Check user's OpenNewWindow preference
        if (currentUser?.OpenNewWindow === false) {
          // Open in same tab
          window.location.href = url;
        } else {
          // Open in new window (default behavior)
          const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
          window.open(url, '_blank', windowFeatures);
        }
      }, 500);
      
    } catch (error) {
      console.error('Error creating counter sale work order:', error);
      alert(`Failed to create counter sale work order: ${error.message}`);
    }
  };

  const handleFlushLocks = async () => {
    setLoading(true);
    try {
      const allWorkOrders = await WorkOrder.list();

      const updates = allWorkOrders.map(wo => {
        if (wo.LockedByUser) {
          return WorkOrder.update(wo.id, { LockedByUser: '' });
        }
        return Promise.resolve();
      });

      await Promise.all(updates);

      alert('All work order locks have been flushed.');
      loadData();
    } catch (error) {
      console.error('Error flushing locks:', error);
      alert('Failed to flush locks. Please try again.');
    } finally {
      setShowFlushConfirm(false);
      setLoading(false);
    }
  };

  const getCurrentSort = () => {
    switch(activeTab) {
      case "estimates": return estimatesSort;
      case "work_in_progress": return wipSort;
      case "completed": return completedSort;
      case "invoices": return invoicesSort;
      default: return "customer_az";
    }
  };

  const setCurrentSort = (value) => {
    switch(activeTab) {
      case "estimates": setEstimatesSort(value); break;
      case "work_in_progress": setWipSort(value); break;
      case "completed": setCompletedSort(value); break;
      case "invoices": setInvoicesSort(value); break;
      default: break;
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    const customer = customers.find(c => c.id === wo.customer_id);
    const customerFullName = customer ? getCustomerName(customer.id) : '';

    const matchesSearch = !searchTerm || 
      wo.wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.ro_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerFullName.toLowerCase().includes(searchTerm.toLowerCase());
      
    return matchesSearch;
  });

  const getCustomer = (customerId) => customers.find(c => c.id === customerId);
  const getVehicle = (vehicleId) => vehicles.find(v => v.id === vehicleId);

  // Filter WorkPRO projects by status and search term
  const filteredWorkPROProjects = workPROProjects.filter(project => {
    const matchesStatus = project.status === workPROStatusFilter;
    
    if (!searchTerm) return matchesStatus;
    
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      project.customer?.toLowerCase().includes(searchLower) ||
      project.vehicle?.toLowerCase().includes(searchLower) ||
      project.vin?.toLowerCase().includes(searchLower) ||
      project.task?.toLowerCase().includes(searchLower) ||
      project.description?.toLowerCase().includes(searchLower) ||
      project.work_order?.toLowerCase().includes(searchLower);
    
    return matchesStatus && matchesSearch;
  });

  // Count projects by status
  const getProjectCountByStatus = (status) => {
    return workPROProjects.filter(p => p.status === status).length;
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Work Orders</h1>
            <p className="text-slate-600 mt-1">Manage service jobs and repairs</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                loadData();
                if (mainTab === 'workpro') {
                  loadWorkPROProjects();
                }
              }}
              disabled={loading || workPROLoading}
              className="bg-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${(loading || workPROLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {(currentUser?.access_level === 'lvl2_user' || currentUser?.access_level === 'lvl3_user') && (
              <Button
                variant="destructive"
                onClick={() => setShowFlushConfirm(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Flush Locks
              </Button>
            )}
            <Button 
              onClick={handleCreateCounterSale}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Counter Sale
            </Button>
            <Button 
              onClick={() => setShowNewWorkPROModal(true)}
              className="bg-gray-700 hover:bg-gray-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <Button 
              onClick={() => setShowNewWorkOrderModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Work Order
            </Button>
          </div>
        </div>

        {/* Flush Locks Confirmation Dialog */}
        <Dialog open={showFlushConfirm} onOpenChange={setShowFlushConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Flush All Locks</DialogTitle>
              <DialogDescription className="text-red-600 font-medium">
                This will unlock all work orders. Progress of any unsaved work orders may not be saved. 
                Verify that all open work orders are saved and closed across the platform before executing this.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFlushConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleFlushLocks}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Work Order Creation Modal */}
        <NewWorkOrderModal
          open={showNewWorkOrderModal}
          onClose={() => setShowNewWorkOrderModal(false)}
          customers={customers}
          vehicles={vehicles}
          onCreateWorkOrder={handleCreateNewWorkOrder}
        />

        {showForm && (
          <WorkOrderForm
            workOrder={editingWorkOrder}
            customers={customers}
            vehicles={vehicles}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingWorkOrder(null);
            }}
          />
        )}

        {!showForm && (
          <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
            {/* Tabs with Search and Filter inline */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <TabsList className="grid grid-cols-3 w-full lg:w-auto">
                  <TabsTrigger value="list">Work Order List</TabsTrigger>
                  <TabsTrigger value="workpro">WorkPRO</TabsTrigger>
                  <TabsTrigger value="board">Kanban Board</TabsTrigger>
                </TabsList>
                {mainTab === 'board' && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKanbanSettings(true)}
                    className="shrink-0"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Search and Sort Controls */}
              <div className="flex gap-3 items-center w-full lg:w-auto">
                <div className="relative flex-1 lg:w-80">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder={
                      mainTab === 'workpro' 
                        ? "Search projects, customers, VIN..." 
                        : "Search work orders, customers..."
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={getCurrentSort()} onValueChange={setCurrentSort}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_az">Customer (A-Z)</SelectItem>
                    <SelectItem value="customer_za">Customer (Z-A)</SelectItem>
                    <SelectItem value="date_newest">Date (Newest)</SelectItem>
                    <SelectItem value="date_oldest">Date (Oldest)</SelectItem>
                    <SelectItem value="amount_highest">Amount (High)</SelectItem>
                    <SelectItem value="amount_lowest">Amount (Low)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="list">
              <div className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="estimates">Estimates</TabsTrigger>
                    <TabsTrigger value="work_in_progress">Work In Progress</TabsTrigger>
                    <TabsTrigger value="completed">Completed Work Orders</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                  </TabsList>

                  <TabsContent value="estimates">
                    <WorkOrderList
                      workOrders={sortWorkOrders(
                        filteredWorkOrders.filter(wo => wo.stage === 'estimate'),
                        estimatesSort
                      )}
                      customers={customers}
                      vehicles={vehicles}
                      loading={!initialLoadComplete && loading}
                      onSelect={handleEdit}
                      onEdit={handleEdit}
                      onStatusUpdate={handleStatusUpdate}
                      currentUser={currentUser}
                    />
                  </TabsContent>

                  <TabsContent value="work_in_progress">
                    <WorkOrderList
                      workOrders={sortWorkOrders(
                        filteredWorkOrders.filter(wo => {
                          const isWorkInProgress = wo.stage === 'work_order' && wo.status !== 'Completed';
                          return isWorkInProgress;
                        }),
                        wipSort
                      )}
                      customers={customers}
                      vehicles={vehicles}
                      loading={!initialLoadComplete && loading}
                      onSelect={handleEdit}
                      onEdit={handleEdit}
                      onStatusUpdate={handleStatusUpdate}
                      currentUser={currentUser}
                    />
                  </TabsContent>

                  <TabsContent value="completed">
                    <WorkOrderList
                      workOrders={sortWorkOrders(
                        filteredWorkOrders.filter(wo => wo.stage === 'work_order' && wo.status === 'Completed'),
                        completedSort
                      )}
                      customers={customers}
                      vehicles={vehicles}
                      loading={!initialLoadComplete && loading}
                      onSelect={handleEdit}
                      onEdit={handleEdit}
                      onStatusUpdate={handleStatusUpdate}
                      currentUser={currentUser}
                    />
                  </TabsContent>

                  <TabsContent value="invoices">
                    <WorkOrderList
                      workOrders={sortWorkOrders(
                        filteredWorkOrders.filter(wo => wo.stage === 'invoice'),
                        invoicesSort
                      )}
                      customers={customers}
                      vehicles={vehicles}
                      loading={!initialLoadComplete && loading}
                      onSelect={handleEdit}
                      onEdit={handleEdit}
                      onStatusUpdate={handleStatusUpdate}
                      currentUser={currentUser}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>

            {/* WorkPRO Tab */}
            <TabsContent value="workpro">
              {/* Status Filter Tabs - Only on WorkPRO tab */}
              <Card className="mb-6">
                <CardContent className="p-4">
                  <Tabs value={workPROStatusFilter} onValueChange={setWorkPROStatusFilter}>
                    <TabsList className="grid w-full grid-cols-6">
                      <TabsTrigger 
                        value="to_do" 
                        className="flex items-center gap-2 bg-slate-200 text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                      >
                        <span>To Do</span>
                        <Badge variant="outline" className="bg-white text-slate-900 border-slate-400">
                          {getProjectCountByStatus('to_do')}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="in_progress"
                        className="flex items-center gap-2 bg-blue-200 text-blue-900 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                      >
                        <span>In Progress</span>
                        <Badge variant="outline" className="bg-white text-blue-600 border-blue-400">
                          {getProjectCountByStatus('in_progress')}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="parts_needed"
                        className="flex items-center gap-2 bg-red-200 text-red-900 data-[state=active]:bg-red-600 data-[state=active]:text-white"
                      >
                        <span>Parts Needed</span>
                        <Badge variant="outline" className="bg-white text-red-600 border-red-400">
                          {getProjectCountByStatus('parts_needed')}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="on_hold"
                        className="flex items-center gap-2 bg-orange-200 text-orange-900 data-[state=active]:bg-orange-500 data-[state=active]:text-white"
                      >
                        <span>On Hold</span>
                        <Badge variant="outline" className="bg-white text-orange-500 border-orange-400">
                          {getProjectCountByStatus('on_hold')}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="done"
                        className="flex items-center gap-2 bg-green-200 text-green-900 data-[state=active]:bg-green-600 data-[state=active]:text-white"
                      >
                        <span>Done</span>
                        <Badge variant="outline" className="bg-white text-green-600 border-green-400">
                          {getProjectCountByStatus('done')}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="archived"
                        className="flex items-center gap-2 bg-gray-300 text-gray-900 data-[state=active]:bg-gray-600 data-[state=active]:text-white"
                      >
                        <span>Archived</span>
                        <Badge variant="outline" className="bg-white text-gray-600 border-gray-400">
                          {getProjectCountByStatus('archived')}
                        </Badge>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>

              {workPROLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {Array(4).fill(0).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-4 w-32" />
                          <div className="flex gap-2">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-8 w-32" />
                          </div>
                          <Skeleton className="h-20 w-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredWorkPROProjects.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <div className="text-slate-400 mb-4">
                      <Wrench className="w-12 h-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Projects Found</h3>
                    <p className="text-slate-600">No projects with status "{workPROStatusFilter.replace(/_/g, ' ')}".</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredWorkPROProjects.map((project) => {
                    const workOrder = workOrders.find(wo => wo.wo_number === project.work_order || wo.ro_number === project.work_order);
                    const appointmentInfo = workOrder ? getAppointmentDisplay(workOrder.id) : null;
                    
                    const employeesDisplay = Array.isArray(project.employees_assigned) && project.employees_assigned.length > 0
                      ? project.employees_assigned.join(', ')
                      : 'Unassigned';
                    
                    return (
                      <Card 
                        key={project.id} 
                        className="hover:shadow-lg transition-all duration-200 overflow-hidden"
                      >
                        <CardContent className="p-0">
                          {/* Header Section - Clickable to open WorkPRO Modal */}
                          <div 
                            className="p-6 border-b border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenWorkPROModal(e, project, workOrder);
                            }}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="text-xl font-bold text-slate-900 mb-1">
                                  {project.customer || 'Unknown Customer'}
                                </h3>
                                {project.vehicle && (
                                  <p className="text-sm text-slate-600 mb-1">
                                    {project.vehicle}
                                  </p>
                                )}
                                {project.vin && (
                                  <p className="text-xs text-slate-500">
                                    VIN: {project.vin}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Clocked In Badge - moved here */}
                                {projectTechTime[project.id]?.clockedInTechs?.length > 0 && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">
                                    Clocked in: {projectTechTime[project.id].clockedInTechs.join(', ')}
                                  </Badge>
                                )}
                                {/* Static clock icon - opens tech clock status modal */}
                                <div 
                                  className="p-1 rounded hover:bg-slate-200 cursor-pointer transition-colors"
                                  onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openTechClockStatusModal();
                                                                          }}
                                >
                                  <Clock className="w-5 h-5 text-blue-500" />
                                </div>
                              </div>
                            </div>

                            {/* Two Column Layout: Tech/Date on Left, WO Connected on Right */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {/* Left Side: Tech Assigned and Created Date */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-slate-600">
                                  <Users className="w-4 h-4" />
                                  <span>{employeesDisplay}</span>
                                </div>
                                {project.created_date && !isNaN(new Date(project.created_date).getTime()) && (
                                  <p className="text-xs text-slate-500 pl-5">
                                    Created: {format(new Date(project.created_date), 'MMM d, yyyy')}
                                  </p>
                                )}
                              </div>

                              {/* Right Side: Work Order Connected or Not Connected - Stops propagation */}
                              <div className="flex items-center justify-end">
                                {project.work_order ? (
                                  <div 
                                    className="bg-blue-50 border border-blue-200 rounded-md px-4 py-2 cursor-pointer hover:bg-blue-100 transition-colors min-w-[180px]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenWorkOrder(project.work_order);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-blue-600" />
                                      <div>
                                        <p className="text-xs font-semibold text-blue-900">Work Order Connected</p>
                                        <p className="text-xs text-blue-700">WO: {project.work_order}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div 
                                    className="bg-white border border-slate-300 rounded-md px-4 py-2 cursor-pointer hover:bg-slate-50 transition-colors min-w-[180px]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenConnectorModal(e, project);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <LinkIcon className="w-4 h-4 text-slate-500" />
                                      <div>
                                        <p className="text-xs font-semibold text-slate-700">No Work Order</p>
                                        <p className="text-xs text-slate-500">Click to connect</p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Appointments Section - Only show if work order is connected AND found */}
                          {workOrder && project.work_order && (
                            <div 
                              className="px-6 py-3 border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={(e) => handleOpenAppointmentsModal(e, workOrder)}
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className={`w-4 h-4 ${appointmentInfo?.isFuture ? 'text-green-600' : 'text-slate-400'}`} />
                                <div>
                                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Appointments</p>
                                  <p className={`text-sm ${appointmentInfo?.isFuture ? 'text-green-700 font-medium' : 'text-slate-600'}`}>
                                    {appointmentInfo?.text || 'No Appointments'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Task Section - Clickable */}
                          {project.task ? (
                            <div 
                              className="px-6 py-4 border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={(e) => handleOpenTaskModal(e, project, workOrder)}
                            >
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-slate-600 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Task</p>
                                  <p className="text-sm text-slate-900">{project.task}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="px-6 py-4 border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={(e) => handleOpenTaskModal(e, project, workOrder)}
                            >
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Task</p>
                                  <p className="text-sm text-slate-400 italic">No task defined - click to add</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Description Section - Clickable */}
                          {project.description ? (
                            <div 
                              className="px-6 py-4 border-b border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
                              onClick={(e) => handleOpenDescriptionModal(e, project, workOrder)}
                            >
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-slate-600 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</p>
                                  <p className="text-sm text-slate-700">{project.description}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="px-6 py-4 border-b border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
                              onClick={(e) => handleOpenDescriptionModal(e, project, workOrder)}
                            >
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</p>
                                  <p className="text-sm text-slate-400 italic">No description provided - click to add</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Footer Section */}
                          <div className="px-6 py-4 bg-slate-50">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                              <div className="flex items-center gap-3">
                                {getStatusBadge(project.status)}
                                {/* Tech Time Logged Badge - Clickable */}
                                {projectTechTime[project.id] && (
                                  <Badge 
                                    variant="outline" 
                                    className="bg-purple-50 text-purple-700 border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedProject(project);
                                      setShowTechTimeModal(true);
                                    }}
                                  >
                                    {projectTechTime[project.id].totalHours.toFixed(1)}h logged
                                  </Badge>
                                )}

                                {project.odometer_reading && (
                                  <span className="text-sm text-slate-600">
                                    {project.odometer_reading.toLocaleString()} km
                                  </span>
                                )}
                              </div>
                              {project.time_estimate && (
                                <div className="flex items-center gap-1 text-sm text-slate-600">
                                  <Clock className="w-4 h-4" />
                                  <span>{project.time_estimate}h estimated</span>
                                </div>
                              )}
                            </div>

                            {/* Warning/Status Messages */}
                            {project.status === 'parts_needed' && (
                              <div className="mt-3 flex items-center gap-2 text-sm text-orange-700 bg-orange-50 px-3 py-2 rounded-md border border-orange-200">
                                <AlertTriangle className="w-4 h-4" />
                                <span>Parts needed for completion</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="board">
              <div className="flex gap-6 overflow-x-auto pb-4">
                {workOrderStatuses.map(statusObj => {
                  const status = statusObj.name;
                  const statusWorkOrders = filteredWorkOrders.filter(wo => 
                    wo.status === status && 
                    (wo.stage === 'estimate' || wo.stage === 'work_order')
                  );

                  // Helper to get color classes
                  const getColorClass = (color) => {
                    const colorMap = {
                      slate: 'bg-slate-100 border-slate-300',
                      gray: 'bg-gray-100 border-gray-300',
                      red: 'bg-red-50 border-red-300',
                      orange: 'bg-orange-50 border-orange-300',
                      amber: 'bg-amber-50 border-amber-300',
                      yellow: 'bg-yellow-50 border-yellow-300',
                      lime: 'bg-lime-50 border-lime-300',
                      green: 'bg-green-50 border-green-300',
                      emerald: 'bg-emerald-50 border-emerald-300',
                      teal: 'bg-teal-50 border-teal-300',
                      cyan: 'bg-cyan-50 border-cyan-300',
                      sky: 'bg-sky-50 border-sky-300',
                      blue: 'bg-blue-50 border-blue-300',
                      indigo: 'bg-indigo-50 border-indigo-300',
                      violet: 'bg-violet-50 border-violet-300',
                      purple: 'bg-purple-50 border-purple-300',
                      fuchsia: 'bg-fuchsia-50 border-fuchsia-300',
                      pink: 'bg-pink-50 border-pink-300',
                      rose: 'bg-rose-50 border-rose-300',
                    };
                    return colorMap[color?.toLowerCase()] || colorMap.slate;
                  };

                  const colorClass = getColorClass(statusObj.color);
                  const columnSize = kanbanColumnSizes[status] || { width: 280, height: 600 };

                  return (
                    <Card 
                      key={status} 
                      className={`${colorClass} border-2 flex-shrink-0`}
                      style={{ 
                        width: `${columnSize.width}px`,
                        height: `${columnSize.height}px`
                      }}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm font-medium text-slate-700 uppercase tracking-wide">
                          {status}
                          <Badge variant="outline" className="ml-2 bg-white">
                            {statusWorkOrders.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 overflow-y-auto" style={{ maxHeight: `${columnSize.height - 80}px` }}>
                        {statusWorkOrders.map(wo => {
                          const customer = getCustomer(wo.customer_id);
                          const vehicle = getVehicle(wo.vehicle_id);
                          const displayNumber = wo.stage === 'estimate' ? wo.est_number : wo.wo_number;
                          const relevantDate = wo.stage === 'estimate' ? wo.est_date : wo.wo_date;
                          
                          return (
                            <Card 
                              key={wo.id} 
                              className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => handleEdit(wo)}
                            >
                              <div className="space-y-2">
                                <div className="flex justify-between items-start">
                                  <p className="font-semibold text-sm">
                                    {customer ? getCustomerName(customer.id) : 'Customer Not Found'}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2">{wo.description}</p>
                                {displayNumber && (
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    {displayNumber}
                                  </p>
                                )}
                                {vehicle && (
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Car className="w-3 h-3" />
                                    {vehicle.year} {vehicle.make} {vehicle.model}
                                  </p>
                                )}
                                {relevantDate && !isNaN(new Date(relevantDate).getTime()) && (
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(relevantDate), 'MMM d, yyyy')}
                                  </p>
                                )}
                                <div className="flex justify-between items-center pt-2">
                                  <p className="text-xs font-semibold text-slate-900">
                                    ${(wo.total_amount || 0).toFixed(2)}
                                  </p>
                                  {wo.scheduled_date && !isNaN(new Date(wo.scheduled_date).getTime()) && (
                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {format(new Date(wo.scheduled_date), 'MMM d')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* WorkPRO Modals */}
      <WorkPROModal
        open={showWorkPROModal}
        onClose={() => setShowWorkPROModal(false)}
        workOrder={selectedProjectWorkOrder}
        customer={customers.find(c => c.id === selectedProjectWorkOrder?.customer_id)} 
        initialWorkPROProject={selectedProject}
        onConnectionChange={() => loadWorkPROProjects()}
        customers={customers} 
        vehicles={vehicles} 
        onProjectUpdate={handleProjectUpdate}
        API_BASE_URL={API_BASE_URL}
        WORKPRO_API_KEY={WORKPRO_API_KEY}
      />

      <WorkPROTaskModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        workOrder={selectedProjectWorkOrder}
        project={selectedProject}
        onUpdate={handleProjectUpdate}
        API_BASE_URL={API_BASE_URL}
        WORKPRO_API_KEY={WORKPRO_API_KEY}
      />

      <WorkPRODescriptionModal
        open={showDescriptionModal}
        onClose={() => setShowDescriptionModal(false)}
        workOrder={selectedProjectWorkOrder}
        project={selectedProject}
        onUpdate={handleProjectUpdate}
        API_BASE_URL={API_BASE_URL}
        WORKPRO_API_KEY={WORKPRO_API_KEY}
      />

      <WorkPROConnectorModal
        open={showConnectorModal}
        onClose={() => setShowConnectorModal(false)}
        project={selectedProject}
        workOrders={workOrders}
        customers={customers}
        vehicles={vehicles}
        workPROProjects={workPROProjects}
        onConnectionComplete={handleConnectionComplete}
      />

      <AppointmentsListModal
        open={showAppointmentsModal}
        onClose={() => setShowAppointmentsModal(false)}
        workOrderId={selectedProjectWorkOrder?.id}
        displayNumber={selectedProjectWorkOrder?.wo_number || selectedProjectWorkOrder?.ro_number}
        onAppointmentClick={handleAppointmentClick}
        onNewAppointment={() => {
          setShowAppointmentsModal(false);
          setShowSchedulerModal(true);
        }}
      />

      <EditApptViaWoModal
        open={showEditApptModal}
        onClose={() => setShowEditApptModal(false)}
        appointment={selectedAppointment}
        workOrder={selectedProjectWorkOrder}
        customer={customers.find(c => c.id === selectedProjectWorkOrder?.customer_id)}
        vehicle={vehicles.find(v => v.id === selectedProjectWorkOrder?.vehicle_id)}
        onAppointmentUpdated={handleAppointmentUpdated}
      />

      <SchedulerViaWoModal
        open={showSchedulerModal}
        onClose={() => setShowSchedulerModal(false)}
        workOrder={selectedProjectWorkOrder}
        customer={customers.find(c => c.id === selectedProjectWorkOrder?.customer_id)}
        vehicle={vehicles.find(v => v.id === selectedProjectWorkOrder?.vehicle_id)}
        onAppointmentUpdated={handleAppointmentUpdated}
      />

      <NewWorkPROModal
        open={showNewWorkPROModal}
        onClose={() => setShowNewWorkPROModal(false)}
        customers={customers}
        vehicles={vehicles}
        onProjectCreated={() => {
          setShowNewWorkPROModal(false);
          loadWorkPROProjects();
        }}
      />

      <TechTimeModal
        open={showTechTimeModal}
        onClose={() => setShowTechTimeModal(false)}
        project={selectedProject}
      />

      <KanbanDisplaySettings
        open={showKanbanSettings}
        onClose={() => setShowKanbanSettings(false)}
        workOrderStatuses={workOrderStatuses}
        columnSizes={kanbanColumnSizes}
        onSave={setKanbanColumnSizes}
      />

      </div>
      );
      }