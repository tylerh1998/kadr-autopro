import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, Check, Loader2, Search } from 'lucide-react';

const getCustomerDisplayName = (customer) => {
  if (!customer) return '';
  const orgName = customer.org_name?.trim();
  if (orgName) return orgName;
  const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  return fullName || 'Unnamed Customer';
};

export default function ChangeCustomerModal({ open, onClose, currentCustomer, onSubmit }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedCustomer(currentCustomer || null);
    setCustomerSearchTerm(currentCustomer ? getCustomerDisplayName(currentCustomer) : '');
    setLocalCustomers(currentCustomer ? [currentCustomer] : []);
  }, [open, currentCustomer]);

  useEffect(() => {
    if (!open || !customerSearchOpen) return;

    let isMounted = true;
    const searchCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const term = customerSearchTerm.trim();
        let customers;
        if (term) {
          const { data, error } = await supabase.rpc('search_customers_ranked', {
            p_search_term: term,
            p_include_inactive: false,
            p_limit: 50,
            p_offset: 0
          });
          if (error) throw error;
          customers = (data || []).map(({ total_count, match_rank, ...item }) => item);
        } else {
          const { data, error } = await supabase
            .from('Customer')
            .select('*')
            .or('is_active.eq.true,is_active.is.null')
            .order('org_name', { ascending: true, nullsLast: true })
            .order('first_name', { ascending: true, nullsLast: true })
            .order('last_name', { ascending: true, nullsLast: true })
            .range(0, 49);
          if (error) throw error;
          customers = data || [];
        }

        if (isMounted) {
          if (currentCustomer && !customers.some((customer) => customer.id === currentCustomer.id)) {
            setLocalCustomers([currentCustomer, ...customers]);
          } else {
            setLocalCustomers(customers);
          }
        }
      } catch (error) {
        console.error('Failed to search customers:', error);
      } finally {
        if (isMounted) setLoadingCustomers(false);
      }
    };

    const timeoutId = setTimeout(searchCustomers, 400);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [open, customerSearchOpen, customerSearchTerm, currentCustomer]);

  const handleClose = () => {
    if (saving) return;
    setCustomerSearchOpen(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedCustomer?.id || selectedCustomer.id === currentCustomer?.id) return;

    setSaving(true);
    try {
      await onSubmit(selectedCustomer);
      handleClose();
    } catch (error) {
      console.error('Failed to change customer:', error);
      alert(error.message || 'Failed to change customer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-xl dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle>Change Assigned Customer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Changing the customer here will also change the customer for any payments associated with this work order.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer</label>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search or select a customer..."
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      setSelectedCustomer(null);
                      setCustomerSearchOpen(true);
                    }}
                    onFocus={() => setCustomerSearchOpen(true)}
                    className="pl-9"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] max-w-[90vw] p-0 dark:bg-slate-950 dark:border-slate-800" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="max-h-[300px] overflow-y-auto p-1">
                  {loadingCustomers ? (
                    <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Searching...</div>
                  ) : localCustomers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No customers found.</div>
                  ) : (
                    <div className="space-y-1">
                      {localCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerSearchTerm(getCustomerDisplayName(customer));
                            setCustomerSearchOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{getCustomerDisplayName(customer)}</span>
                          {selectedCustomer?.id === customer.id && <Check className="h-4 w-4 text-green-600 dark:text-green-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !selectedCustomer?.id || selectedCustomer.id === currentCustomer?.id}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}