import React, { useState, useEffect, useCallback } from 'react';
import { getworkorderlist } from '@/functions/getworkorderlist';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import AppointmentForm from '../components/appointments/AppointmentForm';
import CustomCalendar from '../components/appointments/CustomCalendar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SchedulePage() {
  const { employee: currentEmployee } = useAuth();
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
    'Main Floor': '#3B82F6', // Blue
    'Main Hoist': '#10B981', // Green
    'North Floor': '#06b6d4', // Cyan
    'North Hoist': '#F59E0B', // Amber
    'Other': '#EF4444', // Red
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
    const [custRes, vehRes, workOrdersResponse] = await Promise.all([
      supabase.from('Customer').select('*').order('org_name', { ascending: true }),
      supabase.from('Vehicle').select('*').order('year', { ascending: false }),
      getworkorderlist({}),
    ]);
    const workOrdersData = workOrdersResponse?.data?.data || [];
    setCustomers(custRes.data || []);
    setVehicles(vehRes.data || []);
    setWorkOrders(workOrdersData);
  }, []);

  const loadData = useCallback(async (appointmentIdToSelect = null) => {
    setLoading(true);
    try {
      const [apptRes, empRes, workOrdersResponse, custRes, vehRes] = await Promise.all([
        supabase.from('Appointment').select('*'),
        supabase.from('Employee').select('*'),
        getworkorderlist({}),
        supabase.from('Customer').select('*').order('org_name', { ascending: true }),
        supabase.from('Vehicle').select('*').order('year', { ascending: false }),
      ]);
      if (apptRes.error) throw apptRes.error;
      if (empRes.error) throw empRes.error;
      const appointmentsData = apptRes.data || [];
      const employeesData = empRes.data || [];
      const workOrdersData = workOrdersResponse?.data?.data || [];
      const customersList = custRes.data || [];
      const vehiclesList = vehRes.data || [];

      const techMap = new Map(employeesData.map(e => [e.id, e]));
      const workOrderMap = new Map(workOrdersData.map(wo => [wo.id, wo]));
      const customerMap = new Map(customersList.map(c => [c.id, c]));

      // Fetch missing work orders that were excluded due to query limits
      const missingWoIds = [...new Set(appointmentsData.map(app => app.work_order_id).filter(id => id && !workOrderMap.has(id)))];
      if (missingWoIds.length > 0) {
        try {
          const missingWoPromises = missingWoIds.map(id => getworkorderlist({ match: { id } }));
          const missingResponses = await Promise.all(missingWoPromises);
          
          missingResponses.forEach(res => {
            if (res?.data?.data && res.data.data.length > 0) {
              const wo = res.data.data[0];
              workOrdersData.push(wo);
              workOrderMap.set(wo.id, wo);
              
              // Add customer/vehicle if they came embedded and are missing
              if (wo.Customer && !customerMap.has(wo.Customer.id)) {
                 customersList.push(wo.Customer);
                 customerMap.set(wo.Customer.id, wo.Customer);
              }
              if (wo.Vehicle && !vehiclesList.some(v => v.id === wo.Vehicle.id)) {
                 vehiclesList.push(wo.Vehicle);
              }
            }
          });
        } catch (e) {
          console.error('Error fetching missing work orders:', e);
        }
      }

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

        let bay = app.bay;
        if (bay === 'Floor') bay = 'Main Floor';

        return {
          ...app,
          bay: bay,
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
      setCustomers(customersList);
      setVehicles(vehiclesList);

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

      const { error } = await supabase
        .from('Appointment')
        .update({ ...updatedAppointment, updated_date: new Date().toISOString() })
        .eq('id', event.id);
      if (error) throw error;

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
        const { error } = await supabase
          .from('Appointment')
          .update({ ...formData, updated_date: new Date().toISOString() })
          .eq('id', selectedAppointment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('Appointment').insert({
          ...formData,
          created_by: currentEmployee?.email || '',
          created_by_id: currentEmployee?.autopro_user_id,
        });
        if (error) throw error;
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
        const { error } = await supabase.from('Appointment').delete().eq('id', id);
        if (error) throw error;
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
        const { error } = await supabase.from('Appointment').delete().eq('id', appointmentId);
        if (error) throw error;
        loadData();
      } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment.');
      }
    }
  };

  return (
    <div className="p-6 min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
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
          onNewAppointment={() => {
            setSelectedAppointment(null);
            setSlotInfo(null);
            setShowModal(true);
          }}
        />
      </div>
    </div>
  );
}