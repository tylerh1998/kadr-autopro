import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CustomerForm from './CustomerForm';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function NewCustomerModal({ open, onClose, onCustomerCreated }) {
  const { employee: user } = useAuth();

  const handleSubmit = async (customerData) => {
    try {
      const payload = {
        ...customerData,
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        created_date: new Date().toISOString(),
        created_by: user?.email || '',
      };
      const { data: newCustomer, error } = await supabase
        .from('Customer')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      if (!newCustomer) {
          throw new Error('Failed to create customer: No data returned');
      }

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