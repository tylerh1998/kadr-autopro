import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppointmentForm from '../appointments/AppointmentForm';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function EditApptViaWoModal({ open, onClose, appointment, workOrder, customer, vehicle, onAppointmentUpdated }) {
  const { employee: currentEmployee } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formattedAppointment, setFormattedAppointment] = useState(null);

  const loadPrerequisites = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, custRes, vehRes] = await Promise.all([
        supabase.from('Employee').select('*'),
        supabase.from('Customer').select('*').order('org_name', { ascending: true }),
        supabase.from('Vehicle').select('*').order('year', { ascending: false }),
      ]);
      const employeesData = empRes.data || [];
      setEmployees(employeesData.filter(e => e.position === 'technician' || e.position === 'apprentice'));

      const fetchedCustomers = [...(custRes.data || [])];
      if (customer && !fetchedCustomers.some(c => c.id === customer.id)) {
        fetchedCustomers.push(customer);
      }
      setCustomers(fetchedCustomers);

      const fetchedVehicles = [...(vehRes.data || [])];
      if (vehicle && !fetchedVehicles.some(v => v.id === vehicle.id)) {
        fetchedVehicles.push(vehicle);
      }
      setVehicles(fetchedVehicles);
      
      setWorkOrders(workOrder ? [workOrder] : []);
    } catch (error) {
      console.error('Error loading prerequisites for appointment form:', error);
    } finally {
      setLoading(false);
    }
  }, [customer, vehicle, workOrder]);

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
        const { error } = await supabase
          .from('Appointment')
          .update({ ...appointmentData, updated_date: new Date().toISOString() })
          .eq('id', appointmentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('Appointment').insert({
          ...appointmentData,
          created_by: currentEmployee?.email || '',
          created_by_id: currentEmployee?.autopro_user_id,
        });
        if (error) throw error;
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
        const { error } = await supabase.from('Appointment').delete().eq('id', appointmentId);
        if (error) throw error;
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit Appointment' : 'New Appointment'}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400">Loading form data...</p>
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
              workOrderForNew={workOrder}
              customerForNew={customer}
              vehicleForNew={vehicle}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}