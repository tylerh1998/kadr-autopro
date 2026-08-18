import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, Sparkles, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function EditTimeRecordModal({ isOpen, onClose, record, employees, onSave }) {
  const [formData, setFormData] = useState({
    date: '',
    clock_in_time: '',
    clock_out_time: '',
    pto_hours: '0',
    stat_hours: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (record) {
      // Extract time from clock_in and clock_out
      const clockInTime = record.clock_in ? new Date(record.clock_in).toTimeString().slice(0, 5) : '';
      const clockOutTime = record.clock_out ? new Date(record.clock_out).toTimeString().slice(0, 5) : '';

      setFormData({
        date: record.date || '',
        clock_in_time: clockInTime,
        clock_out_time: clockOutTime,
        pto_hours: record.pto_hours?.toString() || '0',
        stat_hours: record.stat_hours?.toString() || '0',
        notes: record.notes || '',
      });
    }
  }, [record, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!record) return;

    setSaving(true);
    try {
      let clock_in_time = null;
      let clock_out_time = null;

      if (formData.clock_in_time) {
        const mtDateTime = new Date(`${formData.date}T${formData.clock_in_time}:00`);
        clock_in_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
      }
      if (formData.clock_out_time) {
        const mtDateTime = new Date(`${formData.date}T${formData.clock_out_time}:00`);
        clock_out_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
      }

      let total_hours = 0;
      if (clock_in_time && clock_out_time) {
        const inTime = new Date(clock_in_time);
        const outTime = new Date(clock_out_time);
        total_hours = (outTime - inTime) / (1000 * 60 * 60);
        if (total_hours < 0) total_hours = 0;
      }

      const ptoHours = parseFloat(formData.pto_hours) || 0;
      const statHours = parseFloat(formData.stat_hours) || 0;

      let status;
      if (ptoHours > 0 || statHours > 0) {
        status = 'clocked_out';
      } else if (clock_out_time) {
        status = 'clocked_out';
      } else {
        status = 'clocked_in';
      }

      const { error } = await supabase
        .from('TimeRecord')
        .update({
          employee_name: record.employee_name,
          clock_in_time,
          clock_out_time,
          total_hours,
          pto_hours: ptoHours,
          stat_hours: statHours,
          notes: formData.notes,
          status,
          updated_date: new Date().toISOString(),
        })
        .eq('id', record.id)
        .select();
      if (error) throw error;

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating time record:', error);
      alert('Error updating time record: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;

    if (!window.confirm('Are you sure you want to delete this time record? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from('TimeRecord').delete().eq('id', record.id);
      if (error) throw error;

      onSave();
      onClose();
    } catch (error) {
      console.error('Error deleting time record:', error);
      alert('Error deleting time record: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Time Record</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Edit the time entry for {record?.employee_name}. Click save when you're done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Employee</Label>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm font-medium">{record?.employee_name}</div>
          </div>

          <div className="space-y-2">
            <Label>Date *</Label>
            <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Time In
            </Label>
            <Input
              type="time"
              value={formData.clock_in_time}
              onChange={(e) => setFormData({ ...formData, clock_in_time: e.target.value })}
              placeholder="--:-- --"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Time Out
            </Label>
            <Input
              type="time"
              value={formData.clock_out_time}
              onChange={(e) => setFormData({ ...formData, clock_out_time: e.target.value })}
              placeholder="--:-- --"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              PTO Hours
            </Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              value={formData.pto_hours}
              onChange={(e) => setFormData({ ...formData, pto_hours: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              STAT Hours
            </Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              value={formData.stat_hours}
              onChange={(e) => setFormData({ ...formData, stat_hours: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any notes for this time entry..."
              rows={3}
            />
          </div>

          <DialogFooter className="flex justify-between gap-2">
            <Button type="button" onClick={handleDelete} disabled={deleting || saving} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={saving || deleting} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
