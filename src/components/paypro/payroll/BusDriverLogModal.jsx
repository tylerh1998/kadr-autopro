import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Bus, 
  Upload, 
  FileText, 
  Sparkles, 
  Loader2, 
  Calendar, 
  DollarSign, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Snowflake, 
  Clock, 
  GraduationCap, 
  FileCheck 
} from "lucide-react";

// 2026 BTPS 3% Increase Pay Model Constants
const BASE_DAILY_RATE = 113.30; // $110.00 * 1.03
const TOTAL_SCHOOL_DAYS = 180;
const TOTAL_STAT_DAYS = 11;
const TOTAL_DAYS = TOTAL_SCHOOL_DAYS + TOTAL_STAT_DAYS; // 191
const ANNUAL_BASE_SALARY = 21640.30; // 191 * 113.30

const TEN_MONTH_MONTHLY_RATE = 2164.03; // 21640.30 / 10
const TWELVE_MONTH_MONTHLY_RATE = 1803.36; // 21640.30 / 12

const WINTER_PLUGIN_MONTHLY_RATE = 56.65; // Half-day rate (113.30 / 2)
const FIELD_TRIP_HOURLY_RATE = 25.00;
const FIELD_TRIP_OT_HOURLY_RATE = 37.50; // 1.5x for > 8 hrs in a day

export default function BusDriverLogModal({
  isOpen,
  onClose,
  drivers = [],
  initialDriverId = null,
  initialPayPeriod = { start: '', end: '', payDate: '' },
  onApplyCompensation,
}) {
  // Wizard step: 'upload' | 'review'
  const [currentStep, setCurrentStep] = useState('upload');
  
  // Selection state
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId || (drivers[0]?.id || ''));
  const [payPeriod, setPayPeriod] = useState(initialPayPeriod);
  
  // File upload & OCR state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [fileMimeType, setFileMimeType] = useState('application/pdf');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrSuccessNotes, setOcrSuccessNotes] = useState('');

  // Compensation model state
  const [salarySchedule, setSalarySchedule] = useState('10_month'); // '10_month' | '12_month'
  const [customBaseSalary, setCustomBaseSalary] = useState(TEN_MONTH_MONTHLY_RATE);
  
  // Winter plug-in
  const [includePlugin, setIncludePlugin] = useState(false);
  const [pluginCount, setPluginCount] = useState(1);
  
  // Field trips
  const [fieldTrips, setFieldTrips] = useState([]);
  const [newTrip, setNewTrip] = useState({
    date: '',
    description: '',
    hours: '',
    startAm: '',
    endAm: '',
    startPm: '',
    endPm: '',
    unit: '',
  });
  const [showAddTripForm, setShowAddTripForm] = useState(false);

  // Training / PD
  const [pdDays, setPdDays] = useState([]);
  const [pdAmount, setPdAmount] = useState(0);
  const [pdDescription, setPdDescription] = useState('BTPS Training / PD Day');

  // Audit context
  const [auditInfo, setAuditInfo] = useState({
    regularRunsCount: 0,
    statDaysCount: 0,
    anomalies: [],
    dateSigned: '',
    monthYearText: '',
  });

  // Archive file toggle
  const [archiveFileToEmployee, setArchiveFileToEmployee] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);

  // Auto-select initial driver if supplied
  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    } else if (drivers.length > 0 && !selectedDriverId) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [initialDriverId, drivers, selectedDriverId]);

  // Sync pay period
  useEffect(() => {
    if (initialPayPeriod?.start && initialPayPeriod?.end) {
      setPayPeriod(initialPayPeriod);
      // Auto-detect winter plug-in month (Nov, Dec, Jan, Feb, Mar)
      const periodMonth = new Date(initialPayPeriod.end || initialPayPeriod.start).getMonth() + 1;
      const isWinterMonth = [11, 12, 1, 2, 3].includes(periodMonth);
      setIncludePlugin(isWinterMonth);
    }
  }, [initialPayPeriod]);

  // Update base rate when schedule changes
  useEffect(() => {
    if (salarySchedule === '10_month') {
      setCustomBaseSalary(TEN_MONTH_MONTHLY_RATE);
    } else {
      setCustomBaseSalary(TWELVE_MONTH_MONTHLY_RATE);
    }
  }, [salarySchedule]);

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setOcrError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const mime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        setFileMimeType(mime);
        // Strip data:*;base64, prefix for Edge function payload
        const base64Data = result.split(',')[1] || result;
        setFileBase64(base64Data);
      }
    };
    reader.readAsDataURL(file);
  };

  // Perform AI OCR scan via paypro-processDriverLogOCR Edge Function
  const handleScanLogSheet = async () => {
    if (!fileBase64) {
      setOcrError("Please select a file to scan.");
      return;
    }

    setIsScanning(true);
    setOcrError(null);
    setOcrSuccessNotes('');

    try {
      const driverNameHint = selectedDriver ? `${selectedDriver.first_name} ${selectedDriver.last_name}` : '';
      const monthHint = payPeriod.start || '';

      const { data, error } = await supabase.functions.invoke('paypro-processDriverLogOCR', {
        body: {
          pdfData: fileBase64,
          mimeType: fileMimeType,
          driverNameHint,
          monthHint,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to contact OCR Edge Function");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const extracted = data?.data;
      if (!extracted) {
        throw new Error("No structured data returned from the scanner.");
      }

      // Match driver if detected name matches another driver
      if (extracted.driver_name) {
        const matched = drivers.find(d => 
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(extracted.driver_name.toLowerCase()) ||
          extracted.driver_name.toLowerCase().includes(d.first_name.toLowerCase())
        );
        if (matched) {
          setSelectedDriverId(matched.id);
        }
      }

      // Set pay period dates if year and month were extracted and payPeriod is blank
      if (extracted.year && extracted.month && (!payPeriod.start || !payPeriod.end)) {
        const y = extracted.year;
        const m = extracted.month;
        const firstDay = new Date(y, m - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
        setPayPeriod({
          start: firstDay,
          end: lastDay,
          payDate: lastDay,
        });
      }

      // Process Winter Plug-in
      const pluginCountExtracted = extracted.winter_plugin_count || 0;
      const periodMonth = extracted.month || (payPeriod.end ? new Date(payPeriod.end).getMonth() + 1 : 0);
      const isWinter = [11, 12, 1, 2, 3].includes(periodMonth);

      if (pluginCountExtracted > 0) {
        setIncludePlugin(true);
        setPluginCount(pluginCountExtracted);
      } else {
        setIncludePlugin(isWinter);
        setPluginCount(1);
      }

      // Process Field Trips
      const parsedTrips = (extracted.field_trips || []).map((t, index) => {
        const hrs = parseFloat(t.hours) || 0;
        const isOt = t.is_overtime || hrs > 8;
        return {
          id: `trip-${Date.now()}-${index}`,
          date: t.date || '',
          description: t.description || 'Field Trip',
          hours: hrs,
          timeBreakdown: t.time_breakdown || '',
          unit: t.unit_number || '',
          isOvertime: isOt,
        };
      });
      setFieldTrips(parsedTrips);

      // Process PD days
      if (extracted.pd_days && extracted.pd_days.length > 0) {
        setPdDays(extracted.pd_days);
        // Default to daily rate per PD day if found
        setPdAmount(BASE_DAILY_RATE * extracted.pd_days.length);
        setPdDescription(extracted.pd_days.map(p => `${p.date}: ${p.description}`).join('; '));
      }

      // Audit info
      setAuditInfo({
        regularRunsCount: extracted.regular_runs_count || 0,
        statDaysCount: extracted.stat_holidays_count || 0,
        anomalies: extracted.anomalies || [],
        dateSigned: extracted.date_signed || '',
        monthYearText: extracted.month_year_text || '',
      });

      setOcrSuccessNotes(
        `✓ Successfully parsed log for ${extracted.driver_name || 'driver'} (${extracted.month_year_text || 'Month'}). ` +
        `Found ${parsedTrips.length} field trip(s)${pluginCountExtracted > 0 ? `, ${pluginCountExtracted} cord charging(s)` : ''}.`
      );

      // Transition to review step
      setCurrentStep('review');
    } catch (err) {
      console.error("OCR Scanning Error:", err);
      setOcrError(err.message || "Failed to scan driver log sheet.");
    } finally {
      setIsScanning(false);
    }
  };

  // Helper to calculate hours from times
  const calculateElapsedHours = (start, end) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return totalMinutes > 0 ? parseFloat((totalMinutes / 60).toFixed(2)) : 0;
  };

  const handleAddTrip = () => {
    let hours = parseFloat(newTrip.hours);
    if (!hours || isNaN(hours)) {
      // Calculate from AM and PM times
      const amHours = calculateElapsedHours(newTrip.startAm, newTrip.endAm);
      const pmHours = calculateElapsedHours(newTrip.startPm, newTrip.endPm);
      hours = parseFloat((amHours + pmHours).toFixed(2));
    }

    if (!newTrip.description || !hours || hours <= 0) {
      alert("Please provide a trip description and valid hours.");
      return;
    }

    const timeBreakdown = [
      newTrip.startAm && newTrip.endAm ? `AM: ${newTrip.startAm}-${newTrip.endAm}` : '',
      newTrip.startPm && newTrip.endPm ? `PM: ${newTrip.startPm}-${newTrip.endPm}` : '',
    ].filter(Boolean).join(', ');

    setFieldTrips(prev => [
      ...prev,
      {
        id: `trip-manual-${Date.now()}`,
        date: newTrip.date || payPeriod.start || new Date().toISOString().split('T')[0],
        description: newTrip.description,
        hours: hours,
        timeBreakdown: timeBreakdown,
        unit: newTrip.unit,
        isOvertime: hours > 8,
      }
    ]);

    setNewTrip({
      date: '',
      description: '',
      hours: '',
      startAm: '',
      endAm: '',
      startPm: '',
      endPm: '',
      unit: '',
    });
    setShowAddTripForm(false);
  };

  const handleDeleteTrip = (tripId) => {
    setFieldTrips(prev => prev.filter(t => t.id !== tripId));
  };

  // Financial calculations
  const baseSalaryAmount = Number(customBaseSalary) || 0;
  
  const pluginAmount = includePlugin ? (WINTER_PLUGIN_MONTHLY_RATE * (Number(pluginCount) || 1)) : 0;

  // Split trips into regular (< 8h/day) vs overtime (> 8h/day)
  let totalRegTripHours = 0;
  let totalOtTripHours = 0;

  fieldTrips.forEach(trip => {
    const hrs = Number(trip.hours) || 0;
    if (hrs <= 8) {
      totalRegTripHours += hrs;
    } else {
      totalRegTripHours += 8;
      totalOtTripHours += (hrs - 8);
    }
  });

  const regTripPay = parseFloat((totalRegTripHours * FIELD_TRIP_HOURLY_RATE).toFixed(2));
  const otTripPay = parseFloat((totalOtTripHours * FIELD_TRIP_OT_HOURLY_RATE).toFixed(2));
  const totalTripPay = parseFloat((regTripPay + otTripPay).toFixed(2));

  const totalPdPay = Number(pdAmount) || 0;

  const totalGrossCompensation = parseFloat(
    (baseSalaryAmount + pluginAmount + totalTripPay + totalPdPay).toFixed(2)
  );

  // Apply to Payroll
  const handleApplyToPayroll = async () => {
    if (!selectedDriver) {
      alert("Please select a bus driver.");
      return;
    }

    if (!payPeriod.start || !payPeriod.end) {
      alert("Please ensure the pay period dates are set.");
      return;
    }

    // Optionally archive timesheet to PayPro_EmployeeFile
    if (archiveFileToEmployee && fileBase64 && selectedFile) {
      setIsArchiving(true);
      try {
        const fullDataUrl = `data:application/pdf;base64,${fileBase64}`;
        const fileName = `DriverLog_${selectedDriver.last_name}_${payPeriod.end || 'Period'}.pdf`;
        
        await supabase.functions.invoke('paypro-uploadEmployeeFile', {
          body: {
            employee_id: selectedDriver.id,
            file_content: fullDataUrl,
            file_name: fileName,
            document_date: payPeriod.end || new Date().toISOString().split('T')[0],
            notes: `Duty Record Timesheet processed via Bus Driver OCR for period ${payPeriod.start} to ${payPeriod.end}. Gross Compensation: $${totalGrossCompensation.toFixed(2)}.`,
          },
        });
      } catch (uploadErr) {
        console.warn("Could not archive file to employee profile:", uploadErr);
      } finally {
        setIsArchiving(false);
      }
    }

    // Build line items for PaychequeForm
    const directLineItems = [
      {
        id: `route-salary-${selectedDriver.id}`,
        type: `Route Salary (${salarySchedule === '10_month' ? '10-Mo' : '12-Mo'})`,
        hours: 1,
        rate: baseSalaryAmount,
        unit: 'Month',
        amount: baseSalaryAmount,
      }
    ];

    if (includePlugin && pluginAmount > 0) {
      directLineItems.push({
        id: `plugin-${selectedDriver.id}`,
        type: 'Winter Plug-in',
        hours: Number(pluginCount) || 1,
        rate: WINTER_PLUGIN_MONTHLY_RATE,
        unit: 'Month',
        amount: pluginAmount,
      });
    }

    if (totalRegTripHours > 0) {
      directLineItems.push({
        id: `field-trips-reg-${selectedDriver.id}`,
        type: 'Field Trips (Reg)',
        hours: parseFloat(totalRegTripHours.toFixed(2)),
        rate: FIELD_TRIP_HOURLY_RATE,
        unit: 'Hour',
        amount: regTripPay,
      });
    }

    if (totalOtTripHours > 0) {
      directLineItems.push({
        id: `field-trips-ot-${selectedDriver.id}`,
        type: 'Field Trips (Overtime)',
        hours: parseFloat(totalOtTripHours.toFixed(2)),
        rate: FIELD_TRIP_OT_HOURLY_RATE,
        unit: 'Hour',
        amount: otTripPay,
      });
    }

    if (totalPdPay > 0) {
      directLineItems.push({
        id: `training-pd-${selectedDriver.id}`,
        type: 'Training & PD (BTPS)',
        hours: 1,
        rate: totalPdPay,
        unit: 'Flat',
        amount: totalPdPay,
      });
    }

    // Callback to parent Payroll component
    onApplyCompensation({
      driver: selectedDriver,
      payPeriod,
      directLineItems,
      totalGross: totalGrossCompensation,
      summary: {
        baseSalary: baseSalaryAmount,
        pluginAmount,
        totalTripPay,
        totalPdPay,
        fieldTripsCount: fieldTrips.length,
      }
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-950/50 rounded-lg">
                <Bus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold dark:text-slate-100 flex items-center gap-2">
                  Bus Driver Duty Record & Pay Tool
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400">
                    BTPS 3.0% Pay Model
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs dark:text-slate-400">
                  Scan handwritten monthly Driver Duty Records with Gemini Vision or calculate compensation manually.
                </DialogDescription>
              </div>
            </div>
            {currentStep === 'review' && (
              <Button variant="outline" size="sm" onClick={() => setCurrentStep('upload')} className="text-xs">
                ← Re-Scan / Change File
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Global Driver & Date Selector Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Driver</Label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="mt-1 w-full text-sm rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.last_name} ({d.employee_id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Period Start</Label>
            <Input
              type="date"
              value={payPeriod.start}
              onChange={(e) => setPayPeriod(prev => ({ ...prev, start: e.target.value }))}
              className="mt-1 h-8 text-xs dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Period End</Label>
            <Input
              type="date"
              value={payPeriod.end}
              onChange={(e) => {
                const endVal = e.target.value;
                setPayPeriod(prev => ({ ...prev, end: endVal, payDate: prev.payDate || endVal }));
                const month = new Date(endVal).getMonth() + 1;
                setIncludePlugin([11, 12, 1, 2, 3].includes(month));
              }}
              className="mt-1 h-8 text-xs dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
            />
          </div>
        </div>

        {/* STEP 1: UPLOAD & OCR SCAN */}
        {currentStep === 'upload' && (
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-blue-200 dark:border-blue-900/60 rounded-xl p-6 text-center bg-blue-50/40 dark:bg-blue-950/10 hover:bg-blue-50/70 transition-colors">
              <Upload className="w-10 h-10 mx-auto text-blue-500 dark:text-blue-400 mb-2" />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Upload Scanned Driver Duty Record
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
                Upload a PDF scan or photo of the monthly log sheet. Gemini AI reads handwritten routes, field trips, swim lessons, cord charging, and PD notes.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <input
                  id="driver-log-file-input"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('driver-log-file-input')?.click()}
                  className="bg-white dark:bg-slate-800"
                >
                  <FileText className="w-4 h-4 mr-2 text-slate-600 dark:text-slate-400" />
                  {selectedFile ? selectedFile.name : "Select PDF / Image"}
                </Button>

                <Button
                  onClick={handleScanLogSheet}
                  disabled={!selectedFile || isScanning}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning Handwriting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Scan Log with AI
                    </>
                  )}
                </Button>
              </div>

              {selectedFile && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                  File selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {ocrError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{ocrError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between pt-2 border-t dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Prefer to enter numbers by hand without scanning?
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep('review')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Skip to Manual Compensation Calculator →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & CALCULATE COMPENSATION */}
        {currentStep === 'review' && (
          <div className="space-y-4 py-2">
            {ocrSuccessNotes && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{ocrSuccessNotes}</span>
              </div>
            )}

            {/* 1. Guaranteed Fixed Route Salary */}
            <Card className="border dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="py-3 px-4 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-sm font-bold dark:text-slate-100">
                      1. Guaranteed Fixed Route Salary (3.0% Raise)
                    </CardTitle>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Annual: ${ANNUAL_BASE_SALARY.toLocaleString('en-CA', { minimumFractionDigits: 2 })} (191 days @ ${BASE_DAILY_RATE}/day)
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <RadioGroup 
                  value={salarySchedule} 
                  onValueChange={setSalarySchedule}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <div className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${salarySchedule === '10_month' ? 'bg-blue-50/60 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="10_month" id="opt_10_month" />
                      <Label htmlFor="opt_10_month" className="cursor-pointer">
                        <div className="font-semibold text-sm dark:text-slate-200">10-Month Distribution</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Paid Sept – June (School Year)</div>
                      </Label>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-blue-700 dark:text-blue-300">${TEN_MONTH_MONTHLY_RATE.toFixed(2)}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">/mo</span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${salarySchedule === '12_month' ? 'bg-blue-50/60 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="12_month" id="opt_12_month" />
                      <Label htmlFor="opt_12_month" className="cursor-pointer">
                        <div className="font-semibold text-sm dark:text-slate-200">12-Month Distribution</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Even year-round (July & Aug included)</div>
                      </Label>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-blue-700 dark:text-blue-300">${TWELVE_MONTH_MONTHLY_RATE.toFixed(2)}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">/mo</span>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* 2. Winter Plug-in / Cord Charging */}
            <Card className="border dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="py-3 px-4 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Snowflake className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <CardTitle className="text-sm font-bold dark:text-slate-100">
                      2. Winter Plug-in / Cord Charging (Nov – Mar)
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-950/30 dark:text-cyan-400">
                    Half-Day Rate: ${WINTER_PLUGIN_MONTHLY_RATE}/mo
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="plugin-toggle"
                      checked={includePlugin}
                      onCheckedChange={setIncludePlugin}
                    />
                    <div>
                      <Label htmlFor="plugin-toggle" className="font-semibold text-sm cursor-pointer dark:text-slate-200">
                        Include Winter Plug-in for this period
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Weather-dependent block heater allowance between November and March.
                      </p>
                    </div>
                  </div>

                  {includePlugin && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs dark:text-slate-300">Quantity:</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={pluginCount}
                        onChange={(e) => setPluginCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 h-8 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      />
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        = ${pluginAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 3. Field Trips ($25.00/hr, OT > 8hr @ $37.50) */}
            <Card className="border dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="py-3 px-4 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <CardTitle className="text-sm font-bold dark:text-slate-100">
                      3. Field Trips & Extra Runs ($25.00/hr drive + wait time)
                    </CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddTripForm(!showAddTripForm)}
                    className="text-xs h-7 gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Trip
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* Add trip mini-form */}
                {showAddTripForm && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3 mb-3">
                    <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      Add Field Trip / Special Run
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">Date</Label>
                        <Input
                          type="date"
                          value={newTrip.date}
                          onChange={e => setNewTrip({ ...newTrip, date: e.target.value })}
                          className="h-7 text-xs dark:bg-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">Description / Destination</Label>
                        <Input
                          placeholder="e.g. Ski Trip, Swim Lessons, Vermilion Auction Mart"
                          value={newTrip.description}
                          onChange={e => setNewTrip({ ...newTrip, description: e.target.value })}
                          className="h-7 text-xs dark:bg-slate-800"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">AM Start - End</Label>
                        <div className="flex gap-1">
                          <Input
                            placeholder="09:00"
                            value={newTrip.startAm}
                            onChange={e => setNewTrip({ ...newTrip, startAm: e.target.value })}
                            className="h-7 text-xs dark:bg-slate-800 px-1"
                          />
                          <Input
                            placeholder="10:30"
                            value={newTrip.endAm}
                            onChange={e => setNewTrip({ ...newTrip, endAm: e.target.value })}
                            className="h-7 text-xs dark:bg-slate-800 px-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">PM Start - End</Label>
                        <div className="flex gap-1">
                          <Input
                            placeholder="14:00"
                            value={newTrip.startPm}
                            onChange={e => setNewTrip({ ...newTrip, startPm: e.target.value })}
                            className="h-7 text-xs dark:bg-slate-800 px-1"
                          />
                          <Input
                            placeholder="16:30"
                            value={newTrip.endPm}
                            onChange={e => setNewTrip({ ...newTrip, endPm: e.target.value })}
                            className="h-7 text-xs dark:bg-slate-800 px-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">Total Hours (or auto)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 4.5"
                          value={newTrip.hours}
                          onChange={e => setNewTrip({ ...newTrip, hours: e.target.value })}
                          className="h-7 text-xs dark:bg-slate-800"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button size="sm" onClick={handleAddTrip} className="h-7 text-xs bg-blue-600 text-white w-full">
                          Save Trip
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table of trips */}
                {fieldTrips.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500">
                    No field trips recorded for this month.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden dark:border-slate-800">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-800/40">
                        <TableRow className="text-xs">
                          <TableHead className="w-24">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-24 text-right">Hours</TableHead>
                          <TableHead className="w-28 text-right">Rate</TableHead>
                          <TableHead className="w-28 text-right">Subtotal</TableHead>
                          <TableHead className="w-12 text-center"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs">
                        {fieldTrips.map(trip => {
                          const hrs = Number(trip.hours) || 0;
                          const isOt = trip.isOvertime || hrs > 8;
                          const subtotal = isOt 
                            ? (8 * FIELD_TRIP_HOURLY_RATE + (hrs - 8) * FIELD_TRIP_OT_HOURLY_RATE)
                            : (hrs * FIELD_TRIP_HOURLY_RATE);

                          return (
                            <TableRow key={trip.id} className="dark:border-slate-800">
                              <TableCell className="font-mono text-slate-600 dark:text-slate-400">{trip.date}</TableCell>
                              <TableCell>
                                <span className="font-medium dark:text-slate-200">{trip.description}</span>
                                {trip.timeBreakdown && (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                                    {trip.timeBreakdown} {trip.unit ? `• Unit ${trip.unit}` : ''}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {hrs.toFixed(2)}h
                                {isOt && (
                                  <Badge variant="destructive" className="ml-1 text-[10px] py-0 px-1">OT</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-slate-500 dark:text-slate-400">
                                {isOt ? '$25 reg / $37.50 OT' : '$25.00/h'}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">
                                ${subtotal.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteTrip(trip.id)}
                                  className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {fieldTrips.length > 0 && (
                  <div className="flex justify-end items-center gap-4 text-xs pt-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      Total Trip Time: <strong>{(totalRegTripHours + totalOtTripHours).toFixed(2)} hrs</strong>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      Total Trip Pay: ${totalTripPay.toFixed(2)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Training & Professional Development */}
            <Card className="border dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="py-3 px-4 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <CardTitle className="text-sm font-bold dark:text-slate-100">
                      4. Training & Professional Development (Pass-through from BTPS)
                    </CardTitle>
                  </div>
                  {pdDays.length > 0 && (
                    <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/30 dark:text-indigo-400">
                      {pdDays.length} PD Day(s) Detected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs dark:text-slate-300">Description / Date</Label>
                    <Input
                      value={pdDescription}
                      onChange={(e) => setPdDescription(e.target.value)}
                      placeholder="e.g. March 27 PD Day / First Aid Certification"
                      className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs dark:text-slate-300">BTPS Payout Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pdAmount}
                      onChange={(e) => setPdAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 5. Audit & Compliance Context */}
            {auditInfo.anomalies.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Route Notes & Weather Closures (from sheet):
                </div>
                {auditInfo.anomalies.map((a, idx) => (
                  <div key={idx} className="text-amber-700 dark:text-amber-400 pl-5 list-disc">
                    • {a}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Final Summary Banner */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/60 dark:border-blue-800/40 pb-2">
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  Compensation Summary for {selectedDriver?.first_name} {selectedDriver?.last_name}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  GL Account: 5009 (Bus Driver Wages)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Base Route:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">${baseSalaryAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Winter Plug-in:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">${pluginAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Field Trips:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">${totalTripPay.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Training & PD:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">${totalPdPay.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-blue-200/60 dark:border-blue-800/40">
                <div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 block">Total Gross Compensation</span>
                  <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                    ${totalGrossCompensation.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        id="archive-file-checkbox"
                        checked={archiveFileToEmployee}
                        onChange={(e) => setArchiveFileToEmployee(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <Label htmlFor="archive-file-checkbox" className="text-xs cursor-pointer">
                        Archive PDF to Employee File
                      </Label>
                    </div>
                  )}

                  <Button
                    onClick={handleApplyToPayroll}
                    disabled={isArchiving}
                    className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 font-semibold px-5"
                  >
                    {isArchiving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Archiving...
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4 mr-2" />
                        Apply to Paycheque →
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
