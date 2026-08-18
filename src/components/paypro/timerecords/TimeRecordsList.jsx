import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

export default function TimeRecordsList({ records, employees, onEdit, isAdmin }) {
  const getEmployee = (employeeId) => {
    return employees.find((e) => e.employee_id === employeeId || e.id === employeeId);
  };

  const formatTime = (dateTimeString) => {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'locked':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">locked</Badge>;
      case 'clocked_in':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300">clocked in</Badge>;
      case 'clocked_out':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">clocked out</Badge>;
      case 'error':
        return <Badge className="bg-red-500 text-white dark:bg-red-600">error</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{status || 'pending'}</Badge>;
    }
  };

  // Track which employee+date combos have already shown day totals
  const shownDayTotals = new Set();

  // Group records by employee and date to calculate day totals
  const calculateDayData = (record, allRecords) => {
    const employeeRecords = allRecords.filter(
      (r) => r.employee_name === record.employee_name && r.date === record.date
    );

    // Sum up all hours for the day (excluding PTO and STAT)
    const dayTotalWork = employeeRecords.reduce((sum, r) => {
      const isPTO = r.pto_hours > 0;
      const isSTAT = r.stat_hours > 0;
      if (!isPTO && !isSTAT) {
        return sum + (r.hours || 0);
      }
      return sum;
    }, 0);

    // Calculate regular (first 8 hours) and OT (over 8 hours)
    const regular = Math.min(dayTotalWork, 8);
    const ot = Math.max(0, dayTotalWork - 8);

    // Sum PTO and STAT hours for the day
    const ptoTotal = employeeRecords.reduce((sum, r) => sum + (r.pto_hours || 0), 0);
    const statTotal = employeeRecords.reduce((sum, r) => sum + (r.stat_hours || 0), 0);

    // Total day hours (work hours only, not including PTO/STAT)
    const dayTotal = dayTotalWork;

    return { dayTotal, regular, ot, pto: ptoTotal, stat: statTotal };
  };

  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        No time records found for the selected filters.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Employee</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time In</TableHead>
          <TableHead className="text-blue-600 dark:text-blue-400">Time Out</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead className="text-blue-600 dark:text-blue-400">Day Total</TableHead>
          <TableHead>Regular</TableHead>
          <TableHead className="text-orange-600 dark:text-orange-400">OT</TableHead>
          <TableHead className="text-purple-600 dark:text-purple-400">PTO</TableHead>
          <TableHead className="text-green-600 dark:text-green-400">STAT</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const employee = getEmployee(record.employee_id);
          const isLocked = record.status === 'locked';
          const dayData = calculateDayData(record, records);
          const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : record.employee_name || 'Unknown';

          // Only show day totals once per employee+date
          const dayKey = `${record.employee_name}-${record.date}`;
          const showDayTotals = !shownDayTotals.has(dayKey);
          if (showDayTotals) {
            shownDayTotals.add(dayKey);
          }

          return (
            <TableRow
              key={record.id}
              className={`text-sm ${record.status === 'error' ? 'bg-red-50 border-l-4 border-l-red-500 dark:bg-red-950/30 dark:border-l-red-600' : ''}`}
            >
              <TableCell className="text-blue-600 dark:text-blue-400 font-medium">{employeeName}</TableCell>
              <TableCell className="font-medium">{formatDate(record.date)}</TableCell>
              <TableCell>{formatTime(record.clock_in)}</TableCell>
              <TableCell className="text-blue-600 dark:text-blue-400">{formatTime(record.clock_out)}</TableCell>
              <TableCell>{record.hours > 0 ? record.hours.toFixed(2) : '-'}</TableCell>
              <TableCell className="text-blue-600 dark:text-blue-400 font-medium">
                {showDayTotals && dayData.dayTotal > 0 ? dayData.dayTotal.toFixed(2) : '-'}
              </TableCell>
              <TableCell>{showDayTotals && dayData.regular > 0 ? dayData.regular.toFixed(2) : '-'}</TableCell>
              <TableCell className="text-orange-600 dark:text-orange-400">
                {showDayTotals && dayData.ot > 0 ? dayData.ot.toFixed(2) : '-'}
              </TableCell>
              <TableCell className="text-purple-600 dark:text-purple-400">
                {record.pto_hours > 0 ? record.pto_hours.toFixed(2) : '-'}
              </TableCell>
              <TableCell className="text-green-600 dark:text-green-400">
                {record.stat_hours > 0 ? record.stat_hours.toFixed(2) : '-'}
              </TableCell>
              <TableCell>{getStatusBadge(record.status)}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(record)}
                  disabled={isLocked}
                  title={isLocked ? 'Cannot edit locked records' : 'Edit'}
                >
                  <Pencil className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
