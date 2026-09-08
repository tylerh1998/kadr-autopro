import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CustomerForm from '../customers/CustomerForm';
import CustomerWorkOrderHistoryModal from '../customers/CustomerWorkOrderHistoryModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SmsCustomerModal({ open, onClose, phone, customerId, onCustomerSaved }) {
  const { employee: user } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (open) {
      if (customerId) {
        setLoading(true);
        supabase
          .from('Customer')
          .select('*')
          .eq('id', customerId)
          .single()
          .then(({ data, error }) => {
            if (data) setCustomer(data);
            setLoading(false);
          });
      } else {
        // Prepopulate phone for new customer
        setCustomer({ phone: phone || '' });
        setLoading(false);
      }
    } else {
      setCustomer(null);
    }
  }, [open, customerId, phone]);

  const handleSubmit = async (customerData) => {
    try {
      let savedCustomer;
      if (customerId) {
        // Edit existing
        const { data, error } = await supabase
          .from('Customer')
          .update({ ...customerData, updated_date: new Date().toISOString() })
          .eq('id', customerId)
          .select()
          .single();
        if (error) throw error;
        savedCustomer = data;
        alert('Customer updated successfully!');
      } else {
        // Create new
        const payload = {
          ...customerData,
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          created_date: new Date().toISOString(),
          created_by: user?.email || '',
        };
        const { data, error } = await supabase
          .from('Customer')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedCustomer = data;
        alert('Customer created successfully!');
      }
      
      if (onCustomerSaved) {
        onCustomerSaved(savedCustomer);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save customer:', error);
      alert('Failed to save customer. Please check console.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto z-[10000]">
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle>{customerId ? 'Edit Customer' : 'Create New Customer'}</DialogTitle>
          {customerId && customer && (
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
              <History className="w-4 h-4 mr-2" />
              View History
            </Button>
          )}
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : (
          customer && (
            <CustomerForm
              customer={customerId ? customer : { phone: phone || '' }}
              onSubmit={handleSubmit}
              onCancel={onClose}
            />
          )
        )}
      </DialogContent>

      <CustomerWorkOrderHistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        customer={customer}
      />
    </Dialog>
  );
}
