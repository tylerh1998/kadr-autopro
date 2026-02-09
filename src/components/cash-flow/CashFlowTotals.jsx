import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

export default function CashFlowTotals({ rows, summaryData, onSummaryChange }) {
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

  // Helper to parse float safe from potential currency string
  const val = (v) => {
    if (typeof v === 'string') {
        return parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
    }
    return parseFloat(v) || 0;
  };

  // 1. Outstanding Cheques Calculation
  // "total amount of fields marked as cheque that have a date paid"
  const outstandingCheques = rows.reduce((sum, row) => {
    const method = (row.method || '').toLowerCase();
    const isCheque = method === 'cheque';
    const hasDatePaid = row.datePaid && row.datePaid.trim().length > 0;
    
    if (isCheque && hasDatePaid) {
      // Use amountPaid if available, otherwise amount
      const amount = val(row.amountPaid) || val(row.amount);
      return sum + amount;
    }
    return sum;
  }, 0);

  // 2. Current Cash Position Calculation
  const currentBankBalance = val(summaryData.bankBalance);
  const padRegistries = val(summaryData.padRegistries);
  const upcomingPayroll = val(summaryData.upcomingPayroll);
  const payrollRemit = val(summaryData.payrollRemit);
  const gstRemit = val(summaryData.gstRemit);
  const fiscalCushion = val(summaryData.fiscalCushion);
  const expectedDeposits = val(summaryData.expectedDeposits);

  const liabilities = outstandingCheques + padRegistries + upcomingPayroll + payrollRemit + gstRemit + fiscalCushion;
  const currentCashPosition = currentBankBalance + expectedDeposits - liabilities;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val);
  };

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

  return (
    <Card className="bg-white/80 backdrop-blur">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-lg text-slate-800">Cash Flow Summary</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        
        {/* Current Bank Balance */}
        {renderEditableRow("Current Bank Balance", "bankBalance")}

        {/* Outstanding Cheques (Calculated) */}
        {renderCalculatedRow("Outstanding Cheques", outstandingCheques, "text-red-600")}

        {/* PAD & Registries */}
        {renderEditableRow("PAD & Registries", "padRegistries")}

        {/* Upcoming Payroll */}
        {renderEditableRow("Upcoming Payroll", "upcomingPayroll")}

        {/* Upcoming Payroll Remit */}
        {renderEditableRow("Upcoming Payroll Remit", "payrollRemit")}

        {/* Upcoming GST Remit */}
        {renderEditableRow("Upcoming GST Remit", "gstRemit")}

        {/* Fiscal Cushion */}
        {renderEditableRow("Fiscal Cushion", "fiscalCushion")}

        {/* Expected Deposits */}
        {renderEditableRow("Expected Deposits", "expectedDeposits")}

        <Separator className="my-2" />

        {/* Current Cash Position */}
        <div className="flex justify-between items-center pt-2">
          <span className="text-base font-bold text-slate-700">Current Cash Position</span>
          <span className={`text-xl font-bold font-mono ${currentCashPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(currentCashPosition)}
          </span>
        </div>

      </CardContent>
    </Card>
  );
}