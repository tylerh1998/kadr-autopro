import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

export default function GlobalClockInModal({ open, onClose, user, onClockIn }) {
  const [clockInTime, setClockInTime] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Default to current time, formatted for datetime-local
      const now = new Date();
      // Adjust to local timezone string for input
      const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      setClockInTime(localIso);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !user.full_name) return;
    
    setLoading(true);
    try {
      const selectedTime = new Date(clockInTime);
      const now = new Date();
      
      if (selectedTime > now) {
        alert("Cannot clock in at a future time.");
        setLoading(false);
        return;
      }

      const isoTime = selectedTime.toISOString();

      // 1. Create TimeRecord (Global Clock In)
      const timeRecordRes = await base44.functions.invoke('workProProxy', {
        entityName: 'TimeRecord',
        method: 'create',
        params: {
          employee_name: user.full_name,
          clock_in_time: isoTime,
          status: 'active',
          total_hours: 0,
          pto_hours: 0,
          stat_hours: 0
        }
      });

      if (!timeRecordRes.data.success) throw new Error(timeRecordRes.data.error || 'Failed to create Time Record');
      const timeRecord = timeRecordRes.data.data;

      // 2. Create UnassignedTime
      await base44.functions.invoke('workProProxy', {
        entityName: 'UnassignedTime',
        method: 'create',
        params: {
          user_name: user.full_name,
          employee_name: user.full_name,
          start_time: isoTime,
          status: 'active'
        }
      });

      onClockIn(timeRecord);
      onClose();
    } catch (error) {
      console.error('Error clocking in:', error);
      alert('Error clocking in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Clock In</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clockInTime">Start Time</Label>
            <Input
              id="clockInTime"
              type="datetime-local"
              value={clockInTime}
              onChange={(e) => setClockInTime(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500">
              Defaults to current time. You can backdate if needed.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Clock In
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}