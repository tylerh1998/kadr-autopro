import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import CustomerWorkOrderHistoryView from './CustomerWorkOrderHistoryView';

export default function CustomerWorkOrderHistoryModal({ open, onClose, customer, onOpenVehicleHistory }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl vehicle-history-dialog">
        <DialogHeader className="no-print">
          <div className="pr-8">
            <DialogTitle>Customer History for {customer?.org_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()}</DialogTitle>
            <DialogDescription>A list of all previous work orders for this customer.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto vehicle-history-scroll">
          <CustomerWorkOrderHistoryView 
            customer={customer} 
            onOpenVehicleHistory={onOpenVehicleHistory} 
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}