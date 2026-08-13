import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import AppointmentForm from '../appointments/AppointmentForm';
import CustomCalendar from '../appointments/CustomCalendar';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

const SchedulerViaWoModal = ({ open, onClose, workOrder, customer, vehicle, onAppointmentUpdated }) => {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]); // NEW state for all customers
  const [allVehicles, setAllVehicles] = useState([]); // NEW state for all vehicles
  const [loading, setLoading] = useState(true);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [slotInfo, setSlotInfo] = useState(null);

  // Helper function to get customer display name
  const getCustomerDisplayName = (customer) => {
    if (!customer) return 'Unknown Customer';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
  };

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [allAppointmentsRes, employeesDataRes, custRes, vehRes] = await Promise.all([
        supabase.from('Appointment').select('*'),
        supabase.from('Employee').select('*').in('position', ['technician', 'apprentice']),
        supabase.from('Customer').select('*'),
        supabase.from('Vehicle').select('*'),
      ]);
      
      const allAppointments = allAppointmentsRes.data || [];
      const employeesData = employeesDataRes.data || [];
      const customersList = custRes.data || [];
      if (customer && !customersList.some(c => c.id === customer.id)) {
        customersList.push(customer);
      }
      const vehiclesList = vehRes.data || [];
      if (vehicle && !vehiclesList.some(v => v.id === vehicle.id)) {
        vehiclesList.push(vehicle);
      }
      
      const techMap = new Map(employeesData.map(e => [e.id, e]));
      const customerMap = new Map(customersList.map(c => [c.id, c]));
      
      const formattedEvents = allAppointments.map(app => {
        const customer = customerMap.get(app.customer_id);
        
        let displayTitle = '';
        if (customer) {
          displayTitle = getCustomerDisplayName(customer);
        } else if (app.notes) {
          const firstLine = app.notes.split('\n')[0];
          displayTitle = firstLine.length > 30 ? firstLine.substring(0, 27) + '...' : firstLine;
        } else {
          displayTitle = 'Appointment';
        }

        return {
          ...app,
          start: new Date(app.start_time),
          end: new Date(app.end_time),
          tech: techMap.get(app.employee_id),
          displayTitle: displayTitle,
          customer: customer
        };
      });

      setEvents(formattedEvents);
      setEmployees(employeesData);
      setAllCustomers(customersList); // NEW: Set customers state
      setAllVehicles(vehiclesList); // NEW: Set vehicles state
    } catch (error) {
      console.error('Error loading schedule data in modal:', error);
    } finally {
      setLoading(false);
    }
  }, [open, customer, vehicle, workOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectEvent = (event) => {
    // Convert calendar event format to appointment format
    // The event has 'start' and 'end' as Date objects, but we need 'start_time' and 'end_time' as ISO strings
    const appointmentData = {
      ...event,
      start_time: event.start_time || event.start?.toISOString(),
      end_time: event.end_time || event.end?.toISOString(),
    };
    setSelectedAppointment(appointmentData);
    setSlotInfo(null);
    setShowAppointmentForm(true);
  };

  const handleSelectSlot = (slot) => {
    setSelectedAppointment(null);
    setSlotInfo(slot);
    setShowAppointmentForm(true);
  };

  const checkForConflicts = (formData, excludeAppointmentId = null) => {
    const newStart = new Date(formData.start_time);
    const newEnd = new Date(formData.end_time);
    const newBay = formData.bay;
    const newDate = newStart.toDateString();

    const conflicts = events.filter(event => {
      if (excludeAppointmentId && event.id === excludeAppointmentId) {
        return false;
      }
      if (event.bay !== newBay) {
        return false;
      }
      const eventDate = event.start.toDateString();
      if (eventDate !== newDate) {
        return false;
      }
      const hasOverlap = newStart < event.end && newEnd > event.start;
      return hasOverlap;
    });

    return conflicts;
  };

  const handleSave = async (appointmentData) => {
    try {
      // Check for conflicts
      const conflicts = checkForConflicts(appointmentData, selectedAppointment?.id);
      
      if (conflicts.length > 0) {
        const conflictDetails = conflicts.map(c => {
          const customerName = c.displayTitle || 'Appointment';
          const startTime = c.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endTime = c.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `• ${customerName} (${startTime} - ${endTime})`;
        }).join('\n');

        const confirmed = window.confirm(
          `⚠️ Scheduling Conflict Warning\n\nThis appointment overlaps with the following appointment(s) in the same bay:\n\n${conflictDetails}\n\nDo you want to proceed anyway?`
        );

        if (!confirmed) {
          return;
        }
      }

      // For new appointments, link to the current work order/customer/vehicle
      // For edits, preserve the existing appointment's data from the form
      const isEditing = selectedAppointment && selectedAppointment.id;
      
      let dataToSave;
      if (isEditing) {
        // When editing, just use what the form provides (it already has the correct IDs)
        dataToSave = { ...appointmentData };
      } else {
        // When creating new, link to the current WO context
        dataToSave = { 
          ...appointmentData, 
          work_order_id: workOrder?.id, 
          customer_id: customer?.id, 
          vehicle_id: vehicle?.id 
        };
      }
      
      if (isEditing) {
        const { error } = await supabase.from('Appointment').update(dataToSave).eq('id', selectedAppointment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('Appointment').insert([dataToSave]);
        if (error) throw error;
      }
      
      // Hide the form
      setShowAppointmentForm(false);
      setSelectedAppointment(null);
      setSlotInfo(null);
      
      // Notify parent component to refetch data and close the modal
      if (onAppointmentUpdated) {
        onAppointmentUpdated();
      }
      
      // Close the parent modal
      onClose();

    } catch (error) {
      console.error("Error saving appointment in modal:", error);
      alert("Failed to save appointment.");
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('Appointment').delete().eq('id', id);
      if (error) throw error;

      // Hide the form
      setShowAppointmentForm(false);
      setSelectedAppointment(null);
      setSlotInfo(null);
      
      // Notify parent component to refetch data and close the modal
      if (onAppointmentUpdated) {
        onAppointmentUpdated();
      }
      
      // Close the parent modal
      onClose();

    } catch (error) {
      console.error("Error deleting appointment in modal:", error);
      alert("Failed to delete appointment.");
    }
  };

  const handleOpenWorkOrder = (workOrderId) => {
    if (workOrderId) {
      window.open(`/WorkOrderEdit?id=${workOrderId}`, '_blank');
    }
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      const { error } = await supabase.from('Appointment').delete().eq('id', appointmentId);
      if (error) {
        console.error("Error deleting appointment:", error);
        alert("Failed to delete appointment.");
        return;
      }
      loadData();
    }
  };
  
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-6 rounded-xl dark:bg-slate-950 dark:border-slate-800 [&>button]:hidden overflow-hidden">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 bg-red-600 hover:bg-red-700 text-white rounded p-1.5 transition-colors focus:outline-none z-50 flex items-center justify-center shadow-md border border-red-500"
          aria-label="Close scheduler"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader>
          <DialogTitle>Schedule for WO #{workOrder?.wo_number}</DialogTitle>
          <DialogDescription>
            Manage appointments for {customer?.first_name} {customer?.last_name}'s {vehicle?.make} {vehicle?.model}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow min-h-0 overflow-y-auto">
          {showAppointmentForm ? (
            <div className="p-4">
                <AppointmentForm
                  isModal={false}
                  open={true}
                  onClose={() => setShowAppointmentForm(false)}
                  onSubmit={handleSave}
                  onDelete={handleDelete}
                  appointment={selectedAppointment}
                  slotInfo={selectedAppointment ? null : slotInfo}
                  employees={employees}
                  workOrders={[workOrder]}
                  workOrderForNew={workOrder}
                  customerForNew={customer}
                  vehicleForNew={vehicle}
                  customers={allCustomers}
                  vehicles={allVehicles}
                />
            </div>
          ) : (
            <div className="h-full flex flex-col py-2">
              <CustomCalendar
                events={events}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                loading={loading}
                employees={employees}
                onOpenWorkOrder={handleOpenWorkOrder}
                onDeleteAppointment={handleDeleteAppointment}
                onNewAppointment={() => {
                  setSelectedAppointment(null);
                  setSlotInfo({ start: new Date(), end: new Date(Date.now() + 3600000) });
                  setShowAppointmentForm(true);
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SchedulerViaWoModal;