import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Clock, Plus } from 'lucide-react';
import { Appointment } from '@/entities/all';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AppointmentsListModal({ open, onClose, workOrderId, displayNumber, onAppointmentClick, onNewAppointment }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && workOrderId) {
      loadAppointments();
    }
  }, [open, workOrderId]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const workOrderAppointments = await Appointment.filter({ work_order_id: workOrderId });
      setAppointments(workOrderAppointments.sort((a, b) => 
        new Date(a.start_time) - new Date(b.start_time)
      ));
    } catch (error) {
      console.error('Error loading appointments:', error);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Scheduled': 'bg-blue-100 text-blue-800',
      'Confirmed': 'bg-green-100 text-green-800',
      'In Progress': 'bg-purple-100 text-purple-800',
      'Completed': 'bg-gray-100 text-gray-800',
      'Cancelled': 'bg-red-100 text-red-800',
      'No Show': 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-slate-100 text-slate-800';
  };

  const handleAppointmentClick = (appointment) => {
    if (onAppointmentClick) {
      onAppointmentClick(appointment);
    }
  };

  const handleNewAppointment = () => {
    if (onNewAppointment) {
      onNewAppointment();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Appointments for {displayNumber}</DialogTitle>
            <Button 
              onClick={handleNewAppointment}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Appointment
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600">No appointments found for this work order.</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {appointments.map((appointment) => {
              const startDate = new Date(appointment.start_time);
              const endDate = new Date(appointment.end_time);
              const isPast = startDate < new Date();

              return (
                <Card 
                  key={appointment.id} 
                  className={`${isPast ? 'bg-slate-50' : 'bg-white'} cursor-pointer hover:shadow-lg transition-all`}
                  onClick={() => handleAppointmentClick(appointment)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">
                          {appointment.title}
                        </h4>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>{format(startDate, 'EEE, MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          <span>
                            {format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={getStatusColor(appointment.status)}>
                          {appointment.status}
                        </Badge>
                        {isPast && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-600">
                            Past
                          </Badge>
                        )}
                      </div>
                    </div>

                    {appointment.bay && (
                      <div className="text-sm text-slate-600 mt-2">
                        <span className="font-medium">Bay:</span> {appointment.bay}
                      </div>
                    )}

                    {appointment.notes && (
                      <div className="text-sm text-slate-600 mt-2 p-2 bg-slate-50 rounded">
                        {appointment.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}