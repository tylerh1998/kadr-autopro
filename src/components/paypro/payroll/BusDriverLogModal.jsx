import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PayrollSetting } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Snowflake, 
  Clock, 
  GraduationCap, 
  FileCheck,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Columns,
  Square,
  TrendingUp,
  Save
} from "lucide-react";

// Default BTPS Pay Model Rates (2026 Baseline)
const DEFAULT_RATES = {
  daily_rate: 113.30,
  school_days: 180,
  stat_days: 11,
  annual_salary: 21640.30,
  ten_month_rate: 2164.03,
  twelve_month_rate: 1803.36,
  winter_plugin_rate: 56.65,
  field_trip_hourly_rate: 25.00,
  field_trip_ot_rate: 37.50,
  last_raise_percent: 3.0,
  effective_year: "2026",
};

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
  
  // Pay rates config
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [showRateSettings, setShowRateSettings] = useState(false);
  const [newRaisePercent, setNewRaisePercent] = useState('');
  const [savingRates, setSavingRates] = useState(false);

  // Selection state
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId || (drivers[0]?.id || ''));
  const [payPeriod, setPayPeriod] = useState(initialPayPeriod);
  
  // File upload & OCR state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [fileMimeType, setFileMimeType] = useState('application/pdf');
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrSuccessNotes, setOcrSuccessNotes] = useState('');

  // Compensation model state
  const [salarySchedule, setSalarySchedule] = useState('10_month'); // '10_month' | '12_month'
  const [customBaseSalary, setCustomBaseSalary] = useState(DEFAULT_RATES.ten_month_rate);
  
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

  // Load configured rates from database (PayPro_PayrollSetting)
  useEffect(() => {
    const loadRates = async () => {
      try {
        const settings = await PayrollSetting.filter({ key: 'btps_bus_driver_rates' });
        if (settings.length > 0 && settings[0].value) {
          const parsed = JSON.parse(settings[0].value);
          setRates(prev => ({ ...prev, ...parsed }));
          if (salarySchedule === '10_month') {
            setCustomBaseSalary(parsed.ten_month_rate || DEFAULT_RATES.ten_month_rate);
          } else {
            setCustomBaseSalary(parsed.twelve_month_rate || DEFAULT_RATES.twelve_month_rate);
          }
        }
      } catch (err) {
        console.warn("Could not load custom bus driver rates from DB, using defaults:", err);
      }
    };
    loadRates();
  }, []);

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
      const periodMonth = new Date(initialPayPeriod.end || initialPayPeriod.start).getMonth() + 1;
      const isWinterMonth = [11, 12, 1, 2, 3].includes(periodMonth);
      setIncludePlugin(isWinterMonth);
    }
  }, [initialPayPeriod]);

  // Update base rate when schedule changes
  useEffect(() => {
    if (salarySchedule === '10_month') {
      setCustomBaseSalary(rates.ten_month_rate);
    } else {
      setCustomBaseSalary(rates.twelve_month_rate);
    }
  }, [salarySchedule, rates]);

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];

  // Handle file selection and preview creation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setOcrError(null);

    // Create local object URL for instant high-speed browser rendering
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

      if (extracted.driver_name) {
        const matched = drivers.find(d => 
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(extracted.driver_name.toLowerCase()) ||
          extracted.driver_name.toLowerCase().includes(d.first_name.toLowerCase())
        );
        if (matched) {
          setSelectedDriverId(matched.id);
        }
      }

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

      if (extracted.pd_days && extracted.pd_days.length > 0) {
        setPdDays(extracted.pd_days);
        setPdAmount(rates.daily_rate * extracted.pd_days.length);
        setPdDescription(extracted.pd_days.map(p => `${p.date}: ${p.description}`).join('; '));
      }

      setAuditInfo({
        regularRunsCount: extracted.regular_runs_count || 0,
        statDaysCount: extracted.stat_holidays_count || 0,
        anomalies: extracted.anomalies || [],
        dateSigned: extracted.date_signed || '',
        monthYearText: extracted.month_year_text || '',
      });

      setOcrSuccessNotes(
        `✓ Parsed log for ${extracted.driver_name || 'driver'} (${extracted.month_year_text || 'Month'}). ` +
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

  // Apply next year's BTPS raise percentage
  const handleApplyRaisePercentage = async () => {
    const percent = parseFloat(newRaisePercent);
    if (!percent || isNaN(percent) || percent <= 0) {
      alert("Please enter a valid raise percentage (e.g. 2.5 or 3.0).");
      return;
    }

    setSavingRates(true);
    try {
      const multiplier = 1 + (percent / 100);
      const newDailyRate = parseFloat((rates.daily_rate * multiplier).toFixed(2));
      const totalDays = rates.school_days + rates.stat_days;
      const newAnnual = parseFloat((totalDays * newDailyRate).toFixed(2));
      const new10Mo = parseFloat((newAnnual / 10).toFixed(2));
      const new12Mo = parseFloat((newAnnual / 12).toFixed(2));
      const newPlugin = parseFloat((newDailyRate / 2).toFixed(2));

      const updatedRates = {
        ...rates,
        daily_rate: newDailyRate,
        annual_salary: newAnnual,
        ten_month_rate: new10Mo,
        twelve_month_rate: new12Mo,
        winter_plugin_rate: newPlugin,
        last_raise_percent: percent,
        effective_year: String(new Date().getFullYear()),
      };

      // Save to database
      const existing = await PayrollSetting.filter({ key: 'btps_bus_driver_rates' });
      if (existing.length > 0) {
        await PayrollSetting.update(existing[0].id, { value: JSON.stringify(updatedRates) });
      } else {
        await PayrollSetting.create({ key: 'btps_bus_driver_rates', value: JSON.stringify(updatedRates) });
      }

      setRates(updatedRates);
      if (salarySchedule === '10_month') {
        setCustomBaseSalary(new10Mo);
      } else {
        setCustomBaseSalary(new12Mo);
      }

      alert(`✓ BTPS ${percent}% Raise applied and saved!\n\nNew Daily Rate: $${newDailyRate}\nAnnual Base: $${newAnnual}\n10-Month: $${new10Mo}/mo\n12-Month: $${new12Mo}/mo\nWinter Plug-in: $${newPlugin}/mo`);
      setNewRaisePercent('');
      setShowRateSettings(false);
    } catch (err) {
      console.error("Error saving updated rates:", err);
      alert("Error saving updated rates to database: " + err.message);
    } finally {
      setSavingRates(false);
    }
  };

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
  const pluginAmount = includePlugin ? (rates.winter_plugin_rate * (Number(pluginCount) || 1)) : 0;

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

  const regTripPay = parseFloat((totalRegTripHours * rates.field_trip_hourly_rate).toFixed(2));
  const otTripPay = parseFloat((totalOtTripHours * rates.field_trip_ot_rate).toFixed(2));
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
            notes: `Duty Record Timesheet processed via Bus Driver OCR. Gross Compensation: $${totalGrossCompensation.toFixed(2)}.`,
          },
        });
      } catch (uploadErr) {
        console.warn("Could not archive file to employee profile:", uploadErr);
      } finally {
        setIsArchiving(false);
      }
    }

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
        rate: rates.winter_plugin_rate,
        unit: 'Month',
        amount: pluginAmount,
      });
    }

    if (totalRegTripHours > 0) {
      directLineItems.push({
        id: `field-trips-reg-${selectedDriver.id}`,
        type: 'Field Trips (Reg)',
        hours: parseFloat(totalRegTripHours.toFixed(2)),
        rate: rates.field_trip_hourly_rate,
        unit: 'Hour',
        amount: regTripPay,
      });
    }

    if (totalOtTripHours > 0) {
      directLineItems.push({
        id: `field-trips-ot-${selectedDriver.id}`,
        type: 'Field Trips (Overtime)',
        hours: parseFloat(totalOtTripHours.toFixed(2)),
        rate: rates.field_trip_ot_rate,
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
      <DialogContent className="max-w-7xl w-[96vw] max-h-[94vh] flex flex-col p-4 sm:p-6 overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader className="shrink-0 pb-3 border-b dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 dark:bg-blue-950/50 rounded-lg">
                <Bus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold dark:text-slate-100 flex items-center gap-2">
                  Bus Driver Duty Record & Pay Tool
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 font-mono">
                    BTPS Base: ${rates.daily_rate}/day ({rates.last_raise_percent}% Raise Active)
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs dark:text-slate-400">
                  Side-by-side handwritten duty record scanner with automated BTPS compensation calculator.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRateSettings(!showRateSettings)}
                className="text-xs h-8 border-slate-300 dark:border-slate-700"
              >
                <Settings className="w-3.5 h-3.5 mr-1 text-slate-600 dark:text-slate-400" />
                BTPS Raise & Rate Settings
              </Button>

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

        {/* ANNUAL RAISE & RATES CONFIGURATION DRAWER */}
        {showRateSettings && (
          <div className="my-2 p-4 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-blue-200 dark:border-blue-900 text-xs space-y-3 shrink-0">
            <div className="flex items-center justify-between border-b dark:border-slate-700 pb-2">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                BTPS Pay Model Rates & Annual Raise Calculator
              </div>
              <span className="text-slate-500 dark:text-slate-400">
                Effective Year: {rates.effective_year || '2026'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Daily Base Rate</span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-200">${rates.daily_rate.toFixed(2)}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Annual Route Salary (191d)</span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-200">${rates.annual_salary.toFixed(2)}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">10-Month / 12-Month</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">${rates.ten_month_rate} / ${rates.twelve_month_rate}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Winter Plug-in Rate</span>
                <span className="text-base font-bold text-cyan-600 dark:text-cyan-400">${rates.winter_plugin_rate.toFixed(2)}/mo</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Field Trip / OT Rate</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">${rates.field_trip_hourly_rate}/h (${rates.field_trip_ot_rate} OT)</span>
              </div>
            </div>

            {/* Apply Next Year's Raise */}
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900/60 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-semibold text-blue-900 dark:text-blue-200 block text-xs">
                  Apply Next Year's BTPS Funding Increase (%)
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  When BTPS gives another raise, enter the % here to automatically recalculate and save all base rates for PayPRO.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 3.0"
                    value={newRaisePercent}
                    onChange={(e) => setNewRaisePercent(e.target.value)}
                    className="w-24 h-8 text-xs dark:bg-slate-900"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">%</span>
                </div>

                <Button
                  size="sm"
                  onClick={handleApplyRaisePercentage}
                  disabled={savingRates || !newRaisePercent}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                >
                  {savingRates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Apply & Save New Rates
                </Button>
              </div>
            </div>
          </div>
        )}

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
                onClick={() => {
                  setCurrentStep('review');
                  setViewMode('form');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Skip to Manual Compensation Calculator →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: SIDE-BY-SIDE REVIEW & COMPENSATION */}
        {currentStep === 'review' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1 min-h-0">
            {/* LEFT PANE: DOCUMENT VIEWER (Visible in 'split' or 'doc' viewMode) */}
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

            {/* RIGHT PANE: COMPENSATION FORM (Visible in 'split' or 'form' viewMode) */}
            {(viewMode === 'split' || viewMode === 'form') && (
              <div className={`${viewMode === 'form' ? 'lg:col-span-12' : 'lg:col-span-6'} flex flex-col space-y-3 overflow-y-auto pr-1`}>
                {ocrSuccessNotes && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{ocrSuccessNotes}</span>
                  </div>
                )}

                {/* 1. Guaranteed Fixed Route Salary */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Bus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          1. Fixed Route Salary (${rates.daily_rate}/day base)
                        </CardTitle>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Annual: ${rates.annual_salary.toLocaleString('en-CA', { minimumFractionDigits: 2 })} (191 days)
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    <RadioGroup 
                      value={salarySchedule} 
                      onValueChange={setSalarySchedule}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      <div className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${salarySchedule === '10_month' ? 'bg-blue-50/60 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="10_month" id="opt_10_month" />
                          <Label htmlFor="opt_10_month" className="cursor-pointer">
                            <div className="font-semibold text-xs dark:text-slate-200">10-Month Schedule</div>
                            <div className="text-[10px] text-slate-500">Sept – June (School Year)</div>
                          </Label>
                        </div>
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">${rates.ten_month_rate.toFixed(2)}</span>
                      </div>

                      <div className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${salarySchedule === '12_month' ? 'bg-blue-50/60 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="12_month" id="opt_12_month" />
                          <Label htmlFor="opt_12_month" className="cursor-pointer">
                            <div className="font-semibold text-xs dark:text-slate-200">12-Month Schedule</div>
                            <div className="text-[10px] text-slate-500">Year-Round (July/Aug inc.)</div>
                          </Label>
                        </div>
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">${rates.twelve_month_rate.toFixed(2)}</span>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>

                {/* 2. Winter Plug-in / Cord Charging */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Snowflake className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          2. Winter Plug-in / Cord Charging (Nov – Mar)
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-950/30 dark:text-cyan-400">
                        ${rates.winter_plugin_rate}/mo
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id="plugin-toggle"
                          checked={includePlugin}
                          onCheckedChange={setIncludePlugin}
                        />
                        <Label htmlFor="plugin-toggle" className="cursor-pointer">
                          <span className="font-semibold text-xs dark:text-slate-200 block">Include Winter Plug-in</span>
                          <span className="text-[10px] text-slate-500">Weather-dependent engine heater rate (Nov–Mar).</span>
                        </Label>
                      </div>

                      {includePlugin && (
                        <div className="flex items-center gap-1.5">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Qty:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="5"
                            value={pluginCount}
                            onChange={(e) => setPluginCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 h-7 text-xs dark:bg-slate-800 text-center"
                          />
                          <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                            = ${pluginAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Field Trips */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2.5 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          3. Field Trips & Extra Runs (${rates.field_trip_hourly_rate}/hr drive + wait)
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
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 mb-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px] text-slate-500">Date</Label>
                            <Input
                              type="date"
                              value={newTrip.date}
                              onChange={e => setNewTrip({ ...newTrip, date: e.target.value })}
                              className="h-6 text-xs dark:bg-slate-800"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">Description / Destination</Label>
                            <Input
                              placeholder="e.g. Ski Trip, Swim Lessons, Vermilion Auction Mart"
                              value={newTrip.description}
                              onChange={e => setNewTrip({ ...newTrip, description: e.target.value })}
                              className="h-6 text-xs dark:bg-slate-800"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <Label className="text-[10px] text-slate-500">AM (Start-End)</Label>
                            <div className="flex gap-1">
                              <Input
                                placeholder="09:00"
                                value={newTrip.startAm}
                                onChange={e => setNewTrip({ ...newTrip, startAm: e.target.value })}
                                className="h-6 text-xs dark:bg-slate-800 px-1"
                              />
                              <Input
                                placeholder="10:30"
                                value={newTrip.endAm}
                                onChange={e => setNewTrip({ ...newTrip, endAm: e.target.value })}
                                className="h-6 text-xs dark:bg-slate-800 px-1"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">PM (Start-End)</Label>
                            <div className="flex gap-1">
                              <Input
                                placeholder="14:00"
                                value={newTrip.startPm}
                                onChange={e => setNewTrip({ ...newTrip, startPm: e.target.value })}
                                className="h-6 text-xs dark:bg-slate-800 px-1"
                              />
                              <Input
                                placeholder="16:30"
                                value={newTrip.endPm}
                                onChange={e => setNewTrip({ ...newTrip, endPm: e.target.value })}
                                className="h-6 text-xs dark:bg-slate-800 px-1"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">Total Hours</Label>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 4.5"
                              value={newTrip.hours}
                              onChange={e => setNewTrip({ ...newTrip, hours: e.target.value })}
                              className="h-6 text-xs dark:bg-slate-800"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button size="sm" onClick={handleAddTrip} className="h-6 text-xs bg-blue-600 text-white w-full">
                              Save Trip
                            </Button>
                          </div>
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
                              <TableHead className="py-1">Description</TableHead>
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
                                ? (8 * rates.field_trip_hourly_rate + (hrs - 8) * rates.field_trip_ot_rate)
                                : (hrs * rates.field_trip_hourly_rate);

                              return (
                                <TableRow key={trip.id} className="dark:border-slate-800 h-8">
                                  <TableCell className="py-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">{trip.date}</TableCell>
                                  <TableCell className="py-1">
                                    <span className="font-medium dark:text-slate-200">{trip.description}</span>
                                    {trip.timeBreakdown && (
                                      <span className="text-[10px] text-slate-400 block">{trip.timeBreakdown}</span>
                                    )}
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
                      <div className="flex justify-end items-center gap-3 text-xs pt-1">
                        <span className="text-slate-500">
                          Total Hours: <strong>{(totalRegTripHours + totalOtTripHours).toFixed(2)}h</strong>
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          Trip Pay: ${totalTripPay.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 4. Training & PD */}
                <Card className="border dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                  <CardHeader className="py-2 px-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-xs font-bold dark:text-slate-100">
                          4. Training & PD (BTPS Pass-through)
                        </CardTitle>
                      </div>
                      {pdDays.length > 0 && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-indigo-50 text-indigo-700">
                          {pdDays.length} PD Day(s) Found
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Input
                          value={pdDescription}
                          onChange={(e) => setPdDescription(e.target.value)}
                          placeholder="Description / Date"
                          className="h-7 text-xs dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          step="0.01"
                          value={pdAmount}
                          onChange={(e) => setPdAmount(parseFloat(e.target.value) || 0)}
                          placeholder="Payout ($)"
                          className="h-7 text-xs dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 5. Notes & Observations */}
                {auditInfo.anomalies.length > 0 && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs space-y-1">
                    <span className="font-semibold text-amber-800 dark:text-amber-300 block">
                      Handwritten Notes / Closures:
                    </span>
                    {auditInfo.anomalies.map((a, idx) => (
                      <span key={idx} className="text-amber-700 dark:text-amber-400 block text-[11px]">
                        • {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Final Gross Earnings Box */}
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-2 mt-auto">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      Gross Wages (GL 5009):
                    </span>
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
                        Archive to Employee Profile
                      </label>
                    )}

                    <Button
                      onClick={handleApplyToPayroll}
                      disabled={isArchiving}
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
