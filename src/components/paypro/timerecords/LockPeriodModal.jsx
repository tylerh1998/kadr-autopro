import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LockPeriodModal({ isOpen, onClose, onLock, records, initialDateRange, currentEmployee }) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [locking, setLocking] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (initialDateRange) setDateRange(initialDateRange);
      setPreview(null);
    }
  }, [isOpen, initialDateRange]);

  const handlePreview = () => {
    if (!dateRange.start || !dateRange.end) {
      alert('Please select both start and end dates.');
      return;
    }

    const dateEligible = records.filter((r) => r.date >= dateRange.start && r.date <= dateRange.end && r.status !== 'locked');

    // Q4 safety addition (phase_4_implementation_plan.md): an in-progress
    // shift locked here would flip status to 'locked', and the clock-out
    // toggle (Layout.jsx's handleClockToggle) - which looks up the active
    // record by .eq('status','clocked_in') - would then silently create a
    // second, brand-new clock-in record instead of closing the original.
    // Excluded from the lockable set and surfaced as a skipped count instead.
    const skippedInProgress = dateEligible.filter((r) => r.status === 'clocked_in' || r.status === 'active');
    const eligibleRecords = dateEligible.filter((r) => r.status !== 'clocked_in' && r.status !== 'active');

    // Calculate hours - mirrors TimeRecords page logic
    const seenDays = new Set();
    let regularHours = 0;
    let overtimeHours = 0;

    eligibleRecords.forEach((r) => {
      const dayKey = `${r.employee_name}-${r.date}`;
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        const dayRecords = eligibleRecords.filter((rec) => rec.employee_name === r.employee_name && rec.date === r.date);
        const dayTotalWork = dayRecords.reduce((sum, rec) => {
          if (rec.pto_hours > 0 || rec.stat_hours > 0) return sum;
          return sum + (rec.hours || 0);
        }, 0);
        regularHours += Math.min(dayTotalWork, 8);
        overtimeHours += Math.max(0, dayTotalWork - 8);
      }
    });

    const ptoHours = eligibleRecords.reduce((sum, r) => sum + (r.pto_hours || 0), 0);
    const statHours = eligibleRecords.reduce((sum, r) => sum + (r.stat_hours || 0), 0);

    setPreview({
      records: eligibleRecords,
      regularHours,
      overtimeHours,
      ptoHours,
      statHours,
      count: eligibleRecords.length,
      skippedCount: skippedInProgress.length,
    });
  };

  const handleLock = async () => {
    if (!preview || preview.count === 0) {
      alert('No records to lock in the selected period.');
      return;
    }

    setLocking(true);
    try {
      const recordIds = preview.records.map((r) => r.id);
      const now = new Date().toISOString();

      // Not wrapped in a transaction/RPC - matches the source app's own
      // two-sequential-.update()/.insert() shape exactly (§3.6).
      const { data: updatedData, error: updateError } = await supabase
        .from('TimeRecord')
        .update({ status: 'locked', updated_date: now })
        .in('id', recordIds)
        .select();
      if (updateError) throw updateError;

      const { error: ppError } = await supabase
        .from('PayPeriods')
        .insert({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          date_from: dateRange.start,
          date_to: dateRange.end,
          total_regular_hours: preview.regularHours,
          total_overtime_hours: preview.overtimeHours,
          total_pto_hours: preview.ptoHours,
          total_stat_hours: preview.statHours,
          total_records: preview.count,
          created_date: now,
          created_by: currentEmployee?.email,
          created_by_id: currentEmployee?.autopro_user_id,
        })
        .select();
      if (ppError) throw ppError;

      onLock(dateRange, updatedData);
      onClose();
      setPreview(null);
      setDateRange({ start: '', end: '' });
    } catch (error) {
      console.error('Error locking period:', error);
      alert('Error locking period: ' + error.message);
    } finally {
      setLocking(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setDateRange({ start: '', end: '' });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Lock Pay Period
          </DialogTitle>
          <DialogDescription>Lock time records for a pay period. Locked records cannot be edited.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => {
                  setDateRange({ ...dateRange, start: e.target.value });
                  setPreview(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => {
                  setDateRange({ ...dateRange, end: e.target.value });
                  setPreview(null);
                }}
              />
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handlePreview} disabled={!dateRange.start || !dateRange.end}>
            Preview Records
          </Button>

          {preview && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">Period Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Records to lock:</span>
                  <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">{preview.count}</p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Regular hours:</span>
                  <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">{preview.regularHours.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Overtime hours:</span>
                  <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">{preview.overtimeHours.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">PTO hours:</span>
                  <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">{preview.ptoHours.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Stat hours:</span>
                  <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">{preview.statHours.toFixed(2)}</p>
                </div>
              </div>
              {preview.skippedCount > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400 pt-1">
                  {preview.skippedCount} record{preview.skippedCount === 1 ? '' : 's'} skipped (still clocked in)
                </p>
              )}
            </div>
          )}

          {preview && preview.count > 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                This will mark records as locked in WorkPRO.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleLock} disabled={locking || !preview || preview.count === 0} className="bg-blue-600 hover:bg-blue-700">
            {locking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Lock className="w-4 h-4 mr-2" />
            Lock {preview?.count || 0} Records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
