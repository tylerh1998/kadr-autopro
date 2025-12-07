import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VehicleForm from './VehicleForm';
import { Customer, Vehicle } from '@/entities/all';

export default function NewVehicleModal({ open, onClose, onVehicleCreated }) {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchCustomers = async () => {
        try {
          const customerList = await Customer.list();
          setCustomers(customerList);
        } catch (error) {
          console.error("Failed to fetch customers:", error);
        }
      };
      fetchCustomers();
    }
  }, [open]);

  const handleSubmit = async (vehicleData) => {
    try {
      const newVehicle = await Vehicle.create(vehicleData);
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