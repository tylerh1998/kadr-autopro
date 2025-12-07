import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Clock, MapPin, Wrench } from 'lucide-react';

export default function CellAppointmentsModal({ open, onClose, appointments, slotInfo, onSelectAppointment }) {
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
          <DialogTitle>
            Appointments at {slotTimeDisplay}
            {slotInfo?.bay && ` - ${slotInfo.bay}`}
            {slotInfo?.techName && ` - ${slotInfo.techName}`}
          </DialogTitle>
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
                className="w-full p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all text-left"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-lg">
                        {customerName}
                      </div>
                      {appointment.title && appointment.title !== customerName && (
                        <div className="text-sm text-slate-600 mt-1">
                          {appointment.title}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {appointment.status}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>
                        {format(appointment.start, 'h:mm a')} - {format(appointment.end, 'h:mm a')}
                      </span>
                    </div>
                    
                    {appointment.tech && (
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-slate-400" />
                        <span>
                          {appointment.tech.first_name} {appointment.tech.last_name}
                        </span>
                      </div>
                    )}
                    
                    {appointment.bayId && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span>{appointment.bayId}</span>
                      </div>
                    )}
                  </div>
                  
                  {appointment.notes && (
                    <div className="text-sm text-slate-500 border-t border-slate-100 pt-2 mt-2">
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