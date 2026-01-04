import React, { useState, useEffect, useCallback } from 'react';
import { Appointment, Employee, WorkOrder, Customer, Vehicle } from '@/entities/all';
import AppointmentForm from '../components/appointments/AppointmentForm';
import CustomCalendar from '../components/appointments/CustomCalendar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SchedulePage() {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [slotInfo, setSlotInfo] = useState(null);
  const [techColors, setTechColors] = useState({});

  const location = useLocation();
  const navigate = useNavigate();

  // Color mappings
  const bayColors = {
    'Bay 1': '#3B82F6', // Blue
    'Bay 2': '#10B981', // Green
    'Bay 3': '#F59E0B', // Amber
    'Alignment Rack': '#8B5CF6', // Purple
    'Mobile': '#EF4444', // Red
  };

  // Generate tech colors dynamically with more distinct, vibrant colors
  const generateTechColors = (techs) => {
    const colors = [
      '#DC2626', // Red
      '#059669', // Emerald  
      '#7C3AED', // Violet
      '#EA580C', // Orange
      '#0284C7', // Sky Blue
      '#DB2777', // Pink
      '#65A30D', // Lime
      '#0891B2', // Cyan
      '#7C2D12', // Brown
      '#4338CA', // Indigo
      '#BE185D', // Rose
      '#166534', // Dark Green
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

  const loadCustomersAndVehicles = useCallback(async () => {
    const [customersData, vehiclesData, workOrdersData] = await Promise.all([
      Customer.list(),
      Vehicle.list(),
      WorkOrder.list(),
    ]);
    setCustomers(customersData);
    setVehicles(vehiclesData);
    setWorkOrders(workOrdersData);
  }, []);

  const loadData = useCallback(async (appointmentIdToSelect = null) => {
    setLoading(true);
    try {
      const [appointmentsData, employeesData, workOrdersData, customersData, vehiclesData] = await Promise.all([
        Appointment.list(),
        Employee.list(),
        WorkOrder.list(),
        Customer.list(),
        Vehicle.list(),
      ]);

      const techMap = new Map(employeesData.map(e => [e.id, e]));
      const workOrderMap = new Map(workOrdersData.map(wo => [wo.id, wo]));
      const customerMap = new Map(customersData.map(c => [c.id, c]));

      const formattedEvents = appointmentsData.map(app => {
        const workOrder = workOrderMap.get(app.work_order_id);
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
          workOrder: workOrder,
          customer: customer,
          displayTitle: displayTitle,
        };
      });

      const availableTechs = employeesData.filter(e => e.position === 'technician' || e.position === 'apprentice');
      const generatedTechColors = generateTechColors(availableTechs);
      setTechColors(generatedTechColors);

      setEvents(formattedEvents);
      setEmployees(availableTechs);
      setWorkOrders(workOrdersData);
      setCustomers(customersData);
      setVehicles(vehiclesData);

      if (appointmentIdToSelect) {
        const appointmentToEdit = formattedEvents.find(e => e.id === appointmentIdToSelect);
        if (appointmentToEdit) {
          setSelectedAppointment(appointmentToEdit);
          setShowModal(true);
        }
      }
    } catch (error) {
      console.error('Error loading schedule data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const id = params.get('id');

    if (action === 'create') {
      setShowModal(true);
      loadData();
      navigate(location.pathname, { replace: true });
    } else if (action === 'edit' && id) {
      loadData(id);
      navigate(location.pathname, { replace: true });
    } else {
      loadData();
    }
  }, [location.search, navigate, loadData, location.pathname]);

  const handleSelectSlot = useCallback((slot) => {
    setSelectedAppointment(null); // Clear any selected appointment
    setSlotInfo(slot);
    setShowModal(true);
  }, []);

  const handleSelectEvent = useCallback((event) => {
    setSelectedAppointment(event);
    setSlotInfo(null); // Clear slot info when selecting an event
    setShowModal(true);
  }, []);

  const handleEventDrop = useCallback(async (event, newSlot) => {
    try {
      console.log('Updating appointment:', event.id);
      console.log('New slot:', newSlot);
      
      // Optimistically update the UI first
      setEvents(prevEvents => 
        prevEvents.map(e => {
          if (e.id === event.id) {
            const updatedEvent = {
              ...e,
              start: new Date(newSlot.start),
              end: new Date(newSlot.end),
              start_time: newSlot.start.toISOString(),
              end_time: newSlot.end.toISOString(),
            };

            // Update bay if provided
            if (newSlot.bay) {
              updatedEvent.bay = newSlot.bay;
            }

            // Update employee if provided
            if (newSlot.employee_id) {
              updatedEvent.employee_id = newSlot.employee_id;
              updatedEvent.tech = employees.find(emp => emp.id === newSlot.employee_id);
            }

            return updatedEvent;
          }
          return e;
        })
      );

      // Then update the backend
      const updatedAppointment = { 
        start_time: newSlot.start.toISOString(), 
        end_time: newSlot.end.toISOString() 
      };

      // Update bay if provided
      if (newSlot.bay) {
        updatedAppointment.bay = newSlot.bay;
      }

      // Update employee if provided
      if (newSlot.employee_id) {
        updatedAppointment.employee_id = newSlot.employee_id;
      }

      await Appointment.update(event.id, updatedAppointment);
      
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Failed to move appointment. Please try again.');
      // Reload data to revert the optimistic update
      loadData();
    }
  }, [employees, loadData]);

  const checkForConflicts = (formData, excludeAppointmentId = null) => {
    const newStart = new Date(formData.start_time);
    const newEnd = new Date(formData.end_time);
    const newBay = formData.bay;
    const newDate = newStart.toDateString(); // Get just the date portion

    // Find conflicting appointments (same bay, same date, overlapping time)
    const conflicts = events.filter(event => {
      // Exclude the current appointment if editing
      if (excludeAppointmentId && event.id === excludeAppointmentId) {
        return false;
      }

      // Check if same bay
      if (event.bay !== newBay) {
        return false;
      }

      // Check if same date
      const eventDate = event.start.toDateString();
      if (eventDate !== newDate) {
        return false;
      }

      // Use the Date objects (start/end) that are set during loadData
      const eventStart = event.start;
      const eventEnd = event.end;
      
      // Overlap exists if new appointment starts before existing ends AND new ends after existing starts
      // This catches: partial overlap at start, partial overlap at end, complete overlap, and contained within
      const hasOverlap = newStart < eventEnd && newEnd > eventStart;
      
      return hasOverlap;
    });

    return conflicts;
  };

  const handleSubmit = async (formData) => {
    try {
      // Check for conflicts
      const conflicts = checkForConflicts(formData, selectedAppointment?.id);
      
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
          return; // User cancelled, don't save
        }
      }

      if (selectedAppointment) {
        await Appointment.update(selectedAppointment.id, formData);
      } else {
        await Appointment.create(formData);
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving appointment:', error);
      alert('Failed to save appointment.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      try {
        await Appointment.delete(id);
        setShowModal(false);
        loadData();
      } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment.');
      }
    }
  };
  
  const handleOpenWorkOrder = (roNumber) => {
    if (roNumber) {
      const url = createPageUrl(`WorkOrderEdit?id=${roNumber}`);
      window.open(url, '_blank', 'width=1600,height=1000,scrollbars=yes,resizable=yes');
    }
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      try {
        await Appointment.delete(appointmentId);
        loadData();
      } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment.');
      }
    }
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Scheduling</h1>
          <div className="flex items-center gap-4">
            <Button onClick={() => {
              setSelectedAppointment(null); // Clear selected appointment
              setSlotInfo(null); // Clear slot info
              setShowModal(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </header>

        <AppointmentForm
          open={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedAppointment(null); // Clear on close
            setSlotInfo(null); // Clear on close
          }}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          appointment={selectedAppointment}
          slotInfo={slotInfo}
          employees={employees}
          workOrders={workOrders}
          customers={customers}
          vehicles={vehicles}
          onDataRefresh={loadCustomersAndVehicles}
        />

        <CustomCalendar
          events={events}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          loading={loading}
          onOpenWorkOrder={handleOpenWorkOrder}
          onDeleteAppointment={handleDeleteAppointment}
          bayColors={bayColors}
          techColors={techColors}
          employees={employees}
        />
      </div>
    </div>
  );
}