import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import CustomerForm from '../customers/CustomerForm';
import CustomerWorkOrderHistoryView from '../customers/CustomerWorkOrderHistoryView';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Loader2 } from 'lucide-react';

export default function SmsCustomerModal({ open, onClose, phone, customerId, onCustomerSaved }) {
  const { employee: user } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

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
      <DialogContent className={`${customerId ? 'max-w-6xl' : 'max-w-2xl'} max-h-[90vh] flex flex-col z-[10000]`}>
        <DialogHeader className="shrink-0 pb-2 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle>{customerId ? 'Customer Details & History' : 'Create New Customer'}</DialogTitle>
          <DialogDescription>
            {customerId ? 'View or edit the customer profile and their past work orders.' : 'Enter details for the new customer.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center p-12 flex-1"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : (
          customer && (
            <div className={`flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0 pt-2 ${customerId ? '' : 'justify-center'}`}>
              
              <div className={`overflow-y-auto pr-2 custom-scrollbar ${customerId ? 'w-full lg:w-[45%] border-r border-slate-200 dark:border-slate-800' : 'w-full'}`}>
                <CustomerForm
                  customer={customerId ? customer : { phone: phone || '' }}
                  onSubmit={handleSubmit}
                  onCancel={onClose}
                />
              </div>

              {customerId && (
                <div className="w-full lg:w-[55%] overflow-y-auto pl-2 custom-scrollbar">
                  <CustomerWorkOrderHistoryView customer={customer} />
                </div>
              )}

            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
