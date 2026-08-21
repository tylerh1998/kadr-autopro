import React, { useState } from "react";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X, Plus, Trash2 } from "lucide-react";

export default function EditPayStub({ payStub, employee, onComplete, onCancel }) {
  const [editData, setEditData] = useState({
    pay_period_start: payStub.pay_period_start || '',
    pay_period_end: payStub.pay_period_end || '',
    pay_date: payStub.pay_date || '',
    federal_tax: payStub.federal_tax || 0,
    provincial_tax: payStub.provincial_tax || 0,
    cpp_deduction: payStub.cpp_deduction || 0,
    cpp2_deduction: payStub.cpp2_deduction || 0,
    ei_deduction: payStub.ei_deduction || 0,
    net_pay: payStub.net_pay || 0,
    ytd_gross: payStub.ytd_gross || 0,
    ytd_federal_tax: payStub.ytd_federal_tax || 0,
    ytd_provincial_tax: payStub.ytd_provincial_tax || 0,
    ytd_cpp: payStub.ytd_cpp || 0,
    ytd_cpp2: payStub.ytd_cpp2 || 0,
    ytd_ei: payStub.ytd_ei || 0,
    ytd_net: payStub.ytd_net || 0,
    vacation_pay_balance_forward: payStub.vacation_pay_balance_forward || 0
  });

  const [incomeBreakdown, setIncomeBreakdown] = useState(
    payStub.income_breakdown && payStub.income_breakdown.length > 0
      ? payStub.income_breakdown.map(item => ({
          type: item.type || '',
          hours: item.hours || 0,
          rate: item.rate || 0,
          unit: item.unit || 'Hour',
          amount: item.amount || 0
        }))
      : [{ type: 'Regular', hours: 0, rate: 0, unit: 'Hour', amount: payStub.gross_pay || 0 }]
  );

  const [additionalDeductions, setAdditionalDeductions] = useState(
    (payStub.additional_deductions || []).map(d => ({
      name: d.name || '',
      type: d.type || 'fixed',
      amount: d.amount || 0
    }))
  );

  const [processing, setProcessing] = useState(false);

  const handleInputChange = (field, value) => {
    const numericFields = [
      'federal_tax', 'provincial_tax', 'cpp_deduction', 'cpp2_deduction',
      'ei_deduction', 'net_pay', 'ytd_gross', 'ytd_federal_tax', 'ytd_provincial_tax',
      'ytd_cpp', 'ytd_cpp2', 'ytd_ei', 'ytd_net', 'vacation_pay_balance_forward'
    ];

    setEditData(prev => ({
      ...prev,
      [field]: numericFields.includes(field) ? parseFloat(value) || 0 : value
    }));
  };

  const handleIncomeRowChange = (index, field, value) => {
    setIncomeBreakdown(prev => {
      const rows = [...prev];
      const row = { ...rows[index] };

      if (field === 'type' || field === 'unit') {
        row[field] = value;
      } else if (field === 'hours' || field === 'rate') {
        row[field] = parseFloat(value) || 0;
        row.amount = Math.round(row.hours * row.rate * 100) / 100;
      } else if (field === 'amount') {
        row.amount = parseFloat(value) || 0;
      }

      rows[index] = row;
      return rows;
    });
  };

  const addIncomeRow = () => {
    setIncomeBreakdown(prev => [...prev, { type: '', hours: 0, rate: 0, unit: 'Hour', amount: 0 }]);
  };

  const removeIncomeRow = (index) => {
    setIncomeBreakdown(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeductionRowChange = (index, field, value) => {
    setAdditionalDeductions(prev => {
      const rows = [...prev];
      const row = { ...rows[index] };
      row[field] = field === 'amount' ? (parseFloat(value) || 0) : value;
      rows[index] = row;
      return rows;
    });
  };

  const addDeductionRow = () => {
    setAdditionalDeductions(prev => [...prev, { name: '', type: 'fixed', amount: 0 }]);
  };

  const removeDeductionRow = (index) => {
    setAdditionalDeductions(prev => prev.filter((_, i) => i !== index));
  };

  // Gross pay is derived from the income breakdown so the stub can never drift
  // out of sync with the line items that actually print on it.
  const grossPay = incomeBreakdown.reduce((sum, row) => sum + (row.amount || 0), 0);

  const additionalDeductionsTotal = additionalDeductions.reduce((sum, d) => sum + (d.amount || 0), 0);

  const totalDeductions = editData.federal_tax + editData.provincial_tax +
                         editData.cpp_deduction + editData.cpp2_deduction + editData.ei_deduction +
                         additionalDeductionsTotal;

  const calculatedNetPay = grossPay - totalDeductions;

  const handleSave = async () => {
    setProcessing(true);

    try {
      const cleanIncomeBreakdown = incomeBreakdown.filter(row => row.type.trim() !== '' || row.amount !== 0);
      const cleanAdditionalDeductions = additionalDeductions.filter(d => d.name.trim() !== '' || d.amount !== 0);

      const updatedPayStub = {
        ...editData,
        gross_pay: Math.round(grossPay * 100) / 100,
        income_breakdown: cleanIncomeBreakdown,
        additional_deductions: cleanAdditionalDeductions,
        total_deductions: Math.round(totalDeductions * 100) / 100,
        net_pay: Math.round(calculatedNetPay * 100) / 100,
        year: new Date(editData.pay_period_start).getFullYear(),
        is_paid: payStub.is_paid // Preserve the paid status on edit
      };

      await PayStub.update(payStub.id, updatedPayStub);
      alert(`Pay stub updated successfully for ${employee.first_name} ${employee.last_name}!`);
      onComplete();
    } catch (error) {
      alert("Error updating pay stub. Please try again.");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            Edit Pay Stub - {employee.first_name} {employee.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pay Period Information */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Pay Period Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Period Start</Label>
                <Input
                  type="date"
                  value={editData.pay_period_start}
                  onChange={(e) => handleInputChange('pay_period_start', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Period End</Label>
                <Input
                  type="date"
                  value={editData.pay_period_end}
                  onChange={(e) => handleInputChange('pay_period_end', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Pay Date</Label>
                <Input
                  type="date"
                  value={editData.pay_date}
                  onChange={(e) => handleInputChange('pay_date', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
            </CardContent>
          </Card>

          {/* Income Breakdown */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Income Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 bg-slate-200 dark:bg-slate-700 font-medium text-sm p-3 dark:text-slate-200">
                  <div>Pay Type</div>
                  <div className="text-center">Hours</div>
                  <div className="text-center">Rate</div>
                  <div className="text-center">Unit</div>
                  <div className="text-right">Amount</div>
                  <div></div>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {incomeBreakdown.map((row, index) => (
                    <div key={index} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 p-2 items-center">
                      <Input
                        value={row.type}
                        placeholder="e.g., Regular, Overtime, Bonus"
                        onChange={(e) => handleIncomeRowChange(index, 'type', e.target.value)}
                        className="dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Input
                        type="number"
                        step="any"
                        value={row.hours}
                        onChange={(e) => handleIncomeRowChange(index, 'hours', e.target.value)}
                        className="text-center dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={row.rate}
                        onChange={(e) => handleIncomeRowChange(index, 'rate', e.target.value)}
                        className="text-center dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Input
                        value={row.unit}
                        onChange={(e) => handleIncomeRowChange(index, 'unit', e.target.value)}
                        className="text-center dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => handleIncomeRowChange(index, 'amount', e.target.value)}
                        className="text-right font-medium dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => removeIncomeRow(index)}
                        disabled={incomeBreakdown.length === 1}
                        className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 p-3 items-center bg-slate-100 dark:bg-slate-700/60 font-semibold dark:text-slate-100">
                    <div>Gross Pay</div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div className="text-right">${grossPay.toFixed(2)}</div>
                    <div></div>
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={addIncomeRow} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" />
                Add Pay Type
              </Button>
            </CardContent>
          </Card>

          {/* Statutory Deductions */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Statutory Deductions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Federal Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.federal_tax}
                  onChange={(e) => handleInputChange('federal_tax', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Provincial Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.provincial_tax}
                  onChange={(e) => handleInputChange('provincial_tax', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">CPP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.cpp_deduction}
                  onChange={(e) => handleInputChange('cpp_deduction', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">CPP2</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.cpp2_deduction}
                  onChange={(e) => handleInputChange('cpp2_deduction', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">EI</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ei_deduction}
                  onChange={(e) => handleInputChange('ei_deduction', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
            </CardContent>
          </Card>

          {/* Additional Deductions */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Additional Deductions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {additionalDeductions.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 bg-slate-200 dark:bg-slate-700 font-medium text-sm p-3 dark:text-slate-200">
                    <div>Name</div>
                    <div className="text-center">Type</div>
                    <div className="text-right">Amount</div>
                    <div></div>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {additionalDeductions.map((row, index) => (
                      <div key={index} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 p-2 items-center">
                        <Input
                          value={row.name}
                          placeholder="e.g., Union Dues, Benefits"
                          onChange={(e) => handleDeductionRowChange(index, 'name', e.target.value)}
                          className="dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                        />
                        <Input
                          value={row.type}
                          onChange={(e) => handleDeductionRowChange(index, 'type', e.target.value)}
                          className="text-center dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => handleDeductionRowChange(index, 'amount', e.target.value)}
                          className="text-right font-medium dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removeDeductionRow(index)}
                          className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button variant="outline" onClick={addDeductionRow} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" />
                Add Deduction
              </Button>
            </CardContent>
          </Card>

          {/* Year-to-Date Totals */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Year-to-Date Totals</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD Gross</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_gross}
                  onChange={(e) => handleInputChange('ytd_gross', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD Federal Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_federal_tax}
                  onChange={(e) => handleInputChange('ytd_federal_tax', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD Provincial Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_provincial_tax}
                  onChange={(e) => handleInputChange('ytd_provincial_tax', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD CPP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_cpp}
                  onChange={(e) => handleInputChange('ytd_cpp', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD CPP2</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_cpp2}
                  onChange={(e) => handleInputChange('ytd_cpp2', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">YTD EI</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.ytd_ei}
                  onChange={(e) => handleInputChange('ytd_ei', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Vacation Balance Forward</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.vacation_pay_balance_forward}
                  onChange={(e) => handleInputChange('vacation_pay_balance_forward', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Gross Pay</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">${grossPay.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Deductions</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">${totalDeductions.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Calculated Net Pay</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">${calculatedNetPay.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">YTD Net</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">${editData.ytd_net.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
            <Button variant="outline" onClick={onCancel} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={processing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
