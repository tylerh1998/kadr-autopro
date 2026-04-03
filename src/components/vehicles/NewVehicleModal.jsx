import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VehicleForm from './VehicleForm';
import { base44 } from '@/api/base44Client';

export default function NewVehicleModal({ open, onClose, onVehicleCreated }) {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchCustomers = async () => {
        try {
          const res = await base44.functions.invoke('supabaseCustomer', { action: 'list' });
          setCustomers(res.data?.data || []);
        } catch (error) {
          console.error("Failed to fetch customers:", error);
        }
      };
      fetchCustomers();
    }
  }, [open]);

  const handleSubmit = async (vehicleData) => {
    try {
      const user = await base44.auth.me();
      const payload = {
        ...vehicleData,
        created_date: new Date().toISOString(),
        created_by: user?.email || '',
      };
      const res = await base44.functions.invoke('SupabaseProxy', { 
        action: 'create', 
        table: 'Vehicle',
        data: payload 
      });
      const newVehicle = res.data?.data?.[0];
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