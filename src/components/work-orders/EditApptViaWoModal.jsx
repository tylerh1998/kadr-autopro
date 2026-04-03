import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppointmentForm from '../appointments/AppointmentForm';
import { Employee, WorkOrder, Appointment } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function EditApptViaWoModal({ open, onClose, appointment, workOrder, customer, vehicle, onAppointmentUpdated }) {
  const [employees, setEmployees] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formattedAppointment, setFormattedAppointment] = useState(null);

  const loadPrerequisites = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesData, workOrdersData, custRes, vehRes] = await Promise.all([
        Employee.list(),
        WorkOrder.list(),
        base44.functions.invoke('supabaseCustomer', { action: 'list' }),
        base44.functions.invoke('supabaseVehicle', { action: 'list' }),
      ]);
      setEmployees(employeesData.filter(e => e.position === 'technician' || e.position === 'apprentice'));
      setWorkOrders(workOrdersData);
      setCustomers(custRes.data?.data || []);
      setVehicles(vehRes.data?.data || []);
    } catch (error) {
      console.error('Error loading prerequisites for appointment form:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadPrerequisites();
      
      if (appointment) {
        // Editing existing appointment
        const formatted = {
          ...appointment,
          start: new Date(appointment.start_time),
          end: new Date(appointment.end_time),
          start_time: appointment.start_time,
          end_time: appointment.end_time
        };
        setFormattedAppointment(formatted);
        console.log('Formatted appointment for form:', formatted);
      } else {
        // Creating new appointment - no formatted appointment
        setFormattedAppointment(null);
      }
    }
  }, [open, appointment, loadPrerequisites]);

  const handleSaveAppointment = async (appointmentData) => {
    try {
      const isEditing = appointmentData.id || formattedAppointment?.id;
      const appointmentId = appointmentData.id || formattedAppointment?.id;
      
      if (isEditing) {
        await Appointment.update(appointmentId, appointmentData);
      } else {
        await Appointment.create(appointmentData);
      }
      
      onAppointmentUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to save appointment:', error);
      alert(`Error saving appointment: ${error.message}`);
    }
  };

  const handleDelete = async (appointmentId) => {
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      try {
        await Appointment.delete(appointmentId);
        onAppointmentUpdated();
        onClose();
      } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment.');
      }
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit Appointment' : 'New Appointment'}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {loading ? (
            <div className="text-center py-8">
              <p>Loading form data...</p>
            </div>
          ) : (
            <AppointmentForm
              open={true}
              onClose={onClose}
              onSubmit={handleSaveAppointment}
              onDelete={handleDelete}
              appointment={formattedAppointment}
              slotInfo={null}
              employees={employees}
              workOrders={workOrders}
              customers={customers}
              vehicles={vehicles}
              workOrderForNew={!appointment ? workOrder : null}
              customerForNew={!appointment ? customer : null}
              vehicleForNew={!appointment ? vehicle : null}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}