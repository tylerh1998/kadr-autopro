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
import { Trash2, Plus, Search, Calendar as CalendarIcon } from 'lucide-react';

import SelectCustomerModal from './SelectCustomerModal';
import SelectWorkOrderModal from './SelectWorkOrderModal';
import CustomerForm from '../customers/CustomerForm';
import VehicleForm from '../vehicles/VehicleForm';
import { Customer, Vehicle, WorkOrder } from '@/entities/all';

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
  const [showSelectCustomer, setShowSelectCustomer] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showSelectWorkOrder, setShowSelectWorkOrder] = useState(false);

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
  const selectedWorkOrder = workOrders?.find(wo => wo.id === formData.work_order_id);

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
        reminder_email_address: ''
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
            reminder_email_address: customer?.email || prev.reminder_email_address // Set email address here, or keep previous
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
        reminder_email_address: '' // Clear email
      }));
      setAvailableVehicles([]);
    }
  }, [customers]); // Depend on customers to find the correct email


  // Reset form when modal opens/closes or appointment changes
  useEffect(() => {
    console.log('=== AppointmentForm: useEffect triggered ===');
    console.log('open:', open);
    console.log('appointment prop:', appointment);
    console.log('appointment.id:', appointment?.id);
    console.log('slotInfo:', slotInfo);
    console.log('workOrderForNew:', workOrderForNew);
    console.log('customerForNew:', customerForNew);
    console.log('vehicleForNew:', vehicleForNew);
    
    if (open) {
      if (appointment) {
        console.log('AppointmentForm: EDITING MODE - appointment.id exists:', appointment.id);
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

          // Then set form data - wrapped in setTimeout to ensure state updates complete
          setTimeout(() => {
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
              reminder_days_before: appointment.reminder_days_before || 1,
            });
          }, 100);
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

          // Get customer for email
          const customer = customers?.find(c => c.id === customerId);

          // Set form data with pre-filled information
          setTimeout(() => {
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
              reminder_days_before: 1,
            });
          }, 100);
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
          reminder_days_before: 1,
        });
        setAvailableVehicles([]);
      }
    }
  }, [open, appointment, slotInfo, workOrderForNew, customerForNew, vehicleForNew, customers]); // Added new props and customers to dependency array

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
    
    console.log('Calling onSubmit with formData');
    onSubmit(formData);
  };

  const handleDelete = () => {
    if (appointment && appointment.id) {
      onDelete(appointment.id);
    }
  };

  const handleCreateCustomer = async (customerData) => {
    try {
      const newCustomer = await Customer.create(customerData);
      // Refresh customer and vehicle data from parent
      if (onDataRefresh) {
        await onDataRefresh();
      }
      // Now select the customer with fresh data
      await handleCustomerSelect(newCustomer.id); 
      setShowAddCustomer(false);
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Failed to create customer');
    }
  };

  const handleCreateVehicle = async (vehicleData) => {
    try {
      const newVehicle = await Vehicle.create(vehicleData);
      // Refresh customer and vehicle data from parent
      if (onDataRefresh) {
        await onDataRefresh();
      }
      // Refresh available vehicles for the current customer with fresh data
      const allVehicles = vehicles || await Vehicle.list();
      const customerVehicles = allVehicles.filter(v => v.customer_id === formData.customer_id);
      setAvailableVehicles(customerVehicles);
      // Select the new vehicle
      setFormData(prev => ({ ...prev, vehicle_id: newVehicle.id }));
      setShowAddVehicle(false);
    } catch (error) {
      console.error('Error creating vehicle:', error);
      alert('Failed to create vehicle');
    }
  };

  const generateWorkOrderNumbers = (stage) => {
    const now = new Date();
    const timestamp = now.getTime().toString().slice(-6);
    const randomString = Math.random().toString(36).substring(2, 12).toUpperCase();

    const numbers = {
      ro_number: `RO${timestamp}`,
      cp_id: randomString,
    };

    if (stage === 'estimate') {
      numbers.est_number = `EST${timestamp}`;
    } else if (stage === 'work_order') {
      numbers.wo_number = `WO${timestamp}`;
    }

    return numbers;
  };

  const handleCreateWorkOrder = async (stage) => {
    if (!formData.customer_id || !formData.vehicle_id) {
      alert('Please select a customer and vehicle first');
      return;
    }

    try {
      const numbers = generateWorkOrderNumbers(stage);
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
      };

      const createdWO = await WorkOrder.create(newWorkOrder);
      
      // Attach to appointment
      setFormData(prev => ({ ...prev, work_order_id: createdWO.id }));
      
      // Open in new window
      const url = `/WorkOrderEdit?id=${createdWO.ro_number}`;
      window.open(url, '_blank', 'width=1600,height=1000,scrollbars=yes,resizable=yes');
    } catch (error) {
      console.error('Error creating work order:', error);
      alert('Failed to create work order');
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCreateWorkOrder('estimate')}
                      disabled={!formData.customer_id || !formData.vehicle_id || !!formData.work_order_id}
                      className="flex-1"
                    >
                      Create Estimate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCreateWorkOrder('work_order')}
                      disabled={!formData.customer_id || !formData.vehicle_id || !!formData.work_order_id}
                      className="flex-1"
                    >
                      Create Work Order
                    </Button>
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
                <div className="space-y-4">
                  {/* Start Date & Time */}
                  <div className="space-y-2">
                    <Label>Start Date & Time *</Label>
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex-1 justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.start_time ? format(new Date(formData.start_time), 'EEE, MMM d, yyyy') : 'Select date'}
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
                        <SelectTrigger className="w-20">
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
                        <SelectTrigger className="w-20">
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
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex-1 justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.end_time ? format(new Date(formData.end_time), 'EEE, MMM d, yyyy') : 'Select date'}
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
                        <SelectTrigger className="w-20">
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
                        <SelectTrigger className="w-20">
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
                    <div className="flex gap-3 text-sm text-blue-600 mt-2">
                      <button type="button" onClick={() => handleDurationClick(30)} className="hover:underline">30min</button>
                      <button type="button" onClick={() => handleDurationClick(60)} className="hover:underline">1hr</button>
                      <button type="button" onClick={() => handleDurationClick(120)} className="hover:underline">2hr</button>
                      <button type="button" onClick={() => handleDurationClick(240)} className="hover:underline">Half Day (4hrs)</button>
                      <button type="button" onClick={() => handleDurationClick(480)} className="hover:underline">Full Day (8hrs)</button>
                    </div>
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
                    className="resize-none h-[380px]"
                  />
                </div>

                {/* Reminders Section */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-base font-semibold">Reminders</Label>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reminders_email"
                      checked={formData.reminders_email}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, reminders_email: checked }))}
                    />
                    <Label htmlFor="reminders_email" className="font-normal cursor-pointer">
                      Send email reminder
                    </Label>
                  </div>

                  {formData.reminders_email && (
                    <div className="space-y-2">
                      <Label htmlFor="reminder_email">Email Address</Label>
                      <Input
                        id="reminder_email"
                        type="email"
                        value={formData.reminder_email_address}
                        onChange={(e) => setFormData(prev => ({ ...prev, reminder_email_address: e.target.value }))}
                        placeholder="customer@example.com"
                      />
                    </div>
                  )}

                  {/* Text reminders disabled - feature planned for post-release */}
                  <div className="flex items-center space-x-2 opacity-50">
                    <Checkbox
                      id="reminders_text"
                      checked={false}
                      disabled
                    />
                    <Label htmlFor="reminders_text" className="font-normal cursor-not-allowed">
                      Send text reminder <span className="text-xs text-slate-500 italic">(Coming soon)</span>
                    </Label>
                  </div>

                  {(formData.reminders_email || formData.reminders_text) && (
                    <div className="space-y-2">
                      <Label htmlFor="reminder_days">Days before appointment</Label>
                      <Input
                        id="reminder_days"
                        type="number"
                        min="0"
                        value={formData.reminder_days_before}
                        onChange={(e) => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) || 1 }))}
                      />
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
          />
        </DialogContent>
      </Dialog>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add New Vehicle</DialogTitle>
          </DialogHeader>
          <VehicleForm
            customers={customers}
            vehicle={{ customer_id: formData.customer_id }}
            onSubmit={handleCreateVehicle}
            onCancel={() => setShowAddVehicle(false)}
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
    </>
  );
}