import React, { useState } from 'react';
import moment from 'moment';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import DepositHistoryModal from '@/components/cash-drawer/DepositHistoryModal';
import PadRegistriesModal from '@/components/cash-flow/PadRegistriesModal';

export default function CashFlowTotals({ rows, overheadRows, summaryData, onSummaryChange }) {
  const [isDepositHistoryOpen, setIsDepositHistoryOpen] = useState(false);
  const [isPadRegistriesOpen, setIsPadRegistriesOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);

  const formatCurrencyInput = (value) => {
    if (!value) return '';
    const numericVal = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
    if (isNaN(numericVal)) return value;
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(numericVal);
  };

  const handleChange = (field, value) => {
    onSummaryChange({ ...summaryData, [field]: value });
  };

  const handleBlur = (field, value) => {
    const formatted = formatCurrencyInput(value);
    if (formatted !== value) {
      handleChange(field, formatted);
    }
  };

  const val = (v) => {
    if (typeof v === 'string') {
      return parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
    }
    return parseFloat(v) || 0;
  };

  const outstandingCheques = rows.reduce((sum, row) => {
    const method = (row.method || '').toLowerCase();
    if (method === 'cheque') {
      return sum + val(row.amountPaid);
    }
    return sum;
  }, 0);

  const currentBankBalance = val(summaryData.bankBalance);
  const padRegistries = val(summaryData.padRegistries);
  const upcomingPayroll = val(summaryData.upcomingPayroll);
  const payrollRemit = val(summaryData.payrollRemit);
  const gstRemit = val(summaryData.gstRemit);
  const fiscalCushion = val(summaryData.fiscalCushion);
  const expectedDeposits = val(summaryData.expectedDeposits);

  const liabilities = outstandingCheques + padRegistries + upcomingPayroll + payrollRemit + gstRemit + fiscalCushion;
  const currentCashPosition = currentBankBalance + expectedDeposits - liabilities;

  const formatCurrency = (amount) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);

  const renderEditableRow = (label, field) => (
    <div className="flex justify-between items-center gap-2">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <div className="w-32">
        <Input
          type="text"
          value={summaryData[field]}
          onChange={(e) => handleChange(field, e.target.value)}
          onBlur={(e) => handleBlur(field, e.target.value)}
          className="h-8 text-right font-mono"
          placeholder="$0.00"
        />
      </div>
    </div>
  );

  const renderCalculatedRow = (label, amount, colorClass = "text-slate-900") => (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`font-bold font-mono ${colorClass}`}>{formatCurrency(amount)}</span>
    </div>
  );

  const handlePadRegistriesSave = (details) => {
    const total = (details || []).reduce((sum, item) => {
      const amount = typeof item?.amount === 'string'
        ? parseFloat(item.amount.replace(/[^0-9.-]+/g, '')) || 0
        : parseFloat(item?.amount) || 0;
      return sum + amount;
    }, 0);

    onSummaryChange({
      ...summaryData,
      padRegistries: formatCurrency(total),
      padRegistriesDetails: details
    });
  };

  return (
    <Card className="bg-white shadow-sm border">
      <Collapsible open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <CardHeader className="pb-3 border-b">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer group">
              <CardTitle className="text-lg text-slate-800 group-hover:text-blue-600 transition-colors">Cash Flow Summary</CardTitle>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isSummaryOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-4 space-y-3">
            {renderEditableRow("Current Bank Balance", "bankBalance")}
            {renderCalculatedRow("Outstanding Cheques", outstandingCheques, "text-red-600")}
            <div className="flex justify-between items-center gap-2">
              <span
                className="text-sm font-medium text-blue-600 underline decoration-dotted underline-offset-4 cursor-pointer hover:text-blue-800"
                onClick={() => setIsPadRegistriesOpen(true)}
              >
                PAD &amp; Registries
              </span>
              <span className="font-bold font-mono text-slate-900">{formatCurrency(padRegistries)}</span>
            </div>
            {renderEditableRow("Upcoming Payroll", "upcomingPayroll")}
            {renderEditableRow("Upcoming Payroll Remit", "payrollRemit")}
            {renderEditableRow("Upcoming GST Remit", "gstRemit")}
            {renderEditableRow("Fiscal Cushion", "fiscalCushion")}

            <div className="flex justify-between items-center gap-2">
              <span
                className="text-sm font-medium text-blue-600 underline decoration-dotted underline-offset-4 cursor-pointer hover:text-blue-800"
                onClick={() => setIsDepositHistoryOpen(true)}
              >
                Expected Deposits
              </span>
              <div className="w-32">
                <Input
                  type="text"
                  value={summaryData.expectedDeposits}
                  onChange={(e) => handleChange("expectedDeposits", e.target.value)}
                  onBlur={(e) => handleBlur("expectedDeposits", e.target.value)}
                  className="h-8 text-right font-mono"
                  placeholder="$0.00"
                />
              </div>
            </div>

            <Separator className="my-2" />

            <div className="flex justify-between items-center pt-2">
              <span className="text-base font-bold text-slate-700">Current Cash Position</span>
              <span className={`text-xl font-bold font-mono ${currentCashPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(currentCashPosition)}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <RemainingPaymentsSection rows={rows} val={val} formatCurrency={formatCurrency} />
      <MonthlyEstimatesSection
        overheadRows={overheadRows || []}
        summaryData={summaryData}
        onSummaryChange={onSummaryChange}
        val={val}
        formatCurrency={formatCurrency}
        renderEditableRow={renderEditableRow}
      />
      <CashFlowTimelineSection rows={rows} val={val} formatCurrency={formatCurrency} />
      <EtransferLimitsSection
        summaryData={summaryData}
        onSummaryChange={onSummaryChange}
        renderEditableRow={renderEditableRow}
      />

      <DepositHistoryModal
        open={isDepositHistoryOpen}
        onClose={() => setIsDepositHistoryOpen(false)}
        onDepositReversed={() => {}}
        onReprintSlip={() => {}}
      />

      <PadRegistriesModal
        open={isPadRegistriesOpen}
        onClose={() => setIsPadRegistriesOpen(false)}
        details={summaryData.padRegistriesDetails}
        onSave={handlePadRegistriesSave}
      />
    </Card>
  );
}

function RemainingPaymentsSection({ rows, val, formatCurrency }) {
  const [isOpen, setIsOpen] = useState(false);

  const breakdown = rows.reduce((acc, row) => {
    const method = row.method || 'Unassigned';
    const amount = val(row.amount);
    const amountPaid = val(row.amountPaid);
    const remaining = amount - amountPaid;

    if (remaining > 0.01) {
      if (!acc[method]) acc[method] = 0;
      acc[method] += remaining;
    }
    return acc;
  }, {});

  const totalRemaining = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Separator />
      <CardContent className="pt-4 pb-2 bg-white">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
            <h3 className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Remaining Payments</h3>
            <div className="flex items-center gap-2">
              {!isOpen && <span className="font-mono text-slate-700 text-sm font-bold">{formatCurrency(totalRemaining)}</span>}
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2">
            {Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([method, amount]) => (
              <div key={method} className="flex justify-between items-center text-sm">
                <span className="text-slate-500">{method === 'Unassigned' ? 'No Method' : method}</span>
                <span className="font-medium font-mono text-slate-700">{formatCurrency(amount)}</span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between items-center font-bold">
              <span className="text-slate-700">Total Remaining</span>
              <span className="font-mono text-red-600">{formatCurrency(totalRemaining)}</span>
            </div>
          </div>
        </CollapsibleContent>
      </CardContent>
    </Collapsible>
  );
}

function MonthlyEstimatesSection({ overheadRows, summaryData, onSummaryChange, val, formatCurrency, renderEditableRow }) {
  const [isOpen, setIsOpen] = useState(false);

  const includedRows = (overheadRows || []).filter((row) => row?.included === true && val(row.amount) > 0);
  const groupedOverhead = includedRows.reduce((acc, row) => {
    const date = row.dateOption || 'Unassigned';
    const amount = val(row.amount);
    if (!acc[date]) acc[date] = 0;
    acc[date] += amount;
    return acc;
  }, {});
  const includedTotal = includedRows.reduce((sum, row) => sum + val(row.amount), 0);
  const dateOrder = ["Month Start", "8th", "12th to 15th", "Month End"];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Separator />
      <CardContent className="pt-4 pb-2 bg-white">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
            <h3 className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Remaining Overhead</h3>
            <div className="flex items-center gap-2">
              {!isOpen && <span className="font-mono text-slate-700 text-sm font-bold">{formatCurrency(includedTotal)}</span>}
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2 mb-4">
            {dateOrder.filter((date) => groupedOverhead[date] > 0).map((date) => (
              <div key={date} className="flex justify-between items-center text-sm">
                <span className="text-slate-500">{date}</span>
                <span className="font-medium font-mono text-slate-700">{formatCurrency(groupedOverhead[date])}</span>
              </div>
            ))}
            {Object.keys(groupedOverhead)
              .filter((date) => !dateOrder.includes(date) && groupedOverhead[date] > 0)
              .map((date) => (
                <div key={date} className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{date}</span>
                  <span className="font-medium font-mono text-slate-700">{formatCurrency(groupedOverhead[date])}</span>
                </div>
              ))}
            {includedRows.length === 0 && (
              <div className="text-sm text-slate-400">No overhead rows selected.</div>
            )}
          </div>

          <div className="space-y-2">
            {renderEditableRow("First Payroll", "estFirstPayroll")}
            {renderEditableRow("Second Payroll", "estSecondPayroll")}
            {renderEditableRow("Payroll Remit", "estPayrollRemit")}
          </div>

          <Separator className="my-2" />
          <div className="flex justify-between items-center font-bold">
            <span className="text-slate-700">Total Remaining Overhead</span>
            <span className="font-mono text-red-600">{formatCurrency(includedTotal)}</span>
          </div>
        </CollapsibleContent>
      </CardContent>
    </Collapsible>
  );
}

function CashFlowTimelineSection({ rows, val, formatCurrency }) {
  const [isOpen, setIsOpen] = useState(false);

  const parseDueDate = (dateStr) => {
    if (!dateStr || !dateStr.trim()) return null;

    const formats = [
      "YYYY-MM-DD",
      "MMM D", "MMM DD", "MMM D, YYYY", "MMM DD, YYYY",
      "M/D/YYYY", "MM/DD/YYYY", "M-D-YYYY", "MM-DD-YYYY",
      "M/D", "MM/DD"
    ];

    let mDate = moment(dateStr, formats, true);
    if (!mDate.isValid()) {
      mDate = moment(dateStr);
    }

    return mDate.isValid() ? mDate.startOf('day') : null;
  };

  const buckets = [
    { key: 'overdue', label: 'Overdue (incl today)', min: null, max: 0, className: 'bg-red-100 text-red-700' },
    { key: 'due1to5', label: 'Due 1-5', min: 1, max: 5, className: 'bg-yellow-100 text-yellow-800' },
    { key: 'due6to10', label: 'Due 6-10', min: 6, max: 10, className: 'bg-yellow-100 text-yellow-800' },
    { key: 'due11to15', label: 'Due 11-15', min: 11, max: 15, className: 'bg-blue-100 text-blue-700' },
    { key: 'due16to20', label: 'Due 16-20', min: 16, max: 20, className: 'bg-blue-100 text-blue-700' },
    { key: 'due21plus', label: 'Due 21+', min: 21, max: null, className: 'bg-blue-100 text-blue-700' }
  ];

  const timelineTotals = buckets.reduce((acc, bucket) => {
    acc[bucket.key] = 0;
    return acc;
  }, {});

  const today = moment().startOf('day');

  rows.forEach((row) => {
    const remaining = val(row.amount) - val(row.amountPaid);
    if (remaining <= 0.01) return;

    const dueDate = parseDueDate(row.dueDate);
    if (!dueDate) return;

    const diff = dueDate.diff(today, 'days');
    const bucket = buckets.find((item) => {
      if (item.max === 0) return diff <= 0;
      if (item.max === null) return diff >= item.min;
      return diff >= item.min && diff <= item.max;
    });

    if (bucket) {
      timelineTotals[bucket.key] += remaining;
    }
  });

  const totalTimeline = Object.values(timelineTotals).reduce((sum, amount) => sum + amount, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Separator />
      <CardContent className="pt-4 pb-2 bg-white">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
            <h3 className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Cash Flow Timeline</h3>
            <div className="flex items-center gap-2">
              {!isOpen && <span className="font-mono text-slate-700 text-sm font-bold">{formatCurrency(totalTimeline)}</span>}
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2">
            {buckets.map((bucket) => (
              <div key={bucket.key} className={`flex justify-between items-center text-sm rounded-md px-2 py-1.5 ${bucket.className}`}>
                <span className="font-medium">{bucket.label}</span>
                <span className="font-bold font-mono">{formatCurrency(timelineTotals[bucket.key])}</span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between items-center font-bold">
              <span className="text-slate-700">Total Timeline Due</span>
              <span className="font-mono text-red-600">{formatCurrency(totalTimeline)}</span>
            </div>
          </div>
        </CollapsibleContent>
      </CardContent>
    </Collapsible>
  );
}

function EtransferLimitsSection({ summaryData, onSummaryChange, renderEditableRow }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Separator />
      <CardContent className="pt-4 pb-2">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
            <h3 className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Etransfer Limits</h3>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2">
            {renderEditableRow("Per Tx", "etransferPerTx")}
            {renderEditableRow("Daily", "etransferDaily")}
            {renderEditableRow("Weekly", "etransferWeekly")}
            {renderEditableRow("Monthly", "etransferMonthly")}
          </div>
        </CollapsibleContent>
      </CardContent>
    </Collapsible>
  );
}