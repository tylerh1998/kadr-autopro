import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CustomerForm from './CustomerForm';
import { base44 } from '@/api/base44Client';

export default function NewCustomerModal({ open, onClose, onCustomerCreated }) {
  
  const handleSubmit = async (customerData) => {
    try {
      const response = await base44.functions.invoke('supabaseCustomer', { action: 'create', data: customerData });
      
      if (!response.data?.data) {
          throw new Error('Failed to create customer: No data returned');
      }

      const newCustomer = response.data.data;
      
      alert('Customer created successfully!');
      if (onCustomerCreated) {
        onCustomerCreated(newCustomer);
      }
      onClose();
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer. Please check the console for details.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Customer</DialogTitle>
        </DialogHeader>
        <CustomerForm
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}