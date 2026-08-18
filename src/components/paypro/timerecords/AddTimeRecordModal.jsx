import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, X, Sparkles, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AddTimeRecordModal({ isOpen, onClose, employees, currentEmployee, onSave }) {
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }),
    clock_in_time: '',
    clock_out_time: '',
    pto_hours: '0',
    stat_hours: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleEmployeeToggle = (employeeId) => {
    setSelectedEmployees((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedEmployees.length === 0) {
      alert('Please select at least one employee.');
      return;
    }

    if (!formData.date) {
      alert('Please select a date.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const recordsToCreate = [];

      for (const empId of selectedEmployees) {
        const employee = employees.find((e) => e.id === empId);
        if (!employee) continue;

        const employeeName = `${employee.first_name} ${employee.last_name}`;

        const ptoHours = parseFloat(formData.pto_hours) || 0;
        const statHours = parseFloat(formData.stat_hours) || 0;

        let clock_in_time = null;
        let clock_out_time = null;
        let total_hours = 0;

        if (formData.clock_in_time) {
          const mtDateTime = new Date(`${formData.date}T${formData.clock_in_time}:00`);
          clock_in_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
        }
        if (formData.clock_out_time) {
          const mtDateTime = new Date(`${formData.date}T${formData.clock_out_time}:00`);
          clock_out_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
        }

        if ((ptoHours > 0 || statHours > 0) && !clock_in_time) {
          const mtDateTime = new Date(`${formData.date}T00:00:00`);
          clock_in_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
          clock_out_time = new Date(mtDateTime.toLocaleString('en-US', { timeZone: 'America/Denver' })).toISOString();
          total_hours = 0;
        } else if (clock_in_time && clock_out_time) {
          const inTime = new Date(clock_in_time);
          const outTime = new Date(clock_out_time);
          total_hours = (outTime - inTime) / (1000 * 60 * 60);
          if (total_hours < 0) total_hours = 0;
        }

        let status;
        if (ptoHours > 0 || statHours > 0) {
          status = 'clocked_out';
        } else if (clock_out_time) {
          status = 'clocked_out';
        } else {
          status = 'clocked_in';
        }

        recordsToCreate.push({
          // No DB default on TimeRecord.id - matches Layout.jsx's live TimeRecord insert exactly.
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          employee_name: employeeName,
          clock_in_time,
          clock_out_time,
          total_hours,
          pto_hours: ptoHours,
          stat_hours: statHours,
          notes: formData.notes,
          status,
          created_date: now,
          created_by: currentEmployee?.email,
          created_by_id: currentEmployee?.autopro_user_id,
        });
      }

      const { error } = await supabase.from('TimeRecord').insert(recordsToCreate).select();
      if (error) throw error;

      onSave();
      handleClose();
    } catch (error) {
      console.error('Error creating time records:', error);
      alert('Error creating time records: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedEmployees([]);
    setFormData({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }),
      clock_in_time: '',
      clock_out_time: '',
      pto_hours: '0',
      stat_hours: '0',
      notes: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Time Record</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Add a new time entry manually. Select multiple employees to create records for all at once. Click save when
            you're done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {employees.map((emp) => (
                  <div key={emp.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`emp-${emp.id}`}
                      checked={selectedEmployees.includes(emp.id)}
                      onCheckedChange={() => handleEmployeeToggle(emp.id)}
                    />
                    <label htmlFor={`emp-${emp.id}`} className="text-sm cursor-pointer">
                      {emp.first_name} {emp.last_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
