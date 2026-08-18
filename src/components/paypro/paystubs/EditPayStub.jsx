import React, { useState } from "react";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";

export default function EditPayStub({ payStub, employee, onComplete, onCancel }) {
  const [editData, setEditData] = useState({
    pay_period_start: payStub.pay_period_start || '',
    pay_period_end: payStub.pay_period_end || '',
    pay_date: payStub.pay_date || '',
    gross_pay: payStub.gross_pay || 0,
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

  const [processing, setProcessing] = useState(false);

  const handleInputChange = (field, value) => {
    const numericFields = [
      'gross_pay', 'federal_tax', 'provincial_tax', 'cpp_deduction', 'cpp2_deduction',
      'ei_deduction', 'net_pay', 'ytd_gross', 'ytd_federal_tax', 'ytd_provincial_tax',
      'ytd_cpp', 'ytd_cpp2', 'ytd_ei', 'ytd_net', 'vacation_pay_balance_forward'
    ];

    setEditData(prev => ({
      ...prev,
      [field]: numericFields.includes(field) ? parseFloat(value) || 0 : value
    }));
  };

  // Calculate totals automatically
  const totalDeductions = editData.federal_tax + editData.provincial_tax +
                         editData.cpp_deduction + editData.cpp2_deduction + editData.ei_deduction;

  const calculatedNetPay = editData.gross_pay - totalDeductions;

  const handleSave = async () => {
    setProcessing(true);

    try {
      // additional_deductions/income_breakdown are deliberately omitted here - the shim's
      // update() does a real UPDATE...SET with only the passed columns, so leaving these
      // two jsonb arrays out of the payload leaves them untouched (this form was never
      // meant to edit line items, matching source's intent).
      const updatedPayStub = {
        ...editData,
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

          {/* Current Period */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Current Period</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">Gross Pay</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.gross_pay}
                  onChange={(e) => handleInputChange('gross_pay', e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
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
              <div className="grid grid-cols-3 gap-4 text-center">
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
