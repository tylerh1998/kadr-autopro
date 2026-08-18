import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Employee as PayProEmployee } from '@/components/paypro/lib/payrollEntities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, RefreshCw, Lock, History, Plus, FileText, ShieldAlert } from 'lucide-react';
import TimeRecordsList from '@/components/paypro/timerecords/TimeRecordsList';
import AddTimeRecordModal from '@/components/paypro/timerecords/AddTimeRecordModal';
import EditTimeRecordModal from '@/components/paypro/timerecords/EditTimeRecordModal';
import LockPeriodModal from '@/components/paypro/timerecords/LockPeriodModal';
import PrevPayPeriodsModal from '@/components/paypro/timerecords/PrevPayPeriodsModal';
import TimeReportModal from '@/components/paypro/timerecords/TimeReportModal';
import ValidationNotices from '@/components/paypro/timerecords/ValidationNotices';

export default function TimeRecords() {
  const { employee } = useAuth();

  // Access gate (paypro_user) - RLS can't provide one here without breaking
  // WorkPRO's own live clock-in/out, which reads/writes this same table for
  // every non-payroll technician. See phase_4_implementation_plan.md Q1.
  const [hasAccess, setHasAccess] = useState(false);
  const [gateLoading, setGateLoading] = useState(true);
  const isAdmin = employee?.admin === true;

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [validationNotices, setValidationNotices] = useState([]);

  // Filters
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Fetching
  const [isFetching, setIsFetching] = useState(false);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [prevPeriodsModalOpen, setPrevPeriodsModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    if (!employee) return;
    if (employee.paypro_user === true) setHasAccess(true);
    setGateLoading(false);
  }, [employee]);

  useEffect(() => {
    if (!hasAccess) return;
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const loadInitialData = async () => {
    try {
      const emps = await PayProEmployee.list();
      setEmployees(emps.filter((e) => e.status === 'active'));
      setQuickDate('thisPayPeriod');
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    if (!dateRange.start || !dateRange.end) {
      alert('Please select a date range to fetch time records.');
      return;
    }

    setIsFetching(true);
    try {
      // Direct native query, replacing the deleted getSupabaseTimeRecords
      // proxy function. -06:00 fixed offset preserved exactly (§0.2).
      const { data, error } = await supabase
        .from('TimeRecord')
        .select('*')
        .gte('clock_in_time', `${dateRange.start}T00:00:00-06:00`)
        .lte('clock_in_time', `${dateRange.end}T23:59:59-06:00`);

      if (error) throw error;

      const transformedRecords = (data || []).map((record) => {
        const payproEmployee = employees.find(
          (e) => `${e.first_name} ${e.last_name}` === record.employee_name || e.employee_id === record.employee_name
        );

        let recordDate = '';
        if (record.clock_in_time) {
          const mtDate = new Date(record.clock_in_time);
          recordDate = mtDate.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
        }

        return {
          id: record.id,
          employee_id: payproEmployee?.employee_id || record.employee_name,
          employee_name: record.employee_name,
          date: recordDate,
          hours: record.total_hours ? parseFloat(record.total_hours) : 0,
          pto_hours: record.pto_hours || 0,
          stat_hours: record.stat_hours || 0,
          status: record.status || 'pending',
          notes: record.notes || '',
          clock_in: record.clock_in_time,
          clock_out: record.clock_out_time,
        };
      });

      let filteredRecords = transformedRecords;
      if (isAdmin && selectedEmployee !== 'all') {
        filteredRecords = transformedRecords.filter((r) => {
          const emp = employees.find((e) => e.employee_id === selectedEmployee || e.id === selectedEmployee);
          if (!emp) return false;
          return `${emp.first_name} ${emp.last_name}` === r.employee_name || emp.employee_id === r.employee_name;
        });
      }

      if (!isAdmin) {
        // Known gap (Q3): a WorkPRO clock-in name that doesn't exactly match
        // this employee's PayPro_Employee first/last name resolves to zero
        // records here - matches source behavior exactly, not fixed in this phase.
        const userEmployee = employees.find(
          (e) => e.email === employee?.email || e.kadr_email === employee?.email
        );
        if (userEmployee) {
          filteredRecords = transformedRecords.filter(
            (r) =>
              r.employee_name === `${userEmployee.first_name} ${userEmployee.last_name}` ||
              r.employee_name === userEmployee.employee_id
          );
        } else {
          filteredRecords = [];
        }
      }

      filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      setRecords(filteredRecords);
      checkForOverlaps(filteredRecords);
    } catch (error) {
      console.error('Error fetching time records:', error);
      alert('Error fetching time records: ' + error.message);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (dateRange.start && dateRange.end && employees.length > 0) {
      fetchRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedEmployee, employees]);

  const checkForOverlaps = (recordsToCheck) => {
    const notices = [];
    const overlaps = [];
    const errorRecords = [];

    recordsToCheck.forEach((record) => {
      if (record.status === 'error') {
        errorRecords.push({
          employee: record.employee_name,
          date: record.date,
          notes: record.notes || 'No details provided',
        });
      }
    });

    const recordsByEmployeeDate = {};

    recordsToCheck.forEach((record) => {
      if (!record.clock_in || !record.clock_out) return;

      const key = `${record.employee_name}-${record.date}`;
      if (!recordsByEmployeeDate[key]) {
        recordsByEmployeeDate[key] = [];
      }
      recordsByEmployeeDate[key].push(record);
    });

    Object.entries(recordsByEmployeeDate).forEach(([, dayRecords]) => {
      if (dayRecords.length < 2) return;

      for (let i = 0; i < dayRecords.length; i++) {
        for (let j = i + 1; j < dayRecords.length; j++) {
          const r1 = dayRecords[i];
          const r2 = dayRecords[j];

          const start1 = new Date(r1.clock_in);
          const end1 = new Date(r1.clock_out);
          const start2 = new Date(r2.clock_in);
          const end2 = new Date(r2.clock_out);

          const hasOverlap = start1 < end2 && end1 > start2;

          if (hasOverlap) {
            overlaps.push({
              employee: r1.employee_name,
              date: r1.date,
              record1: `${start1.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end1.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
              record2: `${start2.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end2.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
            });
          }
        }
      }
    });

    if (errorRecords.length > 0) {
      notices.push({
        title: 'Error Status Records Detected',
        message: `Found ${errorRecords.length} time ${errorRecords.length === 1 ? 'record' : 'records'} with error status.`,
        details: errorRecords.map((e) => `${e.employee} on ${e.date}: ${e.notes}`),
      });
    }

    if (overlaps.length > 0) {
      notices.push({
        title: 'Overlapping Time Records Detected',
        message: `Found ${overlaps.length} overlapping time ${overlaps.length === 1 ? 'record' : 'records'}.`,
        details: overlaps.map((o) => `${o.employee} on ${o.date}: ${o.record1} overlaps with ${o.record2}`),
      });
    }

    setValidationNotices(notices);
  };

  const setQuickDate = (type) => {
    const today = new Date();
    let start, end;

    switch (type) {
      case 'thisPayPeriod': {
        const day = today.getDate();
        const year = today.getFullYear();
        const month = today.getMonth();
        if (day <= 15) {
          start = new Date(year, month, 1);
          end = new Date(year, month, 15);
        } else {
          start = new Date(year, month, 16);
          end = new Date(year, month + 1, 0);
        }
        break;
      }
      case 'lastPayPeriod': {
        const day = today.getDate();
        let year = today.getFullYear();
        let month = today.getMonth();
        if (day <= 15) {
          month = month - 1;
          if (month < 0) {
            month = 11;
            year--;
          }
          start = new Date(year, month, 16);
          end = new Date(year, month + 1, 0);
        } else {
          start = new Date(year, month, 1);
          end = new Date(year, month, 15);
        }
        break;
      }
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      default:
        return;
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  // Calculate summary - use unique employee+date to avoid double counting
  const seenDays = new Set();
  let regularHours = 0;
  let overtimeHours = 0;

  records.forEach((r) => {
    const dayKey = `${r.employee_name}-${r.date}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      const dayRecords = records.filter((rec) => rec.employee_name === r.employee_name && rec.date === r.date);
      const dayTotalWork = dayRecords.reduce((sum, rec) => {
        if (rec.pto_hours > 0 || rec.stat_hours > 0) return sum;
        return sum + (rec.hours || 0);
      }, 0);
      regularHours += Math.min(dayTotalWork, 8);
      overtimeHours += Math.max(0, dayTotalWork - 8);
    }
  });

  const ptoHours = records.reduce((sum, r) => sum + (r.pto_hours || 0), 0);
  const statHours = records.reduce((sum, r) => sum + (r.stat_hours || 0), 0);

  if (gateLoading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading...</div>;

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-300">Access Restricted</h1>
          <p className="text-slate-500 mt-2 dark:text-slate-400">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Time Records</h1>
          <p className="text-slate-600 dark:text-slate-400">View time records from WorkPRO.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetchRecords} disabled={isFetching || !dateRange.start || !dateRange.end} variant="outline">
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setPrevPeriodsModalOpen(true)}>
                <History className="w-4 h-4 mr-2" />
                Previous Periods
              </Button>
              <Button
                variant="outline"
                onClick={() => setLockModalOpen(true)}
                className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30"
              >
                <Lock className="w-4 h-4 mr-2" />
                Lock Period
              </Button>
              <Button variant="outline" onClick={() => setReportModalOpen(true)}>
                <FileText className="w-4 h-4 mr-2" />
                Report
              </Button>
            </>
          )}
          <Button onClick={() => setAddModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Time Record
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Filters</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickDate('thisPayPeriod')}>
                This Pay Period
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDate('lastPayPeriod')}>
                Last Pay Period
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDate('thisMonth')}>
                This Month
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDate('lastMonth')}>
                Last Month
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isAdmin && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="All employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.employee_id || emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Notices */}
      <ValidationNotices notices={validationNotices} />

      {/* Hours Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-950/60 rounded-full">
                <Clock className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Regular</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{regularHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/60 rounded-full">
                <Clock className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Overtime</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{overtimeHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-950/60 rounded-full">
                <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">PTO</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{ptoHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-950/60 rounded-full">
                <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">STAT</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{statHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Records List */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Time Records ({records.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isFetching ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <TimeRecordsList
              records={records}
              employees={employees}
              onEdit={(record) => {
                setEditingRecord(record);
                setEditModalOpen(true);
              }}
              isAdmin={isAdmin}
            />
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <AddTimeRecordModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        employees={employees}
        currentEmployee={employee}
        onSave={fetchRecords}
      />

      <EditTimeRecordModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingRecord(null);
        }}
        record={editingRecord}
        employees={employees}
        onSave={fetchRecords}
      />

      {isAdmin && (
        <>
          <LockPeriodModal
            isOpen={lockModalOpen}
            onClose={() => setLockModalOpen(false)}
            onLock={() => fetchRecords()}
            records={records}
            initialDateRange={dateRange}
            currentEmployee={employee}
          />
          <PrevPayPeriodsModal isOpen={prevPeriodsModalOpen} onClose={() => setPrevPeriodsModalOpen(false)} />
          <TimeReportModal isOpen={reportModalOpen} onClose={() => setReportModalOpen(false)} employees={employees} />
        </>
      )}
    </div>
  );
}
