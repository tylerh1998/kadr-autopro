import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Appointment, Employee } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import AppointmentForm from '../appointments/AppointmentForm';
import CustomCalendar from '../appointments/CustomCalendar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const SchedulerViaWoModal = ({ open, onClose, workOrder, customer, vehicle, onAppointmentUpdated }) => {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]); // NEW state for all customers
  const [allVehicles, setAllVehicles] = useState([]); // NEW state for all vehicles
  const [loading, setLoading] = useState(true);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [slotInfo, setSlotInfo] = useState(null);

  const bayColors = {
    'Bay 1': '#3B82F6', 'Bay 2': '#10B981', 'Bay 3': '#F59E0B', 
    'Alignment Rack': '#8B5CF6', 'Mobile': '#EF4444',
  };

  const [techColors, setTechColors] = useState({});

  const generateTechColors = (techs) => {
    const colors = [
      '#DC2626', '#059669', '#7C3AED', '#EA580C', '#0284C7',
      '#DB2777', '#65A30D', '#0891B2', '#7C2D12', '#4338CA',
    ];
    const colorMap = {};
    techs.forEach((tech, index) => {
      colorMap[tech.id] = colors[index % colors.length];
    });
    return colorMap;
  };

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
      const [allAppointments, employeesData, custRes, vehRes] = await Promise.all([
        Appointment.list(),
        Employee.filter({ position: ['technician', 'apprentice'] }),
        base44.functions.invoke('supabaseCustomer', { action: 'list' }),
        base44.functions.invoke('supabaseVehicle', { action: 'list' }),
      ]);
      
      const customersList = custRes.data?.data || [];
      if (customer && !customersList.some(c => c.id === customer.id)) {
        customersList.push(customer);
      }
      const vehiclesList = vehRes.data?.data || [];
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
      setTechColors(generateTechColors(employeesData));
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
        await Appointment.update(selectedAppointment.id, dataToSave);
      } else {
        await Appointment.create(dataToSave);
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
      await Appointment.delete(id);

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
      await Appointment.delete(appointmentId);
      loadData();
    }
  };
  
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-4 dark:bg-slate-950 dark:border-slate-800">
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
            <div className="h-full flex flex-col p-4">
                <Button 
                    className="mb-4 self-start"
                    onClick={() => {
                        setSelectedAppointment(null);
                        setSlotInfo({ start: new Date(), end: new Date(Date.now() + 3600000) });
                        setShowAppointmentForm(true);
                    }}
                >
                    <Plus className="w-4 h-4 mr-2" /> New Appointment
                </Button>
              <CustomCalendar
                events={events}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                loading={loading}
                employees={employees}
                bayColors={bayColors}
                techColors={techColors}
                onOpenWorkOrder={handleOpenWorkOrder}
                onDeleteAppointment={handleDeleteAppointment}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SchedulerViaWoModal;