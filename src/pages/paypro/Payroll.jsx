import React, { useState, useEffect } from "react";
import { Employee, PayrollSetting } from "@/components/paypro/lib/payrollEntities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import PaychequeCreator from "@/components/paypro/payroll/PaychequeCreator";
import BatchPaychequeProcessor from "@/components/paypro/payroll/BatchPaychequeProcessor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Users, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { importTimeData } from "@/components/paypro/payroll/TimeDataProcessor";
import { useNavigate } from "react-router-dom";

export default function Payroll() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [payPeriod, setPayPeriod] = useState({ start: '', end: '', payDate: new Date().toLocaleDateString('en-CA')});
  const [periodCloseDate, setPeriodCloseDate] = useState(null);
  const [dateValidationError, setDateValidationError] = useState('');
  const [processingMode, setProcessingMode] = useState('batch');
  const [isImportingTime, setIsImportingTime] = useState(false);
  const [importedTimeData, setImportedTimeData] = useState(null);
  const [unmatchedEmployees, setUnmatchedEmployees] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const [allEmployees, settings] = await Promise.all([
        Employee.list(),
        PayrollSetting.filter({ key: 'period_close_date' })
      ]);
      setEmployees(allEmployees.filter(e => e.status === 'active'));
      if (settings.length > 0) {
        setPeriodCloseDate(settings[0].value);
      }
    };
    loadData();
  }, []);

  const validateDates = (period) => {
    if (!periodCloseDate) {
      setDateValidationError('');
      return true;
    }

    const closeDate = new Date(periodCloseDate);
    const startDate = period.start ? new Date(period.start) : null;
    const endDate = period.end ? new Date(period.end) : null;

    const closeDatePlusOneDay = new Date(closeDate);
    closeDatePlusOneDay.setDate(closeDatePlusOneDay.getDate() + 1);

    if ((startDate && startDate < closeDatePlusOneDay) ||
        (endDate && endDate < closeDatePlusOneDay)) {
       setDateValidationError(`One or more dates fall within a closed period (on or before ${periodCloseDate}). Please select a later date.`);
       return false;
    }

    setDateValidationError('');
    return true;
  };

  const handleDateChange = (field, value) => {
      const newPayPeriod = {...payPeriod, [field]: value};
      setPayPeriod(newPayPeriod);
      validateDates(newPayPeriod);
      setImportedTimeData(null);
  };

  const handleEmployeeSelection = (employeeId, checked) => {
    setSelectedEmployeeIds(prev =>
      checked
        ? [...prev, employeeId]
        : prev.filter(id => id !== employeeId)
    );
  };

  const handleSelectAll = (checked) => {
    const eligibleEmployees = filteredEmployees.map(e => e.id);
    setSelectedEmployeeIds(checked ? eligibleEmployees : []);
  };

  const handleImportTimeEntries = async () => {
    if (!payPeriod.start || !payPeriod.end) {
      alert("Please set the pay period start and end dates before importing time entries.");
      return;
    }

    const confirmed = window.confirm(
      "Have you verified the Time Records for overlapping records, errors, and auto-clock outs?"
    );

    if (!confirmed) {
      return;
    }

    setIsImportingTime(true);

    try {
      const result = await importTimeData(
        payPeriod.start,
        payPeriod.end,
        employees
      );

      if (result.success) {
        setImportedTimeData(result.data);
        setUnmatchedEmployees(result.summary.unmatchedEmployees || []);

        const employeesWithHours = Object.keys(result.data);
        setSelectedEmployeeIds(employeesWithHours);

        alert(
          `Successfully imported time data!\n\n` +
          `📊 Summary:\n` +
          `• Time records found: ${result.summary.timeRecordsFound}\n` +
          `• Employees matched: ${result.summary.employeesMatched}\n` +
          `• Employees with hours: ${result.summary.employeesWithHours}\n\n` +
          `Employees with time entries have been automatically selected.`
        );
      } else {
        alert(`${result.error}`);
      }
    } catch (error) {
      console.error("Error importing time entries:", error);
      alert("Error importing time entries. Please try again.");
    } finally {
      setIsImportingTime(false);
    }
  };

  const filteredEmployees = employees;

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeIds[0]);
  const canShowPaycheque = selectedEmployeeIds.length > 0 && payPeriod.start && payPeriod.end && payPeriod.payDate && !dateValidationError;

  const handleBatchComplete = () => {
    setSelectedEmployeeIds([]);
    setPayPeriod({ start: '', end: '', payDate: '' });
    setProcessingMode('batch');
    setImportedTimeData(null);
    setUnmatchedEmployees([]);
  };

  const selectedEmployeeTimeData = selectedEmployee && importedTimeData ? importedTimeData[selectedEmployee.id] : null;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Run Payroll</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/paypro/TimeRecords')} className="flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" />
            Time Records
          </Button>
          <Button variant="outline" onClick={() => navigate('/paypro/PayStubs')} className="flex items-center gap-1">
            Pay Stubs
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

        <Card className="border-0 shadow-sm dark:bg-slate-900">
          <CardContent className="pt-6 space-y-6">
            <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const day = today.getDate();
                    const year = today.getFullYear();
                    const month = today.getMonth();
                    let start, end;
                    if (day <= 15) {
                      start = new Date(year, month, 1);
                      end = new Date(year, month, 15);
                    } else {
                      start = new Date(year, month, 16);
                      end = new Date(year, month + 1, 0);
                    }
                    const newPeriod = {
                      start: start.toISOString().split('T')[0],
                      end: end.toISOString().split('T')[0],
                      payDate: new Date().toLocaleDateString('en-CA')
                    };
                    setPayPeriod(newPeriod);
                    validateDates(newPeriod);
                    setImportedTimeData(null);
                  }}
                >
                  This Pay Period
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const day = today.getDate();
                    let year = today.getFullYear();
                    let month = today.getMonth();
                    let start, end;
                    if (day <= 15) {
                      // Current period is 1-15, so last period is 16-end of previous month
                      month = month - 1;
                      if (month < 0) { month = 11; year--; }
                      start = new Date(year, month, 16);
                      end = new Date(year, month + 1, 0);
                    } else {
                      // Current period is 16-end, so last period is 1-15 of current month
                      start = new Date(year, month, 1);
                      end = new Date(year, month, 15);
                    }
                    const newPeriod = {
                      start: start.toISOString().split('T')[0],
                      end: end.toISOString().split('T')[0],
                      payDate: new Date().toLocaleDateString('en-CA')
                    };
                    setPayPeriod(newPeriod);
                    validateDates(newPeriod);
                    setImportedTimeData(null);
                  }}
                >
                  Last Pay Period
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), 1);
                    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    const newPeriod = {
                      start: start.toISOString().split('T')[0],
                      end: end.toISOString().split('T')[0],
                      payDate: new Date().toLocaleDateString('en-CA')
                    };
                    setPayPeriod(newPeriod);
                    validateDates(newPeriod);
                    setImportedTimeData(null);
                  }}
                >
                  This Month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const end = new Date(today.getFullYear(), today.getMonth(), 0);
                    const newPeriod = {
                      start: start.toISOString().split('T')[0],
                      end: end.toISOString().split('T')[0],
                      payDate: new Date().toLocaleDateString('en-CA')
                    };
                    setPayPeriod(newPeriod);
                    validateDates(newPeriod);
                    setImportedTimeData(null);
                  }}
                >
                  Last Month
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Period Start *</Label>
                <Input
                  type="date"
                  value={payPeriod.start}
                  onChange={e => handleDateChange('start', e.target.value)}
                  className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Period End *</Label>
                <Input
                  type="date"
                  value={payPeriod.end}
                  onChange={e => handleDateChange('end', e.target.value)}
                  className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Date *</Label>
                <Input
                  type="date"
                  value={payPeriod.payDate}
                  onChange={e => handleDateChange('payDate', e.target.value)}
                  className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
              {dateValidationError && (
                  <div className="md:col-span-3">
                      <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                              {dateValidationError}
                          </AlertDescription>
                      </Alert>
                  </div>
              )}
            </div>
          </CardContent>
        </Card>

        {payPeriod.start && payPeriod.end && payPeriod.payDate && (
        <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
          <CardHeader>
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <CardTitle className="dark:text-slate-100">Select Employees ({filteredEmployees.length} available)</CardTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Label className="flex items-center gap-2 dark:text-slate-300">
                    <Users className="w-4 h-4" />
                    Selected: {selectedEmployeeIds.length}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedEmployeeIds.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Select All</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleImportTimeEntries}
                  disabled={isImportingTime || !payPeriod.start || !payPeriod.end || !!dateValidationError}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white"
                >
                  {isImportingTime ? (
                    <>
                      <Download className="w-4 h-4 mr-2 animate-pulse" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      {importedTimeData ? 'Re-import Time Entries' : 'Import Time Entries'}
                    </>
                  )}
                </Button>
                {(!payPeriod.start || !payPeriod.end) && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    ⚠ Set pay period dates first
                  </span>
                )}
                <div className="flex gap-2">
                  <Button
                    variant={processingMode === 'single' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setProcessingMode('single');
                      if (selectedEmployeeIds.length > 1) setSelectedEmployeeIds([selectedEmployeeIds[0]]);
                    }}
                  >
                    Single
                  </Button>
                  <Button
                    variant={processingMode === 'batch' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setProcessingMode('batch')}
                  >
                    Batch
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {importedTimeData && Object.keys(importedTimeData).length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-2">✓ Time Data Imported</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {Object.keys(importedTimeData).slice(0, 4).map(empId => {
                    const data = importedTimeData[empId];
                    const totalHours = Object.values(data.payTypes).reduce((sum, hrs) => sum + hrs, 0);
                    return (
                      <div key={empId} className="text-center">
                        <p className="font-semibold text-lg text-blue-600 dark:text-blue-400">{totalHours.toFixed(1)}h</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{data.employee.first_name}</p>
                      </div>
                    );
                  })}
                  {Object.keys(importedTimeData).length > 4 && (
                    <div className="text-center">
                      <p className="font-semibold text-lg text-slate-600 dark:text-slate-400">+{Object.keys(importedTimeData).length - 4}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">more</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* D3: visible warning when a selected employee produced zero matched
                time records - e.g. the known "Sam"/"Samantha" EMP007 WorkPRO/PayPRO
                name gap (phase_5_implementation_plan.md D3) - so it isn't missed at
                the point it would actually cost someone a paycheque. */}
            {unmatchedEmployees.length > 0 && (
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40 mb-4">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">No time records matched for:</span>{' '}
                  {unmatchedEmployees.map(e => `${e.first_name} ${e.last_name}`).join(', ')}.
                  {' '}They will show $0 hours from WorkPRO unless entered manually - check for a name mismatch between WorkPRO and PayPRO.
                </AlertDescription>
              </Alert>
            )}

            {/* No raw hex <style> checkbox override here (source lines 403-411) -
                AutoPRO's Checkbox component already renders correctly with dark:
                support out of the box (phase_5_implementation_plan.md §3, 5A note). */}
            <div className="space-y-1">
              {filteredEmployees.map(emp => (
                <div
                  key={emp.id}
                  className={`flex items-center space-x-2 py-1.5 px-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors ${selectedEmployeeIds.includes(emp.id) ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/40' : 'border-gray-200 dark:border-slate-700'}`}
                  onClick={() => {
                    const isChecked = selectedEmployeeIds.includes(emp.id);
                    if (processingMode === 'single') {
                      setSelectedEmployeeIds(isChecked ? [] : [emp.id]);
                    } else {
                      handleEmployeeSelection(emp.id, !isChecked);
                    }
                  }}
                >
                  <Checkbox
                    checked={selectedEmployeeIds.includes(emp.id)}
                    onCheckedChange={(checked) => {
                      return;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-medium dark:text-slate-100">{emp.first_name} {emp.last_name}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">• {emp.position || emp.employee_type}</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedEmployeeIds.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                Select employee(s) to create paycheque(s)
              </div>
            )}

            {selectedEmployeeIds.length > 0 && (!payPeriod.start || !payPeriod.end || !payPeriod.payDate) && (
              <div className="text-center py-8 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg mt-4">
                Please complete the payroll setup dates above to continue
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {canShowPaycheque && processingMode === 'single' && selectedEmployee && (
          <PaychequeCreator
            employee={selectedEmployee}
            payPeriod={payPeriod}
            importedTimeData={selectedEmployeeTimeData}
            onComplete={() => {
              setSelectedEmployeeIds([]);
              setPayPeriod({ start: '', end: '', payDate: '' });
              setImportedTimeData(null);
              setUnmatchedEmployees([]);
            }}
          />
        )}

        {canShowPaycheque && processingMode === 'batch' && selectedEmployeeIds.length > 0 && (
          <BatchPaychequeProcessor
            employeeIds={selectedEmployeeIds}
            employees={employees}
            payPeriod={payPeriod}
            importedTimeData={importedTimeData}
            onComplete={handleBatchComplete}
          />
        )}
      </div>
    </div>
  );
}
