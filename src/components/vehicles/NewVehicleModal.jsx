import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VehicleForm from './VehicleForm';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function NewVehicleModal({ open, onClose, onVehicleCreated }) {
  const { employee } = useAuth();
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchCustomers = async () => {
        try {
          const { data, error } = await supabase
            .from('Customer')
            .select('*')
            .order('org_name', { ascending: true });
          if (error) throw error;
          setCustomers(data || []);
        } catch (error) {
          console.error("Failed to fetch customers:", error);
        }
      };
      fetchCustomers();
    }
  }, [open]);

  const handleSubmit = async (vehicleData) => {
    try {
      const user = employee;
      const payload = {
        ...vehicleData,
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
        created_by: user?.email || '',
        created_by_id: user?.autopro_user_id,
      };
      const { data: newVehicle, error: createError } = await supabase
        .from('Vehicle')
        .insert(payload)
        .select()
        .single();
      if (createError) throw new Error(createError.message);
      alert('Vehicle added successfully!');
      if (onVehicleCreated) {
        onVehicleCreated(newVehicle);
      }
      onClose();
    } catch (error) {
      console.error('Failed to add vehicle:', error);
      alert('Failed to add vehicle. Please check the console for details.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
        </DialogHeader>
        <VehicleForm
          customers={customers}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}