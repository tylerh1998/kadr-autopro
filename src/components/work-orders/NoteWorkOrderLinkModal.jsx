import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function NoteWorkOrderLinkModal({ open, onOpenChange, workOrders = [], customers = [], vehicles = [], onSelectWorkOrder, isSaving = false }) {
  const [searchTerm, setSearchTerm] = useState('');

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const filteredWorkOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workOrders.filter((workOrder) => {
      if (!term) return true;
      const customer = customerMap.get(workOrder.customer_id);
      const vehicle = vehicleMap.get(workOrder.vehicle_id);
      const customerName = customer?.org_name?.trim() || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
      const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ');
      const haystack = [workOrder.wo_number, workOrder.ro_number, workOrder.description, customerName, vehicleName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    }).slice(0, 20);
  }, [customerMap, searchTerm, vehicleMap, workOrders]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect work order</DialogTitle>
          <DialogDescription>Select a work order to link to this note.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search WO, customer, vehicle, or description..." />
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredWorkOrders.length > 0 ? filteredWorkOrders.map((workOrder) => {
              const customer = customerMap.get(workOrder.customer_id);
              const vehicle = vehicleMap.get(workOrder.vehicle_id);
              const customerName = customer?.org_name?.trim() || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'No customer';
              const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'No vehicle';
              const workOrderNumber = workOrder.wo_number || workOrder.ro_number || 'WO';

              return (
                <button
                  key={workOrder.id}
                  type="button"
                  onClick={() => onSelectWorkOrder?.(workOrder)}
                  disabled={isSaving}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{workOrderNumber} - {customerName}</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{vehicleName}</div>
                </button>
              );
            }) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">No work orders found.</div>
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}