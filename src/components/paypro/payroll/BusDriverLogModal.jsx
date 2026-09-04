import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { EmployeePayType } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Bus, 
  Upload, 
  FileText, 
  Sparkles, 
  Loader2, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Snowflake, 
  Clock, 
  GraduationCap, 
  FileCheck,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Columns,
  Square,
  MessageSquare
} from "lucide-react";

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
  
  // View mode: 'split' (side-by-side) | 'form' | 'doc'
  const [viewMode, setViewMode] = useState('split');

  // Selection state
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId || (drivers[0]?.id || ''));
  const [payPeriod, setPayPeriod] = useState(initialPayPeriod);
  
  // Profile pay types for the selected driver
  const [driverPayTypes, setDriverPayTypes] = useState([]);
  const [loadingPayTypes, setLoadingPayTypes] = useState(false);

  // File upload & OCR state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [fileMimeType, setFileMimeType] = useState('application/pdf');
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrSuccessNotes, setOcrSuccessNotes] = useState('');

  // Winter plug-in ($56.65 half-day rate by default, routed to Misc Pay)
  const [includePlugin, setIncludePlugin] = useState(false);
  const [pluginRate, setPluginRate] = useState(56.65);
  const [pluginCount, setPluginCount] = useState(1);
  
  // Field trips (routed to Field Trip and Overtime)
  const [fieldTrips, setFieldTrips] = useState([]);
  const [newTrip, setNewTrip] = useState({
    date: '',
    description: '',
    startTime: '',
    endTime: '',
    drivingNotes: '',
    hours: '',
    unit: '',
  });
  const [showAddTripForm, setShowAddTripForm] = useState(false);

  // Training / PD (manual entry from BTPS invoice, routed to Misc Pay)
  const [pdAmount, setPdAmount] = useState(0);
  const [pdNotes, setPdNotes] = useState('');
  const [ocrPdObservations, setOcrPdObservations] = useState([]);

  // Audit context from OCR
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

  // Fetch the selected driver's configured pay types from their employee profile
  const fetchDriverPayTypes = useCallback(async (driverId) => {
    if (!driverId) return;
    setLoadingPayTypes(true);
    try {
      const types = await EmployeePayType.filter({ employee_id_ref: driverId });
      setDriverPayTypes(types || []);
    } catch (err) {
      console.warn("Error fetching driver profile pay types:", err);
      setDriverPayTypes([]);
    } finally {
      setLoadingPayTypes(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDriverId) {
      fetchDriverPayTypes(selectedDriverId);
    }
  }, [selectedDriverId, fetchDriverPayTypes]);

  // Auto-select initial driver if supplied
  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    } else if (drivers.length > 0 && !selectedDriverId) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [initialDriverId, drivers, selectedDriverId]);

  // Sync pay period & auto-detect winter months (Nov–Mar)
  useEffect(() => {
    if (initialPayPeriod?.start && initialPayPeriod?.end) {
      setPayPeriod(initialPayPeriod);
      const periodMonth = new Date(initialPayPeriod.end || initialPayPeriod.start).getMonth() + 1;
      const isWinterMonth = [11, 12, 1, 2, 3].includes(periodMonth);
      setIncludePlugin(isWinterMonth);
    }
  }, [initialPayPeriod]);

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];

  // Lookups on driver's profile pay types
  const salaryPayType = driverPayTypes.find(pt => pt.pay_type_name?.toLowerCase() === 'salary');
  const fieldTripPayType = driverPayTypes.find(pt => pt.pay_type_name?.toLowerCase() === 'field trip');
  const overtimePayType = driverPayTypes.find(pt => pt.pay_type_name?.toLowerCase() === 'overtime');
  const miscPayType = driverPayTypes.find(pt => pt.pay_type_name?.toLowerCase() === 'misc pay');

  const salaryRate = salaryPayType?.rate ?? 1803.36;
  const fieldTripRate = fieldTripPayType?.rate ?? 25.00;
  const overtimeRate = overtimePayType?.rate ?? 37.50;

  // Handle file selection and preview creation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setOcrError(null);

    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const mime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        setFileMimeType(mime);
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

      // Auto-match driver
      if (extracted.driver_name) {
        const matched = drivers.find(d => 
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(extracted.driver_name.toLowerCase()) ||
          extracted.driver_name.toLowerCase().includes(d.first_name.toLowerCase())
        );
        if (matched) {
          setSelectedDriverId(matched.id);
        }
      }

      // Sync period
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

      // Plug-in auto-detection
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

      // Map parsed field trips with continuous elapsed duration
      const parsedTrips = (extracted.field_trips || []).map((t, index) => {
        const hrs = parseFloat(t.hours) || 0;
        const isOt = t.is_overtime || hrs > 8;
        const timeBreakdown = t.time_breakdown || (t.start_time && t.end_time ? `${t.start_time} - ${t.end_time}` : '');
        return {
          id: `trip-${Date.now()}-${index}`,
          date: t.date || '',
          description: t.description || 'Field Trip',
          startTime: t.start_time || '',
          endTime: t.end_time || '',
          drivingIntervals: t.driving_intervals || '',
          timeBreakdown: timeBreakdown,
          hours: hrs,
          unit: t.unit_number || '',
          isOvertime: isOt,
        };
      });
      setFieldTrips(parsedTrips);

      // PD days are kept informational only - DO NOT auto-calculate dollars
      if (extracted.pd_days && extracted.pd_days.length > 0) {
        setOcrPdObservations(extracted.pd_days);
      }

      setAuditInfo({
        regularRunsCount: extracted.regular_runs_count || 0,
        statDaysCount: extracted.stat_holidays_count || 0,
        anomalies: extracted.anomalies || [],
        dateSigned: extracted.date_signed || '',
        monthYearText: extracted.month_year_text || '',
      });

      setOcrSuccessNotes(
        `✓ Scanned log for ${extracted.driver_name || 'driver'} (${extracted.month_year_text || 'Month'}). ` +
        `Found ${parsedTrips.length} field trip(s)${pluginCountExtracted > 0 ? `, ${pluginCountExtracted} cord charging(s)` : ''}.`
      );

      // Transition to side-by-side review
      setCurrentStep('review');
      setViewMode('split');
    } catch (err) {
      console.error("OCR Scanning Error:", err);
      setOcrError(err.message || "Failed to scan driver log sheet.");
    } finally {
      setIsScanning(false);
    }
  };

  // Helper: calculate continuous elapsed time between departure and return (handling wait time)
  const parseTimeToMinutes = (tStr) => {
    if (!tStr) return null;
    const clean = tStr.trim().toLowerCase();
    const isPm = clean.includes('pm') || clean.includes('p.m.');
    const isAm = clean.includes('am') || clean.includes('a.m.');
    const digitsOnly = clean.replace(/[^\d:]/g, '');
    const parts = digitsOnly.split(':');
    if (!parts[0]) return null;
    let h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    return h * 60 + m;
  };

  const calculateContinuousSpanHours = (startStr, endStr) => {
    let m1 = parseTimeToMinutes(startStr);
    let m2 = parseTimeToMinutes(endStr);
    if (m1 === null || m2 === null) return 0;
    if (m2 < m1 && m2 + 720 > m1) {
      m2 += 720;
    }
    const diff = m2 - m1;
    return diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 0;
  };

  const handleAddTrip = () => {
    let hours = parseFloat(newTrip.hours);
    if (!hours || isNaN(hours)) {
      hours = calculateContinuousSpanHours(newTrip.startTime, newTrip.endTime);
    }

    if (!newTrip.description || !hours || hours <= 0) {
      alert("Please provide a trip destination and valid times (or total hours).");
      return;
    }

    const timeBreakdown = newTrip.startTime && newTrip.endTime
      ? `${newTrip.startTime} - ${newTrip.endTime} (Wait time included)`
      : '';

    setFieldTrips(prev => [
      ...prev,
      {
        id: `trip-manual-${Date.now()}`,
        date: newTrip.date || payPeriod.start || new Date().toISOString().split('T')[0],
        description: newTrip.description,
        startTime: newTrip.startTime,
        endTime: newTrip.endTime,
        drivingIntervals: newTrip.drivingNotes,
        timeBreakdown: timeBreakdown,
        hours: hours,
        unit: newTrip.unit,
        isOvertime: hours > 8,
      }
    ]);

    setNewTrip({
      date: '',
      description: '',
      startTime: '',
      endTime: '',
      drivingNotes: '',
      hours: '',
      unit: '',
    });
    setShowAddTripForm(false);
  };

  const handleDeleteTrip = (tripId) => {
    setFieldTrips(prev => prev.filter(t => t.id !== tripId));
  };

  // Financial calculations
  const baseSalaryAmount = salaryRate;
  const pluginAmount = includePlugin ? (pluginRate * (Number(pluginCount) || 1)) : 0;
  const numericPdAmount = Number(pdAmount) || 0;

  // Field trip hours split
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

  const regTripPay = parseFloat((totalRegTripHours * fieldTripRate).toFixed(2));
  const otTripPay = parseFloat((totalOtTripHours * overtimeRate).toFixed(2));
  const totalTripPay = parseFloat((regTripPay + otTripPay).toFixed(2));

  // Misc Pay total (Winter Plug-in + BTPS Invoice PD)
  const totalMiscPay = parseFloat((pluginAmount + numericPdAmount).toFixed(2));

  // Total Gross Compensation
  const totalGrossCompensation = parseFloat(
    (baseSalaryAmount + totalTripPay + totalMiscPay).toFixed(2)
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
            notes: `Duty Record Timesheet processed via Bus Driver Log Tool. Gross Compensation: $${totalGrossCompensation.toFixed(2)}.`,
          },
        });
      } catch (uploadErr) {
        console.warn("Could not archive file to employee profile:", uploadErr);
      } finally {
        setIsArchiving(false);
      }
    }

    // Build comment string: explicitly lists plug-in and PD details
    const commentLines = [];
    if (includePlugin && pluginAmount > 0) {
      commentLines.push(`Winter Plug-in: $${pluginAmount.toFixed(2)}${pluginCount > 1 ? ` (${pluginCount} cords)` : ''}`);
    }
    if (numericPdAmount > 0) {
      commentLines.push(`BTPS Training / PD: $${numericPdAmount.toFixed(2)}${pdNotes ? ` (${pdNotes})` : ''}`);
    }
    if (auditInfo.anomalies.length > 0) {
      commentLines.push(`Route Notes: ${auditInfo.anomalies.join('; ')}`);
    }
    const paystubComments = commentLines.join(' | ');

    // Assemble direct line items using ONLY established employee profile pay types
    const directLineItems = [
      {
        id: salaryPayType?.id || `salary-${selectedDriver.id}`,
        type: salaryPayType?.pay_type_name || 'Salary',
        hours: 1,
        rate: salaryRate,
        unit: salaryPayType?.unit || 'Month',
        amount: salaryRate,
      }
    ];

    if (totalRegTripHours > 0) {
      directLineItems.push({
        id: fieldTripPayType?.id || `field-trip-${selectedDriver.id}`,
        type: fieldTripPayType?.pay_type_name || 'Field Trip',
        hours: parseFloat(totalRegTripHours.toFixed(2)),
        rate: fieldTripRate,
        unit: fieldTripPayType?.unit || 'Hour',
        amount: regTripPay,
      });
    }

    if (totalOtTripHours > 0) {
      directLineItems.push({
        id: overtimePayType?.id || `ot-${selectedDriver.id}`,
        type: overtimePayType?.pay_type_name || 'Overtime',
        hours: parseFloat(totalOtTripHours.toFixed(2)),
        rate: overtimeRate,
        unit: overtimePayType?.unit || 'Hour',
        amount: otTripPay,
      });
    }

    if (totalMiscPay > 0) {
      directLineItems.push({
        id: miscPayType?.id || `misc-pay-${selectedDriver.id}`,
        type: miscPayType?.pay_type_name || 'Misc Pay',
        hours: totalMiscPay,
        rate: 1.00,
        unit: miscPayType?.unit || 'Dollar',
        amount: totalMiscPay,
      });
    }

    // Format trips for PayPro_PayStub.field_trips (for pay stub PDF breakdown table)
    const formattedTripsForPaystub = fieldTrips.map(trip => {
      const hrs = Number(trip.hours) || 0;
      const isOt = trip.isOvertime || hrs > 8;
      const lineRate = isOt ? overtimeRate : fieldTripRate;
      const lineAmount = isOt
        ? (8 * fieldTripRate + (hrs - 8) * overtimeRate)
        : (hrs * fieldTripRate);

      return {
        date: trip.date,
        start_time: trip.startTime || '',
        end_time: trip.endTime || '',
        times: trip.timeBreakdown || (trip.startTime && trip.endTime ? `${trip.startTime} - ${trip.endTime}` : ''),
        description: trip.description,
        comments: trip.drivingIntervals ? `${trip.description} (${trip.drivingIntervals})` : trip.description,
        hours: hrs,
        rate: lineRate,
        amount: parseFloat(lineAmount.toFixed(2)),
        unit: trip.unit || '',
        is_overtime: isOt,
      };
    });

    onApplyCompensation({
      driver: selectedDriver,
      payPeriod,
      directLineItems,
      fieldTrips: formattedTripsForPaystub,
      comments: paystubComments,
      totalGross: totalGrossCompensation,
      summary: {
        baseSalary: baseSalaryAmount,
        pluginAmount,
        totalTripPay,
        totalPdPay: numericPdAmount,
        fieldTripsCount: fieldTrips.length,
      }
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[96vw] max-h-[94vh] flex flex-col p-4 sm:p-6 overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader className="shrink-0 pb-3 border-b dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 dark:bg-blue-950/50 rounded-lg">
                <Bus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold dark:text-slate-100 flex items-center gap-2">
                  Bus Driver Duty Record & Timesheet Tool
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400">
                    Profile Salary: ${salaryRate.toFixed(2)}/mo
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs dark:text-slate-400">
                  Side-by-side handwritten duty record scanner mapping field trips and wait time to employee profile pay types.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentStep === 'review' && (
                <div className="flex items-center border rounded-md p-0.5 bg-slate-100 dark:bg-slate-800 dark:border-slate-700 text-xs">
                  <Button
                    variant={viewMode === 'split' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('split')}
                    className="h-7 px-2 text-xs"
                    title="Side-by-Side View"
                  >
                    <Columns className="w-3.5 h-3.5 mr-1" />
                    Split View
                  </Button>
                  <Button
                    variant={viewMode === 'doc' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('doc')}
                    className="h-7 px-2 text-xs"
                    title="Document Only"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1" />
                    Document
                  </Button>
                  <Button
                    variant={viewMode === 'form' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('form')}
                    className="h-7 px-2 text-xs"
                    title="Form Only"
                  >
                    <Square className="w-3.5 h-3.5 mr-1" />
                    Form
                  </Button>
                </div>
              )}

              {currentStep === 'review' && (
                <Button variant="outline" size="sm" onClick={() => setCurrentStep('upload')} className="text-xs h-8">
                  ← Re-Scan
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Global Driver & Date Selector Bar */}
        <div className="my-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Driver</Label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="mt-1 w-full text-xs rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="mt-1 h-7 text-xs dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
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
              className="mt-1 h-7 text-xs dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
            />
          </div>
        </div>

        {/* STEP 1: UPLOAD & OCR SCAN */}
        {currentStep === 'upload' && (
          <div className="space-y-4 py-4 overflow-y-auto">
            <div className="border-2 border-dashed border-blue-200 dark:border-blue-900/60 rounded-xl p-8 text-center bg-blue-50/40 dark:bg-blue-950/10 hover:bg-blue-50/70 transition-colors">
              <Upload className="w-12 h-12 mx-auto text-blue-500 dark:text-blue-400 mb-3" />
              <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100 mb-1">
                Upload Scanned Driver Duty Record
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
                Upload a PDF scan or photo of the monthly log sheet. Gemini AI reads handwritten routes, field trips (including wait time), cord charging, and weather closures.
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
                onClick={() => {
                  setCurrentStep('review');
                  setViewMode('form');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Skip to Manual Entry →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: SIDE-BY-SIDE REVIEW & COMPENSATION */}
        {currentStep === 'review' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1 min-h-0">
            {/* LEFT PANE: DOCUMENT VIEWER */}
            {(viewMode === 'split' || viewMode === 'doc') && (
              <div className={`${viewMode === 'doc' ? 'lg:col-span-12' : 'lg:col-span-6'} flex flex-col border rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 dark:border-slate-800`}>
                <div className="flex items-center justify-between p-2 bg-slate-200/80 dark:bg-slate-900 border-b dark:border-slate-800 shrink-0 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Original Duty Record
                    {selectedFile && <span className="font-normal text-slate-500">({selectedFile.name})</span>}
                  </span>

                  <div className="flex items-center gap-1">
                    {fileMimeType !== 'application/pdf' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.2))}
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-[11px] font-mono w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.2))}
                          title="Zoom In"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}

                    {filePreviewUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => window.open(filePreviewUrl, '_blank')}
                        title="Open document in new window"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-1 relative flex items-center justify-center min-h-[350px]">
                  {filePreviewUrl ? (
                    fileMimeType === 'application/pdf' ? (
                      <iframe
                        src={filePreviewUrl}
                        className="w-full h-full min-h-[550px] rounded border-0"
                        title="Scanned Driver Duty Record PDF"
                      />
                    ) : (
                      <div className="overflow-auto w-full h-full flex items-center justify-center p-2">
                        <img
                          src={filePreviewUrl}
                          alt="Scanned Driver Duty Record"
                          className="max-w-none transition-transform rounded shadow-sm object-contain"
                          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
                        />
                      </div>
                    )
                  ) : (
                    <div className="text-center p-6 text-slate-400 dark:text-slate-500 text-xs">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      No file uploaded (Manual Entry Mode).<br />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentStep('upload')}
                        className="mt-2 text-xs"
                      >
                        Upload a file now
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RIGHT PANE: REVIEW & MAPPING FORM */}
            {(viewMode === 'split' || viewMode === 'form') && (
              <div className={`${viewMode === 'form' ? 'lg:col-span-12' : 'lg:col-span-6'} flex flex-col space-y-3 overflow-y-auto pr-1`}>
                {ocrSuccessNotes && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{ocrSuccessNotes}</span>
                  </div>
                )}

                {/* 1. Established Route Salary */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Bus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          1. Base Salary (Pay Type: Salary)
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 text-slate-600 dark:text-slate-400">
                        Configured in Employee Profile
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                          {selectedDriver?.first_name} {selectedDriver?.last_name} Route Salary
                        </span>
                        <span className="text-[11px] text-slate-500">
                          1.00 Month @ ${salaryRate.toFixed(2)}/mo
                        </span>
                      </div>
                      <span className="text-base font-bold text-blue-700 dark:text-blue-300">
                        ${salaryRate.toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Field Trips (Continuous Drive + Wait Time) */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          2. Field Trips (${fieldTripRate.toFixed(2)}/hr reg, ${overtimeRate.toFixed(2)}/hr OT)
                        </CardTitle>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddTripForm(!showAddTripForm)}
                        className="text-xs h-6 px-2 gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Trip
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    {/* Add trip mini-form */}
                    {showAddTripForm && (
                      <div className="p-3 bg-blue-50/50 dark:bg-slate-800/90 rounded-lg border border-blue-200 dark:border-slate-700 space-y-2.5 mb-2 text-xs">
                        <div className="font-semibold text-blue-950 dark:text-blue-200 flex items-center justify-between">
                          <span>Add Field Trip / Special Run</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            *Paid continuous duration (departure to return)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px] text-slate-500">Date</Label>
                            <Input
                              type="date"
                              value={newTrip.date}
                              onChange={e => setNewTrip({ ...newTrip, date: e.target.value })}
                              className="h-7 text-xs dark:bg-slate-800"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">Destination / Comments</Label>
                            <Input
                              placeholder="e.g. Vermilion Auction Mart, Ski Trip, Swim Lessons"
                              value={newTrip.description}
                              onChange={e => setNewTrip({ ...newTrip, description: e.target.value })}
                              className="h-7 text-xs dark:bg-slate-800"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <Label className="text-[10px] text-slate-500">Departure Time</Label>
                            <Input
                              placeholder="e.g. 11:55 AM"
                              value={newTrip.startTime}
                              onChange={e => {
                                const val = e.target.value;
                                const hrs = calculateContinuousSpanHours(val, newTrip.endTime);
                                setNewTrip({ ...newTrip, startTime: val, hours: hrs > 0 ? hrs : newTrip.hours });
                              }}
                              className="h-7 text-xs dark:bg-slate-800 px-2"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">Return Time</Label>
                            <Input
                              placeholder="e.g. 3:16 PM"
                              value={newTrip.endTime}
                              onChange={e => {
                                const val = e.target.value;
                                const hrs = calculateContinuousSpanHours(newTrip.startTime, val);
                                setNewTrip({ ...newTrip, endTime: val, hours: hrs > 0 ? hrs : newTrip.hours });
                              }}
                              className="h-7 text-xs dark:bg-slate-800 px-2"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">
                              Total Hours <span className="text-[9px] text-blue-600">(Wait inc.)</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.05"
                              placeholder="e.g. 3.35"
                              value={newTrip.hours}
                              onChange={e => setNewTrip({ ...newTrip, hours: e.target.value })}
                              className="h-7 text-xs dark:bg-slate-800 font-semibold"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">Driving Notes (HOS)</Label>
                            <Input
                              placeholder="e.g. 11:55-12:38, 2:40-3:16"
                              value={newTrip.drivingNotes}
                              onChange={e => setNewTrip({ ...newTrip, drivingNotes: e.target.value })}
                              className="h-7 text-xs dark:bg-slate-800"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAddTripForm(false)}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleAddTrip}
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          >
                            Save Trip
                          </Button>
                        </div>
                      </div>
                    )}

                    {fieldTrips.length === 0 ? (
                      <div className="text-center py-3 text-xs text-slate-400 dark:text-slate-500">
                        No field trips found. Use "+ Add Trip" to enter one.
                      </div>
                    ) : (
                      <div className="border rounded-md overflow-hidden dark:border-slate-800">
                        <Table>
                          <TableHeader className="bg-slate-50 dark:bg-slate-800/40">
                            <TableRow className="text-[11px] h-7">
                              <TableHead className="w-20 py-1">Date</TableHead>
                              <TableHead className="py-1">Destination & Driving Notes</TableHead>
                              <TableHead className="w-32 py-1">Times (Wait inc.)</TableHead>
                              <TableHead className="w-20 text-right py-1">Hours</TableHead>
                              <TableHead className="w-24 text-right py-1">Subtotal</TableHead>
                              <TableHead className="w-8 py-1"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-xs">
                            {fieldTrips.map(trip => {
                              const hrs = Number(trip.hours) || 0;
                              const isOt = trip.isOvertime || hrs > 8;
                              const subtotal = isOt 
                                ? (8 * fieldTripRate + (hrs - 8) * overtimeRate)
                                : (hrs * fieldTripRate);

                              const timesDisplay = trip.timeBreakdown || (trip.startTime && trip.endTime ? `${trip.startTime} - ${trip.endTime}` : '-');

                              return (
                                <TableRow key={trip.id} className="dark:border-slate-800 h-8">
                                  <TableCell className="py-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">{trip.date}</TableCell>
                                  <TableCell className="py-1">
                                    <span className="font-medium dark:text-slate-200">{trip.description}</span>
                                    {trip.drivingIntervals && (
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                                        Drive: {trip.drivingIntervals}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-1 text-[11px] text-slate-600 dark:text-slate-300">
                                    {timesDisplay}
                                  </TableCell>
                                  <TableCell className="py-1 text-right font-semibold">
                                    {hrs.toFixed(2)}h
                                    {isOt && <Badge variant="destructive" className="ml-1 text-[9px] py-0 px-1">OT</Badge>}
                                  </TableCell>
                                  <TableCell className="py-1 text-right font-semibold text-slate-900 dark:text-slate-100">
                                    ${subtotal.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="py-1 text-center">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteTrip(trip.id)}
                                      className="h-5 w-5 text-red-500 hover:text-red-700"
                                    >
                                      <Trash2 className="w-3 h-3" />
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
                      <div className="flex justify-between items-center text-xs pt-1 text-slate-600 dark:text-slate-400">
                        <span>
                          Mapped to: <strong>Field Trip</strong> ({totalRegTripHours.toFixed(2)}h) {totalOtTripHours > 0 && <>+ <strong>Overtime</strong> ({totalOtTripHours.toFixed(2)}h)</>}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          Trip Pay: ${totalTripPay.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 3. Winter Plug-in & BTPS Invoice PD (Routed to Misc Pay @ $1.00) */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Snowflake className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          3. Add-ons: Winter Plug-in & PD (Routed to Misc Pay)
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 text-slate-600 dark:text-slate-400">
                        Added to Paystub Comments
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    {/* Winter Plug-in Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pb-2 border-b dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id="plugin-toggle"
                          checked={includePlugin}
                          onCheckedChange={setIncludePlugin}
                        />
                        <Label htmlFor="plugin-toggle" className="cursor-pointer">
                          <span className="font-semibold text-xs dark:text-slate-200 block">Include Winter Plug-in</span>
                          <span className="text-[10px] text-slate-500">Half-day allowance for engine block heater (Nov–Mar).</span>
                        </Label>
                      </div>

                      {includePlugin && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Label className="text-[10px] text-slate-500">Rate:</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={pluginRate}
                              onChange={(e) => setPluginRate(parseFloat(e.target.value) || 0)}
                              className="w-16 h-7 text-xs dark:bg-slate-800 text-center font-semibold"
                            />
                          </div>
                          <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                            = ${pluginAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* PD Reimbursement Row (Manual entry from BTPS Invoice) */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          BTPS Training & PD Reimbursement
                        </Label>
                        {ocrPdObservations.length > 0 && (
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                            Log note: {ocrPdObservations.map(p => `${p.date} (${p.description})`).join(', ')}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Input
                            value={pdNotes}
                            onChange={(e) => setPdNotes(e.target.value)}
                            placeholder="BTPS Invoice ref / description (e.g. Invoice #2026-03)"
                            className="h-7 text-xs dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="0.01"
                            value={pdAmount || ''}
                            onChange={(e) => setPdAmount(parseFloat(e.target.value) || 0)}
                            placeholder="Amount ($)"
                            className="h-7 text-xs dark:bg-slate-800 font-semibold"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        *Source of truth is your BTPS invoice. Enter the reimbursed dollar amount here.
                      </span>
                    </div>

                    {/* Live Preview of Paystub Comments */}
                    {(pluginAmount > 0 || numericPdAmount > 0) && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded border dark:border-slate-700 text-xs flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                            Will appear in Pay Stub Comments:
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                            {[
                              pluginAmount > 0 ? `Winter Plug-in: $${pluginAmount.toFixed(2)}` : '',
                              numericPdAmount > 0 ? `BTPS Training / PD: $${numericPdAmount.toFixed(2)}${pdNotes ? ` (${pdNotes})` : ''}` : '',
                            ].filter(Boolean).join(' | ')}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Route Anomalies from Log */}
                {auditInfo.anomalies.length > 0 && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs space-y-1">
                    <span className="font-semibold text-amber-800 dark:text-amber-300 block">
                      Handwritten Notes / Route Closures:
                    </span>
                    {auditInfo.anomalies.map((a, idx) => (
                      <span key={idx} className="text-amber-700 dark:text-amber-400 block text-[11px]">
                        • {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Final Gross Summary */}
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-2 mt-auto">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-600 dark:text-slate-300 font-medium block">
                        Gross Paycheque Earnings:
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Salary (${salaryRate.toFixed(2)}) + Trips (${totalTripPay.toFixed(2)}) + Misc Pay (${totalMiscPay.toFixed(2)})
                      </span>
                    </div>
                    <span className="text-xl font-black text-blue-700 dark:text-blue-300">
                      ${totalGrossCompensation.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-blue-200/60 dark:border-blue-800/40">
                    {selectedFile && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={archiveFileToEmployee}
                          onChange={(e) => setArchiveFileToEmployee(e.target.checked)}
                          className="rounded"
                        />
                        Archive PDF to Employee Profile
                      </label>
                    )}

                    <Button
                      onClick={handleApplyToPayroll}
                      disabled={isArchiving || loadingPayTypes}
                      className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 text-xs font-semibold h-8 ml-auto"
                    >
                      {isArchiving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Archiving...
                        </>
                      ) : (
                        <>
                          <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                          Apply to Paycheque →
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
