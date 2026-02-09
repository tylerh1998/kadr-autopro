import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CashFlowTotals({ rows, summaryData, onSummaryChange }) {
  const [isPadDialogOpen, setIsPadDialogOpen] = useState(false);
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

  const handlePadDetailChange = (index, field, value) => {
    const newDetails = [...(summaryData.padRegistriesDetails || Array(10).fill({ name: '', amount: '' }))];
    newDetails[index] = { ...newDetails[index], [field]: value };
    
    // Calculate new total
    const total = newDetails.reduce((sum, item) => sum + val(item.amount), 0);
    
    onSummaryChange({ 
        ...summaryData, 
        padRegistriesDetails: newDetails,
        padRegistries: total // Update the total directly
    });
  };

  const handlePadDetailBlur = (index, value) => {
      const formatted = formatCurrencyInput(value);
      if (formatted !== value) {
          handlePadDetailChange(index, 'amount', formatted);
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
  // "total of all amount paid with method cheque"
  const outstandingCheques = rows.reduce((sum, row) => {
    const method = (row.method || '').toLowerCase();
    const isCheque = method === 'cheque';
    
    if (isCheque) {
      const amount = val(row.amountPaid);
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

  const renderClickableRow = (label, amount, onClick) => (
    <div 
        className="flex justify-between items-center cursor-pointer hover:bg-slate-50 p-1 -mx-1 rounded transition-colors"
        onClick={onClick}
    >
      <span className="text-sm font-medium text-blue-600 underline decoration-dotted underline-offset-4">{label}</span>
      <span className="font-bold font-mono text-slate-900">{formatCurrency(amount)}</span>
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

        {/* PAD & Registries (Clickable) */}
        {renderClickableRow("PAD & Registries", padRegistries, () => setIsPadDialogOpen(true))}

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

      <RemainingPaymentsSection rows={rows} val={val} formatCurrency={formatCurrency} />

      <Dialog open={isPadDialogOpen} onOpenChange={setIsPadDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>PAD & Registries Details</DialogTitle>
            </DialogHeader>
            <div className="py-2">
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            <th className="text-left font-medium text-slate-500 pb-2">Name</th>
                            <th className="text-right font-medium text-slate-500 pb-2">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(summaryData.padRegistriesDetails || Array(10).fill({ name: '', amount: '' })).map((item, index) => (
                            <tr key={index}>
                                <td className="py-1 pr-2">
                                    <Input 
                                        value={item.name} 
                                        onChange={(e) => handlePadDetailChange(index, 'name', e.target.value)}
                                        className="h-8"
                                        placeholder={`Item ${index + 1}`}
                                    />
                                </td>
                                <td className="py-1">
                                    <Input 
                                        value={item.amount} 
                                        onChange={(e) => handlePadDetailChange(index, 'amount', e.target.value)}
                                        onBlur={(e) => handlePadDetailBlur(index, e.target.value)}
                                        className="h-8 text-right font-mono"
                                        placeholder="$0.00"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <DialogFooter className="sm:justify-between">
                <div className="flex items-center gap-2 font-bold">
                    <span>Total:</span>
                    <span>{formatCurrency(padRegistries)}</span>
                </div>
                <Button onClick={() => setIsPadDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RemainingPaymentsSection({ rows, val, formatCurrency }) {
  // Calculate remaining amounts by method
  // Remaining = Amount - AmountPaid
  const breakdown = rows.reduce((acc, row) => {
    const method = row.method || 'Unassigned';
    const amount = val(row.amount);
    const amountPaid = val(row.amountPaid);
    const remaining = amount - amountPaid;

    if (remaining > 0.01) { // Only count if there is a positive remaining amount
        if (!acc[method]) acc[method] = 0;
        acc[method] += remaining;
    }
    return acc;
  }, {});

  const totalRemaining = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return (
    <>
        <Separator />
        <CardContent className="pt-4 space-y-3 bg-slate-50/50">
            <h3 className="font-semibold text-slate-700">Remaining Payments</h3>
            <div className="space-y-2">
                {Object.entries(breakdown).sort((a,b) => b[1] - a[1]).map(([method, amount]) => (
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
        </CardContent>
    </>
  );
}