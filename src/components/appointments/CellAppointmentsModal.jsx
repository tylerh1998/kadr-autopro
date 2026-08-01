import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Clock, MapPin, Wrench, Plus } from 'lucide-react';

export default function CellAppointmentsModal({ open, onClose, appointments, slotInfo, onSelectAppointment, onNewAppointment }) {
  if (!appointments || appointments.length === 0) return null;

  const getCustomerDisplayName = (customer) => {
    if (!customer) return 'Unknown Customer';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
  };

  const slotTimeDisplay = slotInfo ? format(new Date(slotInfo.start), 'h:mm a') : '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>
              Appointments at {slotTimeDisplay}
              {slotInfo?.bay && ` - ${slotInfo.bay}`}
              {slotInfo?.techName && ` - ${slotInfo.techName}`}
            </DialogTitle>
            {onNewAppointment && (
              <Button 
                onClick={onNewAppointment}
                size="sm"
                className="bg-black hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-black font-medium shadow-sm transition-all"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Appointment
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {appointments.map((appointment) => {
            const customerName = appointment.customer 
              ? getCustomerDisplayName(appointment.customer) 
              : appointment.displayTitle || 'Untitled Appointment';
            
            return (
              <button
                key={appointment.id}
                onClick={() => {
                  onSelectAppointment(appointment);
                  onClose();
                }}
                className="w-full p-4 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left bg-white dark:bg-slate-900"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
                        {customerName}
                      </div>
                      {appointment.title && appointment.title !== customerName && (
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {appointment.title}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-700">
                      {appointment.status}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span>
                        {format(appointment.start, 'h:mm a')} - {format(appointment.end, 'h:mm a')}
                      </span>
                    </div>
                    
                    {appointment.tech && (
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <span>
                          {appointment.tech.first_name} {appointment.tech.last_name}
                        </span>
                      </div>
                    )}
                    
                    {appointment.bayId && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <span>{appointment.bayId}</span>
                      </div>
                    )}
                  </div>
                  
                  {appointment.notes && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 mt-2">
                      {appointment.notes.length > 100 
                        ? `${appointment.notes.substring(0, 100)}...` 
                        : appointment.notes
                      }
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}