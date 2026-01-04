import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Trash2, Plus, Search, Calendar as CalendarIcon, AlertTriangle, ExternalLink } from 'lucide-react';

import SelectCustomerModal from './SelectCustomerModal';
import SelectWorkOrderModal from './SelectWorkOrderModal';
import WorkPROModal from '../work-orders/WorkPROModal';
import CustomerForm from '../customers/CustomerForm';
import VehicleForm from '../vehicles/VehicleForm';
import { Customer, Vehicle, WorkOrder, SystemSettings } from '@/entities/all';

export default function AppointmentForm({
  open,
  onClose,
  onSubmit,
  onDelete,
  appointment,
  slotInfo,
  employees,
  workOrders,
  customers,
  vehicles,
  onDataRefresh,
  workOrderForNew, // New prop
  customerForNew,   // New prop
  vehicleForNew,    // New prop
}) {
  const [formData, setFormData] = useState({
    title: '',
    notes: '',
    start_time: '',
    end_time: '',
    bay: '',
    employee_id: '',
    work_order_id: '',
    customer_id: '',
    vehicle_id: '',
    status: 'Scheduled',
    reminders_email: false,
    reminders_text: false,
    reminder_email_address: '',
    reminder_days_before: 1,
  });

  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [localWorkOrder, setLocalWorkOrder] = useState(null);
  const [showSelectCustomer, setShowSelectCustomer] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showSelectWorkOrder, setShowSelectWorkOrder] = useState(false);
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCreatingVehicle, setIsCreatingVehicle] = useState(false);
  const [reminderInfo, setReminderInfo] = useState(null);

  // Calculate reminder date and status
  useEffect(() => {
    if (!formData.start_time || (!formData.reminders_email && !formData.reminders_text)) {
        setReminderInfo(null);
        return;
    }

    const mstOffset = -7 * 60 * 60 * 1000;
    const now = new Date();
    // Current time in MST context
    const nowMst = new Date(now.getTime() + mstOffset);
    
    const appointmentDate = new Date(formData.start_time);
    // Appointment start time in MST context
    const appointmentMst = new Date(appointmentDate.getTime() + mstOffset);
    
    // Calculate reminder date
    const reminderDateMst = new Date(appointmentMst);
    const daysBefore = parseInt(formData.reminder_days_before) || 0; // Default to 0 if NaN, though form sets 1
    reminderDateMst.setDate(reminderDateMst.getDate() - daysBefore);

    // Adjust for weekend (Saturday/Sunday -> Friday)
    // using UTC methods because we shifted the time value to represent local time in UTC context
    const dayOfWeek = reminderDateMst.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 6) { // Saturday
        reminderDateMst.setDate(reminderDateMst.getDate() - 1); // Shift to Friday
    } else if (dayOfWeek === 0) { // Sunday
        reminderDateMst.setDate(reminderDateMst.getDate() - 2); // Shift to Friday
    }
    
    // Set to 8:00 AM MST on that date
    const cutoffMst = new Date(Date.UTC(
        reminderDateMst.getUTCFullYear(),
        reminderDateMst.getUTCMonth(),
        reminderDateMst.getUTCDate(),
        8, 0, 0
    ));
    
    const isPast = nowMst > cutoffMst;
    
    setReminderInfo({
        displayDate: reminderDateMst.toISOString().split('T')[0] + ' 8:00AM',
        isPast
    });
  }, [formData.start_time, formData.reminders_email, formData.reminders_text, formData.reminder_days_before]);

  // Bay options with new names
  const bayOptions = ['Floor', 'Main Hoist', 'North Hoist', 'Outside', 'Other'];

  // Helper function to get customer display name
  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  // Get selected customer
  const selectedCustomer = customers?.find(c => c.id === formData.customer_id);

  // Get selected work order
  const selectedWorkOrder = workOrders?.find(wo => wo.id === formData.work_order_id) || (localWorkOrder?.id === formData.work_order_id ? localWorkOrder : null);

  // Get selected vehicle
  const selectedVehicle = availableVehicles.find(v => v.id === formData.vehicle_id);

  // Memoize handleCustomerSelect to prevent it from changing on every render,
  // making it safe to include in useEffect dependencies.
  const handleCustomerSelect = useCallback(async (customerId) => {
    const customer = customers?.find(c => c.id === customerId);
    if (customer) {
      try {
        const allVehicles = await Vehicle.list();
        const customerVehicles = allVehicles.filter(v => v.customer_id === customerId);
        setAvailableVehicles(customerVehicles || []);
        
        setFormData(prev => ({
          ...prev,
          customer_id: customerId,
          // Update email address, or fall back to previous if customer has none
          reminder_email_address: customer.email || prev.reminder_email_address, 
          // If a vehicle was previously selected, ensure it belongs to the new customer, otherwise clear it.
          vehicle_id: customerVehicles.some(v => v.id === prev.vehicle_id) ? prev.vehicle_id : '',
        }));
      } catch (error) {
        console.error('Error loading vehicles:', error);
        setAvailableVehicles([]);
        setFormData(prev => ({
            ...prev,
            customer_id: customerId,
            reminder_email_address: customer.email || prev.reminder_email_address, // Keep previous email if new customer has none
            vehicle_id: '', // Clear vehicle on error loading them
        }));
      }
    } else {
      // If customer is unselected or not found, clear customer/vehicle related fields
      setFormData(prev => ({
        ...prev,
        customer_id: '',
        vehicle_id: '',
        work_order_id: '', // Also clear work order if customer is deselected
        reminder_email_address: '',
        reminders_phone: ''
      }));
      setAvailableVehicles([]);
    }
  }, [customers]); // Depend on customers to ensure latest customer data is used

  // Memoize handleWorkOrderSelect for consistency, though it's not a direct useEffect dependency
  const handleWorkOrderSelect = useCallback(async (workOrder) => {
    // Load vehicles for the work order's customer first
    if (workOrder.customer_id) {
      try {
        const allVehicles = await Vehicle.list();
        const customerVehicles = allVehicles.filter(v => v.customer_id === workOrder.customer_id);
        
        // Set available vehicles FIRST
        setAvailableVehicles(customerVehicles || []);
        
        // Get customer for email
        const customer = customers?.find(c => c.id === workOrder.customer_id);
        
        // Then update form data - use setTimeout to ensure state update completes
        // This setTimeout is to help ensure `availableVehicles` is fully updated before `formData.vehicle_id`
        // is potentially evaluated against the new `availableVehicles` list in the UI,
        // although React batches state updates. It fulfills the specific request from the outline.
        setTimeout(() => {
        setFormData(prev => ({
        ...prev,
        work_order_id: workOrder.id,
        customer_id: workOrder.customer_id,
        vehicle_id: workOrder.vehicle_id || '', // Set vehicle directly from work order
        reminder_email_address: customer?.email || prev.reminder_email_address, // Set email address here, or keep previous
        reminders_phone: customer?.phone ? customer.phone.replace(/[^0-9]/g, '') : prev.reminders_phone
        }));
        }, 0);
      } catch (error) {
        console.error('Error loading vehicles:', error);
        setAvailableVehicles([]);
        setFormData(prev => ({
          ...prev,
          work_order_id: workOrder.id,
          customer_id: workOrder.customer_id,
          vehicle_id: workOrder.vehicle_id || '', // Still try to set vehicle ID from WO
          reminder_email_address: prev.reminder_email_address // Preserve previous email if customer lookup failed
        }));
      }
    } else {
      // No customer on work order, just set work order and clear related fields
      setFormData(prev => ({
        ...prev,
        work_order_id: workOrder.id,
        customer_id: '', // Clear customer if WO doesn't have one
        vehicle_id: '', // Clear vehicle if WO doesn't have customer
        reminder_email_address: '', // Clear email
        reminders_phone: ''
      }));
      setAvailableVehicles([]);
    }
  }, [customers]); // Depend on customers to find the correct email


  // Reset form when modal opens or selected appointment changes
  useEffect(() => {
    // Only run initialization logic when the modal opens or the specific item being edited changes
    // NOT when background data (like customers list) refreshes
    if (open) {
      // NOTE: We do NOT reset localWorkOrder here, so that if we just created one, it persists through re-renders
      
      if (appointment) {
        // Editing existing appointment - load vehicles first if there's a customer
        const loadAppointmentData = async () => {
          // First, load vehicles if there's a customer
          if (appointment.customer_id) {
            try {
              const allVehicles = await Vehicle.list();
              const customerVehicles = allVehicles.filter(v => v.customer_id === appointment.customer_id);
              setAvailableVehicles(customerVehicles || []);
            } catch (error) {
              console.error('Error loading vehicles:', error);
              setAvailableVehicles([]);
            }
          } else {
            setAvailableVehicles([]);
          }

          // Then set form data
          setFormData({
            title: appointment.title || '',
            notes: appointment.notes || '',
            start_time: appointment.start_time || '',
            end_time: appointment.end_time || '',
            bay: appointment.bay || '',
            employee_id: appointment.employee_id || '',
            work_order_id: appointment.work_order_id || '',
            customer_id: appointment.customer_id || '',
            vehicle_id: appointment.vehicle_id || '',
            status: appointment.status || 'Scheduled',
            reminders_email: appointment.reminders_email || false,
            reminders_text: appointment.reminders_text || false,
            reminder_email_address: appointment.reminder_email_address || '',
            reminders_phone: appointment.reminders_phone ? appointment.reminders_phone.replace(/^\+1/, '') : '',
            reminder_days_before: appointment.reminder_days_before || 1,
          });
        };

        loadAppointmentData();
      } else if (workOrderForNew || customerForNew) {
        // Creating new appointment with pre-filled data from work order or customer/vehicle
        const loadNewAppointmentData = async () => {
          const customerId = customerForNew?.id || workOrderForNew?.customer_id;
          const vehicleId = vehicleForNew?.id || workOrderForNew?.vehicle_id;
          const workOrderId = workOrderForNew?.id;

          // Load vehicles if we have a customer
          if (customerId) {
            try {
              const allVehicles = await Vehicle.list();
              const customerVehicles = allVehicles.filter(v => v.customer_id === customerId);
              setAvailableVehicles(customerVehicles || []);
            } catch (error) {
              console.error('Error loading vehicles:', error);
              setAvailableVehicles([]);
            }
          } else {
            setAvailableVehicles([]);
          }

          // Get customer for email (using customers from closure when effect runs)
          const customer = customers?.find(c => c.id === customerId);

          // Set form data with pre-filled information
          setFormData({
            title: '',
            notes: '',
            start_time: slotInfo?.start?.toISOString() || '',
            end_time: slotInfo?.end?.toISOString() || '',
            bay: slotInfo?.bay || '',
            employee_id: '',
            work_order_id: workOrderId || '',
            customer_id: customerId || '',
            vehicle_id: vehicleId || '',
            status: 'Scheduled',
            reminders_email: false,
            reminders_text: false,
            reminder_email_address: customer?.email || '',
            reminders_phone: customer?.phone ? customer.phone.replace(/[^0-9]/g, '') : '',
            reminder_days_before: 1,
          });
        };

        loadNewAppointmentData();
      } else if (slotInfo) {
        // Creating new appointment from time slot click
        setFormData({
          title: '',
          notes: '',
          start_time: slotInfo.start.toISOString(),
          end_time: slotInfo.end.toISOString(),
          bay: slotInfo.bay || '',
          employee_id: '',
          work_order_id: '',
          customer_id: '',
          vehicle_id: '',
          status: 'Scheduled',
          reminders_email: false,
          reminders_text: false,
          reminder_email_address: '',
          reminders_phone: '',
          reminder_days_before: 1,
        });
        setAvailableVehicles([]);
      } else {
        // Creating completely new appointment
        setFormData({
          title: '',
          notes: '',
          start_time: '',
          end_time: '',
          bay: '',
          employee_id: '',
          work_order_id: '',
          customer_id: '',
          vehicle_id: '',
          status: 'Scheduled',
          reminders_email: false,
          reminders_text: false,
          reminder_email_address: '',
          reminders_phone: '',
          reminder_days_before: 1,
        });
        setAvailableVehicles([]);
      }
    }
    // Removing customers from dependency array to prevent form reset when data refreshes
  }, [open, appointment?.id, slotInfo, workOrderForNew?.id, customerForNew?.id, vehicleForNew?.id]); // Added new props and customers to dependency array

  const handleFormSubmit = (e) => { // Renamed to avoid conflict with prop onSubmit
    e.preventDefault();
    
    console.log('=== AppointmentForm: handleFormSubmit ===');
    console.log('formData being submitted:', formData);
    console.log('appointment prop (should have .id if editing):', appointment);
    console.log('appointment.id:', appointment?.id);
    
    // Validate only required fields
    if (!formData.bay) {
      alert('Bay is required');
      return;
    }
    if (!formData.employee_id) {
      alert('Technician is required');
      return;
    }
    if (!formData.start_time) {
      alert('Start date/time is required');
      return;
    }
    if (!formData.end_time) {
      alert('End date/time is required');
      return;
    }
    if (!formData.status) {
      alert('Status is required');
      return;
    }

    // Validate end time is not before start time
    if (formData.start_time && formData.end_time) {
      const startDate = new Date(formData.start_time);
      const endDate = new Date(formData.end_time);
      if (endDate <= startDate) {
        alert('End date/time must be after start date/time');
        return;
      }
    }

    // Warn if email reminder is not enabled
    if (!formData.reminders_email && !formData.reminders_text) {
      const confirmed = window.confirm('This appointment will NOT send any reminders (email or text). Do you want to continue?');
      if (!confirmed) {
        return;
      }
    }

    // Check for past reminder warning
    if (reminderInfo?.isPast) {
      const confirmed = window.confirm(
          "The reminder that has been set will be not sent because the Days Before field is set in the past. Either correct the Days Before field or manually remind the customer.\n\nDo you want to proceed anyway?"
      );
      if (!confirmed) {
          return;
      }
    }

    // Format phone number with +1 prefix if it exists
    const submissionData = { ...formData };
    if (submissionData.reminders_phone) {
      // Ensure only digits are kept and prepend +1
      const digitsOnly = submissionData.reminders_phone.replace(/[^0-9]/g, '');
      if (digitsOnly) {
          submissionData.reminders_phone = `+1${digitsOnly}`;
      }
    }

    // Adjust reminder_days_before if the reminder date falls on a weekend
    if (submissionData.start_time && (submissionData.reminders_email || submissionData.reminders_text)) {
        const startDate = new Date(submissionData.start_time);
        const daysBefore = parseInt(submissionData.reminder_days_before) || 1;
        const reminderDate = new Date(startDate);
        reminderDate.setDate(startDate.getDate() - daysBefore);
        
        const dayOfWeek = reminderDate.getDay(); // 0 = Sunday, 6 = Saturday
        
        if (dayOfWeek === 6) { // Saturday
            submissionData.reminder_days_before = daysBefore + 1; // Shift to Friday
            console.log(`Adjusting reminder from Saturday to Friday (daysBefore: ${daysBefore} -> ${daysBefore + 1})`);
        } else if (dayOfWeek === 0) { // Sunday
            submissionData.reminder_days_before = daysBefore + 2; // Shift to Friday
            console.log(`Adjusting reminder from Sunday to Friday (daysBefore: ${daysBefore} -> ${daysBefore + 2})`);
        }
    }

    console.log('Calling onSubmit with submissionData');
    onSubmit(submissionData);
  };

  const handleDelete = () => {
    if (appointment && appointment.id) {
      onDelete(appointment.id);
    }
  };

  const handleCreateCustomer = async (customerData) => {
    setIsCreatingCustomer(true);
    try {
      const newCustomer = await Customer.create(customerData);
      
      // Refresh customer and vehicle data from parent
      if (onDataRefresh) {
        await onDataRefresh();
      }
      
      // Load vehicles for the new customer
      try {
        const allVehicles = await Vehicle.list();
        const customerVehicles = allVehicles.filter(v => v.customer_id === newCustomer.id);
        setAvailableVehicles(customerVehicles || []);
      } catch (error) {
        console.error('Error loading vehicles:', error);
        setAvailableVehicles([]);
      }
      
      // Auto-select the new customer
      setFormData(prev => ({
      ...prev,
      customer_id: newCustomer.id,
      reminder_email_address: newCustomer.email || prev.reminder_email_address,
      reminders_phone: newCustomer.phone ? newCustomer.phone.replace(/[^0-9]/g, '') : '',
      vehicle_id: '',
      }));
      
      setShowAddCustomer(false);
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Failed to create customer');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleCreateVehicle = async (vehicleData) => {
    setIsCreatingVehicle(true);
    try {
      const newVehicle = await Vehicle.create(vehicleData);
      
      // Update local available vehicles list
      try {
        const allVehicles = await Vehicle.list();
        const customerVehicles = allVehicles.filter(v => v.customer_id === formData.customer_id);
        setAvailableVehicles(customerVehicles);
        
        // Auto-select the new vehicle after state update completes
        setTimeout(() => {
          setFormData(prev => ({ ...prev, vehicle_id: newVehicle.id }));
        }, 0);
      } catch (error) {
        console.error('Error loading vehicles:', error);
      }
      
      setShowAddVehicle(false);
    } catch (error) {
      console.error('Error creating vehicle:', error);
      alert('Failed to create vehicle');
    } finally {
      setIsCreatingVehicle(false);
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

  const generateWorkOrderNumbers = async (stage) => {
    // Fetch next RO number from SystemSettings
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

    const numbers = {
      ro_number: `RO${nextRo}`,
      cp_id: generateRandomString(10),
    };

    switch(stage) {
      case 'estimate':
        numbers.est_number = `EST${nextRo}`;
        break;
      case 'work_order':
        numbers.wo_number = `WO${nextRo}`;
        break;
    }

    return numbers;
  };

  const handleCreateWorkOrder = async (stage) => {
    if (!formData.customer_id || !formData.vehicle_id) {
      alert('Please select a customer and vehicle first');
      return;
    }

    try {
      const numbers = await generateWorkOrderNumbers(stage);
      
      // Get selected customer to check default taxable status
      const customer = customers?.find(c => c.id === formData.customer_id);
      
      const newWorkOrder = {
        ro_number: numbers.ro_number,
        wo_number: numbers.wo_number || '',
        est_number: numbers.est_number || '',
        inv_number: '',
        cp_id: numbers.cp_id,
        customer_id: formData.customer_id,
        vehicle_id: formData.vehicle_id,
        status: 'Open',
        priority: 'medium',
        stage: stage,
        description: 'New Work Order',
        customer_complaint: '',
        internal_notes: '',
        estimated_hours: null,
        labor_rate: 120,
        total_amount: 0,
        scheduled_date: formData.start_time ? format(new Date(formData.start_time), 'yyyy-MM-dd') : '',
        technician: '',
        line_items: '[]',
        notes_to_customer: '',
        amount_paid: 0,
        payments: '[]',
        approval: 'pending',
        est_date: stage === 'estimate' ? format(new Date(), 'yyyy-MM-dd') : null,
        wo_date: stage === 'work_order' ? format(new Date(), 'yyyy-MM-dd') : null,
        default_taxable: customer?.default_taxable || false,
      };

      const createdWO = await WorkOrder.create(newWorkOrder);
      setLocalWorkOrder(createdWO);
      
      if (onDataRefresh) {
        await onDataRefresh();
      }

      // Attach to appointment immediately
      setFormData(prev => {
        console.log('Setting work_order_id to:', createdWO.id);
        return { ...prev, work_order_id: createdWO.id };
      });
      
      // Open in new window
      const url = `/WorkOrderEdit?id=${createdWO.ro_number}`;
      window.open(url, '_blank', 'width=1600,height=1000,scrollbars=yes,resizable=yes');
    } catch (error) {
      console.error('Error creating work order:', error);
      alert('Failed to create work order: ' + error.message);
    }
  };

  // Helper functions for date/time handling
  const getDateFromISO = (isoString) => {
    if (!isoString) return null;
    return new Date(isoString);
  };

  const getHourFromISO = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return String(date.getHours());
  };

  const getMinuteFromISO = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return String(date.getMinutes()).padStart(2, '0');
  };

  const combineDateTime = (date, hour, minute) => {
    if (!date || hour === '' || minute === '') return '';
    const newDate = new Date(date);
    newDate.setHours(parseInt(hour));
    newDate.setMinutes(parseInt(minute));
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate.toISOString();
  };

  const handleDurationClick = (durationMinutes) => {
    if (!formData.start_time) return;
    
    const startDate = new Date(formData.start_time);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    
    // Cap at 5 PM (17:00)
    const fivePM = new Date(startDate);
    fivePM.setHours(17, 0, 0, 0);
    
    const finalEndDate = endDate > fivePM ? fivePM : endDate;
    
    setFormData(prev => ({ ...prev, end_time: finalEndDate.toISOString() }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{appointment ? 'Edit Appointment' : 'New Appointment'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column - Form Fields */}
              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Appointment title..."
                  />
                </div>

                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedCustomer ? getCustomerDisplayName(selectedCustomer) : ''}
                      placeholder="No customer selected"
                      readOnly
                      className="flex-1 bg-slate-50"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSelectCustomer(true)}
                    >
                      Select
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddCustomer(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Vehicle Selection */}
                <div className="space-y-2">
                  <Label>Vehicle</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.vehicle_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, vehicle_id: value }))}
                      disabled={!formData.customer_id}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select vehicle..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVehicles.map(vehicle => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddVehicle(true)}
                      disabled={!formData.customer_id}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Work Order Selection */}
                <div className="space-y-2">
                  <Label>Work Order (Optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedWorkOrder ? `${selectedWorkOrder.wo_number || selectedWorkOrder.est_number} - ${selectedWorkOrder.description}` : ''}
                      placeholder="No work order attached"
                      readOnly
                      className="flex-1 bg-slate-50"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSelectWorkOrder(true)}
                    >
                      Select
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {formData.work_order_id ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => setShowWorkPROModal(true)}
                          className="flex-1 bg-black hover:bg-slate-800 text-white"
                        >
                          Open WorkPRO
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            const url = `/WorkOrderEdit?id=${selectedWorkOrder?.ro_number}`;
                            window.open(url, '_blank', 'width=1600,height=1000,scrollbars=yes,resizable=yes');
                          }}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          Open Work Order
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          onClick={() => handleCreateWorkOrder('estimate')}
                          disabled={!formData.customer_id || !formData.vehicle_id}
                          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          Create Estimate
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleCreateWorkOrder('work_order')}
                          disabled={!formData.customer_id || !formData.vehicle_id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Create Work Order
                        </Button>
                      </>
                    )}
                  </div>
                  </div>

                {/* Bay Selection - Modern Toggle */}
                <div className="space-y-2">
                  <Label>Bay *</Label>
                  <div className="flex flex-wrap gap-2">
                    {bayOptions.map(bay => (
                      <button
                        key={bay}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, bay }))}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          formData.bay === bay
                            ? 'bg-slate-900 text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {bay}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Technician and Status - Two Columns */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Technician *</Label>
                    <Select
                      value={formData.employee_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select technician..." />
                      </SelectTrigger>
                      <SelectContent>
                        {employees && employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Scheduled">Scheduled</SelectItem>
                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                        <SelectItem value="No Show">No Show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Date and Time */}
                <div className="space-y-3">
                  {/* Start and End Date/Time on one line */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Start Date & Time */}
                    <div className="space-y-2">
                      <Label>Start Date & Time *</Label>
                      <div className="flex gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="flex-1 justify-start text-left font-normal text-xs px-2"
                            >
                              <CalendarIcon className="mr-1 h-3 w-3" />
                              {formData.start_time ? format(new Date(formData.start_time), 'EEE, MMM d') : 'Select'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={getDateFromISO(formData.start_time)}
                              onSelect={(date) => {
                                if (date) {
                                  const hour = getHourFromISO(formData.start_time) || '8';
                                  const minute = getMinuteFromISO(formData.start_time) || '00';
                                  setFormData(prev => ({ ...prev, start_time: combineDateTime(date, hour, minute) }));
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Select
                          value={getHourFromISO(formData.start_time)}
                          onValueChange={(hour) => {
                            const date = getDateFromISO(formData.start_time) || new Date();
                            const minute = getMinuteFromISO(formData.start_time) || '00';
                            setFormData(prev => ({ ...prev, start_time: combineDateTime(date, hour, minute) }));
                          }}
                        >
                          <SelectTrigger className="w-14">
                            <SelectValue placeholder="Hr" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 10 }, (_, i) => i + 8).map(hour => (
                              <SelectItem key={hour} value={String(hour)}>
                                {hour}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={getMinuteFromISO(formData.start_time)}
                          onValueChange={(minute) => {
                            const date = getDateFromISO(formData.start_time) || new Date();
                            const hour = getHourFromISO(formData.start_time) || '8';
                            setFormData(prev => ({ ...prev, start_time: combineDateTime(date, hour, minute) }));
                          }}
                        >
                          <SelectTrigger className="w-14">
                            <SelectValue placeholder="Min" />
                          </SelectTrigger>
                          <SelectContent>
                            {['00', '15', '30', '45'].map(minute => (
                              <SelectItem key={minute} value={minute}>
                                {minute}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* End Date & Time */}
                    <div className="space-y-2">
                      <Label>End Date & Time *</Label>
                      <div className="flex gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="flex-1 justify-start text-left font-normal text-xs px-2"
                            >
                              <CalendarIcon className="mr-1 h-3 w-3" />
                              {formData.end_time ? format(new Date(formData.end_time), 'EEE, MMM d') : 'Select'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={getDateFromISO(formData.end_time)}
                              onSelect={(date) => {
                                if (date) {
                                  const hour = getHourFromISO(formData.end_time) || '17';
                                  const minute = getMinuteFromISO(formData.end_time) || '00';
                                  setFormData(prev => ({ ...prev, end_time: combineDateTime(date, hour, minute) }));
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Select
                          value={getHourFromISO(formData.end_time)}
                          onValueChange={(hour) => {
                            const date = getDateFromISO(formData.end_time) || new Date();
                            const minute = getMinuteFromISO(formData.end_time) || '00';
                            setFormData(prev => ({ ...prev, end_time: combineDateTime(date, hour, minute) }));
                          }}
                        >
                          <SelectTrigger className="w-14">
                            <SelectValue placeholder="Hr" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 10 }, (_, i) => i + 8).map(hour => (
                              <SelectItem key={hour} value={String(hour)}>
                                {hour}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={getMinuteFromISO(formData.end_time)}
                          onValueChange={(minute) => {
                            const date = getDateFromISO(formData.end_time) || new Date();
                            const hour = getHourFromISO(formData.end_time) || '8';
                            setFormData(prev => ({ ...prev, end_time: combineDateTime(date, hour, minute) }));
                          }}
                        >
                          <SelectTrigger className="w-14">
                            <SelectValue placeholder="Min" />
                          </SelectTrigger>
                          <SelectContent>
                            {['00', '15', '30', '45'].map(minute => (
                              <SelectItem key={minute} value={minute}>
                                {minute}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  
                  {/* Duration Links Below */}
                  <div className="flex gap-3 text-sm text-blue-600">
                    <button type="button" onClick={() => handleDurationClick(30)} className="hover:underline">30min</button>
                    <button type="button" onClick={() => handleDurationClick(60)} className="hover:underline">1hr</button>
                    <button type="button" onClick={() => handleDurationClick(120)} className="hover:underline">2hr</button>
                    <button type="button" onClick={() => handleDurationClick(240)} className="hover:underline">Half Day (4hrs)</button>
                    <button type="button" onClick={() => handleDurationClick(480)} className="hover:underline">Full Day (8hrs)</button>
                  </div>
                </div>
              </div>

              {/* Right Column - Notes and Reminders */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any notes about this appointment..."
                    className="resize-none h-[310px]"
                  />
                </div>

                {/* Reminders Section */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-base font-semibold">Reminders</Label>
                  
                  {/* Email Reminder */}
                  <div className="flex items-center space-x-2 h-10">
                    <Checkbox
                      id="reminders_email"
                      checked={formData.reminders_email}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, reminders_email: checked }))}
                    />
                    <Label htmlFor="reminders_email" className="font-normal cursor-pointer whitespace-nowrap min-w-[130px]">
                      Send email reminder:
                    </Label>
                    {formData.reminders_email && (
                      <Input
                        id="reminder_email"
                        type="email"
                        value={formData.reminder_email_address}
                        onChange={(e) => setFormData(prev => ({ ...prev, reminder_email_address: e.target.value }))}
                        placeholder="customer@example.com"
                        className="h-8 flex-1"
                      />
                    )}
                  </div>

                  {/* Text Reminder */}
                  <div className="flex items-center space-x-2 h-10">
                    <Checkbox
                      id="reminders_text"
                      checked={formData.reminders_text}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, reminders_text: checked }))}
                    />
                    <Label htmlFor="reminders_text" className="font-normal cursor-pointer whitespace-nowrap min-w-[130px]">
                      Send text reminder:
                    </Label>
                    {formData.reminders_text && (
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-sm text-slate-500 font-medium">+1</span>
                        <Input
                          id="reminders_phone"
                          value={formData.reminders_phone}
                          onChange={(e) => {
                            // Only allow numbers
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setFormData(prev => ({ ...prev, reminders_phone: val }));
                          }}
                          placeholder="5551234567"
                          className="h-8 flex-1"
                          maxLength={10}
                        />
                      </div>
                    )}
                  </div>

                  {(formData.reminders_email || formData.reminders_text) && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center space-x-2 h-10">
                        <Label htmlFor="reminder_days" className="font-normal whitespace-nowrap min-w-[154px]">
                          Days before appointment:
                        </Label>
                        <Input
                          id="reminder_days"
                          type="number"
                          min="0"
                          value={formData.reminder_days_before}
                          onChange={(e) => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) || 0 }))}
                          className="h-8 w-20"
                        />
                        {reminderInfo && (
                          <div className="flex items-center gap-2 ml-2">
                            <span className="text-sm text-gray-500">Send Date:</span>
                            <Input 
                              readOnly 
                              value={reminderInfo.displayDate} 
                              className={`h-8 w-40 ${reminderInfo.isPast ? 'text-red-600 border-red-300 bg-red-50' : 'bg-gray-50'}`}
                            />
                          </div>
                        )}
                      </div>
                      {reminderInfo?.isPast && (
                        <div className="flex items-start gap-2 p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <p>
                            The reminder that has been set will be not sent because the Days Before field is set in the past. Either correct the Days Before field or manually remind the customer.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center">
              {appointment && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">
                  {appointment ? 'Update' : 'Create'} Appointment
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Select Customer Modal */}
      <SelectCustomerModal
        open={showSelectCustomer}
        onClose={() => setShowSelectCustomer(false)}
        customers={customers}
        onSelect={(customer) => {
          handleCustomerSelect(customer.id);
          setShowSelectCustomer(false);
        }}
      />

      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            onSubmit={handleCreateCustomer}
            onCancel={() => setShowAddCustomer(false)}
            isSubmitting={isCreatingCustomer}
          />
        </DialogContent>
      </Dialog>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicle} onOpenChange={(open) => {
        setShowAddVehicle(open);
        // Don't clear customer when closing the dialog
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add New Vehicle</DialogTitle>
          </DialogHeader>
          <VehicleForm
            customers={customers}
            vehicle={{ customer_id: formData.customer_id }}
            onSubmit={handleCreateVehicle}
            onCancel={() => setShowAddVehicle(false)}
            isSubmitting={isCreatingVehicle}
          />
        </DialogContent>
      </Dialog>

      {/* Select Work Order Modal */}
      <SelectWorkOrderModal
        open={showSelectWorkOrder}
        onClose={() => setShowSelectWorkOrder(false)}
        workOrders={workOrders?.filter(wo => wo.stage === 'estimate' || wo.stage === 'work_order')}
        customers={customers}
        onSelect={(workOrder) => {
          handleWorkOrderSelect(workOrder);
          setShowSelectWorkOrder(false);
        }}
      />

      {/* WorkPRO Modal */}
      <WorkPROModal 
        open={showWorkPROModal}
        onClose={() => setShowWorkPROModal(false)}
        workOrder={selectedWorkOrder}
        customer={selectedCustomer}
        customers={customers}
        vehicles={availableVehicles}
      />
      </>
      );
      }