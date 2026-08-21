import React, { useState, useEffect } from "react";
import { EmployeePayType, EmployeeDeduction, Employee, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { calculatePayrollDeductions } from "./TaxCalculator";
import { Loader2, DollarSign, ChevronDown, ChevronUp, PiggyBank, AlertCircle } from "lucide-react";
import { generatePaychequeNumber } from "./PaychequeNumberGenerator";

export default function PaychequeForm({ employee, payPeriod, ytdData, importedTimeData, onSave, saveLabel, saveIcon: SaveIcon, preAssignedPaychequeNumber }) {
  const [employeePayTypes, setEmployeePayTypes] = useState([]);
  const [employeeDeductions, setEmployeeDeductions] = useState([]);
  const [payData, setPayData] = useState({ payTypes: [], additionalDeductions: [] });
  const [advanceData, setAdvanceData] = useState({
    newAdvance: 0,
    deductAdvance: 0
  });
  const [inactiveDeductions, setInactiveDeductions] = useState(new Set());

  const toggleDeduction = (deductionId) => {
    setInactiveDeductions(prev => {
        const next = new Set(prev);
        if (next.has(deductionId)) {
            next.delete(deductionId);
        } else {
            next.add(deductionId);
        }
        return next;
    });
  };
  const [vacationPayRelease, setVacationPayRelease] = useState(0); // New state for releasing banked vacation pay
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdvanceSectionOpen, setIsAdvanceSectionOpen] = useState(false);
  const [taxYear, setTaxYear] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [payTypesFromDB, deductionsFromDB, taxYearData] = await Promise.all([
          EmployeePayType.filter({ employee_id_ref: employee.id }),
          EmployeeDeduction.filter({ employee_id_ref: employee.id, is_active: true }),
          TaxYearConstant.filter({ year: new Date(payPeriod.payDate || payPeriod.start).getFullYear() })
        ]);

        setEmployeePayTypes(payTypesFromDB);
        setEmployeeDeductions(deductionsFromDB);
        setTaxYear(taxYearData.length > 0 ? taxYearData[0] : null);

        // Initialize pay data with imported time data if available
        if (importedTimeData && importedTimeData.payTypes) {
          const initialPayTypes = [];

          Object.entries(importedTimeData.payTypes).forEach(([payTypeNameFromWorkPRO, hours]) => {
            const matchingPayTypeInPayPRO = payTypesFromDB.find(pt => pt.workpro_type === payTypeNameFromWorkPRO);

            if (matchingPayTypeInPayPRO) {
              initialPayTypes.push({
                id: matchingPayTypeInPayPRO.id,
                type: matchingPayTypeInPayPRO.pay_type_name,
                hours: parseFloat(hours.toFixed(2)),
                rate: matchingPayTypeInPayPRO.rate,
                unit: matchingPayTypeInPayPRO.unit || 'Hour',
                amount: parseFloat((hours * matchingPayTypeInPayPRO.rate).toFixed(2))
              });
            } else {
              console.warn(`Pay type "${payTypeNameFromWorkPRO}" from WorkPRO not configured for employee ${employee.first_name} ${employee.last_name}. Please add it in the Pay tab with workpro_type="${payTypeNameFromWorkPRO}".`);
              initialPayTypes.push({
                id: null,
                type: payTypeNameFromWorkPRO,
                hours: parseFloat(hours.toFixed(2)),
                rate: 0,
                unit: 'Hour',
                amount: 0,
                warning: `Rate not configured for WorkPRO type "${payTypeNameFromWorkPRO}" in PayPRO`
              });
            }
          });

          setPayData({ payTypes: initialPayTypes, additionalDeductions: [] });
        } else {
          const initialPayTypesForManualEntry = payTypesFromDB.map(pt => ({
            id: pt.id,
            type: pt.pay_type_name,
            hours: 0,
            rate: pt.rate,
            unit: pt.unit || 'Hour',
            amount: 0
          }));
          setPayData({ payTypes: initialPayTypesForManualEntry, additionalDeductions: [] });
        }
      } catch (error) {
        console.error("Error loading pay form data:", error);
        setEmployeePayTypes([]);
        setEmployeeDeductions([]);
        setTaxYear(null);
        setPayData({ payTypes: [], additionalDeductions: [] });
      }
      setLoading(false);
    };

    if (employee && payPeriod) {
      loadData();
    }
  }, [employee, payPeriod, importedTimeData]);

  const handleInputChange = (index, value) => {
    setPayData(prevPayData => {
      const newPayTypes = [...prevPayData.payTypes];
      const updatedPayType = { ...newPayTypes[index] };
      const hours = parseFloat(value) || 0;

      updatedPayType.hours = hours;
      updatedPayType.amount = updatedPayType.rate !== undefined && updatedPayType.rate !== null
                              ? hours * updatedPayType.rate
                              : 0;

      newPayTypes[index] = updatedPayType;

      return { ...prevPayData, payTypes: newPayTypes };
    });
  };

  const handleAdvanceChange = (field, value) => {
    setAdvanceData(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  // Calculate base gross earnings from pay types (excluding vacation pay)
  const baseGrossEarnings = payData.payTypes.reduce((total, payType) => {
    return total + (payType.amount || 0);
  }, 0);

  // Calculate vacation pay amount
  const vacationPayRate = employee.vacation_pay_rate || 0;
  const vacationPayEarned = baseGrossEarnings * vacationPayRate;

  // Determine if vacation pay is banked or paid directly
  const isVacationBanked = employee.is_vacation_banked || false;

  // If vacation is banked, it's NOT added to gross earnings
  // If vacation is NOT banked, it IS added to gross earnings
  const vacationPayAddedToGross = isVacationBanked ? 0 : vacationPayEarned;

  // If banked vacation is being released, add it to gross earnings
  const grossEarnings = baseGrossEarnings + vacationPayAddedToGross + vacationPayRelease;

  // Pass taxYear (which contains all constants including brackets) to the calculator
  // If taxYear is null (not loaded yet), the calculator will throw/fail, so we handle that or wait for it.
  const standardDeductions = taxYear
    ? calculatePayrollDeductions(grossEarnings, employee.pay_frequency || 'semi_monthly', employee, ytdData, taxYear)
    : { federalTax: 0, provincialTax: 0, cppDeduction: 0, cpp2Deduction: 0, eiDeduction: 0, totalDeductions: 0, netPay: 0 };

  // Calculate base for percentage deductions (Gross - Statutory Deductions)
  const baseForPercentageDeductions = grossEarnings - standardDeductions.totalDeductions;

  const additionalDeductionsTotal = employeeDeductions.reduce((total, deduction) => {
    if (inactiveDeductions.has(deduction.id)) return total;
    if (deduction.deduction_type === 'percentage') {
      return total + (baseForPercentageDeductions * (deduction.amount / 100));
    }
    return total + deduction.amount;
  }, 0);

  const advanceBalance = employee.advance_balance || 0;
  const netAdvanceChange = advanceData.newAdvance - advanceData.deductAdvance;
  const newAdvanceBalance = advanceBalance + netAdvanceChange;

  const totalDeductions = standardDeductions.totalDeductions + additionalDeductionsTotal + advanceData.deductAdvance;
  const netPay = grossEarnings - totalDeductions + advanceData.newAdvance;

  // Calculate new banked vacation balance
  const currentBankedBalance = employee.banked_vacation_pay_balance || 0;
  const newBankedBalance = currentBankedBalance + vacationPayEarned - vacationPayRelease;

  const handleSaveClick = async () => {
    if (grossEarnings === 0) {
      alert("Please enter some hours or pay amounts before creating the paycheque.");
      return;
    }

    // Validation: Can't release more than available balance
    if (vacationPayRelease > currentBankedBalance) {
      alert(`Cannot release $${vacationPayRelease.toFixed(2)} - only $${currentBankedBalance.toFixed(2)} available in banked vacation pay.`);
      return;
    }

    setSaving(true);

    try {
      // Use pre-assigned paycheque number if provided (batch mode), otherwise generate new one
      const paychequeNumber = preAssignedPaychequeNumber || await generatePaychequeNumber(payPeriod.end);

      // Build income breakdown from pay types
      const incomeBreakdown = payData.payTypes.map(item => ({
        type: item.type,
        hours: item.hours || 0,
        rate: item.rate,
        unit: item.unit || 'Hour',
        amount: item.amount || 0
      })).filter(item => item.amount > 0);

      // Add vacation pay to income breakdown ONLY if it's paid this period (not banked)
      if (vacationPayAddedToGross > 0) {
        incomeBreakdown.push({
          type: 'Vacation Pay',
          hours: 0,
          rate: 0,
          unit: '',
          amount: vacationPayAddedToGross
        });
      }

      // Add released banked vacation pay to income breakdown if applicable
      if (vacationPayRelease > 0) {
        incomeBreakdown.push({
          type: 'Vacation Pay (Released from Bank)',
          hours: 0,
          rate: 0,
          unit: '',
          amount: vacationPayRelease
        });
      }

      const roundedGrossPay = Math.round(grossEarnings * 100) / 100;

      // Round individual deductions first
      const roundedFederalTax = Math.round(standardDeductions.federalTax * 100) / 100;
      const roundedProvincialTax = Math.round(standardDeductions.provincialTax * 100) / 100;
      const roundedCppDeduction = Math.round(standardDeductions.cppDeduction * 100) / 100;
      const roundedCpp2Deduction = Math.round((standardDeductions.cpp2Deduction || 0) * 100) / 100;
      const roundedEiDeduction = Math.round(standardDeductions.eiDeduction * 100) / 100;
      const roundedAdvanceDeduction = Math.round(advanceData.deductAdvance * 100) / 100;

      // Calculate statutory deductions sum for percentage base
      const statutoryDeductionsSum = roundedFederalTax + roundedProvincialTax + roundedCppDeduction + roundedCpp2Deduction + roundedEiDeduction;
      const baseForPercentageDeductionsSave = roundedGrossPay - statutoryDeductionsSum;

      const additionalDeductionsList = employeeDeductions
        .filter(deduction => !inactiveDeductions.has(deduction.id))
        .map(deduction => {
          const deductionAmount = deduction.deduction_type === 'percentage'
            ? baseForPercentageDeductionsSave * (deduction.amount / 100)
            : deduction.amount;
          return {
            name: deduction.deduction_name,
            type: deduction.deduction_type,
            amount: Math.round(deductionAmount * 100) / 100
          };
        });

      // Calculate total deductions from already-rounded values to avoid penny discrepancies
      const additionalDeductionsSum = additionalDeductionsList.reduce((sum, ded) => sum + ded.amount, 0);
      const calculatedTotalDeductions = roundedFederalTax + roundedProvincialTax + roundedCppDeduction +
                                       roundedCpp2Deduction + roundedEiDeduction +
                                       additionalDeductionsSum + roundedAdvanceDeduction;
      const roundedNewAdvance = Math.round(advanceData.newAdvance * 100) / 100;
      const calculatedNetPay = roundedGrossPay - calculatedTotalDeductions + roundedNewAdvance;

      const payStubData = {
        employee_id: employee.employee_id,
        paycheque_number: paychequeNumber,
        pay_period_start: payPeriod.start,
        pay_period_end: payPeriod.end,
        pay_date: payPeriod.payDate,
        gross_pay: roundedGrossPay,
        income_breakdown: incomeBreakdown,
        vacation_pay_this_period: Math.round(vacationPayAddedToGross * 100) / 100,
        federal_tax: roundedFederalTax,
        provincial_tax: roundedProvincialTax,
        cpp_deduction: roundedCppDeduction,
        cpp2_deduction: roundedCpp2Deduction,
        ei_deduction: roundedEiDeduction,
        additional_deductions: additionalDeductionsList,
        total_deductions: calculatedTotalDeductions,
        net_pay: calculatedNetPay,
        year: new Date(payPeriod.payDate || payPeriod.start).getFullYear(),
        ytd_gross: Math.round((ytdData.gross + grossEarnings) * 100) / 100,
        ytd_federal_tax: Math.round((ytdData.federal_tax + standardDeductions.federalTax) * 100) / 100,
        ytd_provincial_tax: Math.round((ytdData.provincial_tax + standardDeductions.provincialTax) * 100) / 100,
        ytd_cpp: Math.round((ytdData.cpp + standardDeductions.cppDeduction) * 100) / 100,
        ytd_cpp2: Math.round((ytdData.cpp2 + (standardDeductions.cpp2Deduction || 0)) * 100) / 100,
        ytd_ei: Math.round((ytdData.ei + standardDeductions.eiDeduction) * 100) / 100,
        ytd_net: Math.round((ytdData.net + netPay) * 100) / 100,
        vacation_pay_balance_forward: employee.banked_vacation_pay_balance || 0,
        comments: comments || null
      };

      // Prepare employee updates
      const employeeUpdates = {};

      // Update employee's advance balance if there were any advance transactions
      if (netAdvanceChange !== 0) {
        employeeUpdates.advance_balance = Math.round(newAdvanceBalance * 100) / 100;
      }

      // Update employee's banked vacation pay balance if they're enrolled
      if (isVacationBanked && (vacationPayEarned > 0 || vacationPayRelease > 0)) {
        employeeUpdates.banked_vacation_pay_balance = Math.round(newBankedBalance * 100) / 100;
      }

      // Apply employee updates if there are any
      if (Object.keys(employeeUpdates).length > 0) {
        await Employee.update(employee.id, employeeUpdates);
      }

      onSave(payStubData);

    } catch (error) {
      console.error("Error creating paycheque:", error);
      alert("Error creating paycheque. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 w-8 animate-spin text-blue-800 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="border dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900 space-y-6">
      <h4 className="font-semibold text-md dark:text-slate-100">Pay Details for {employee.first_name} {employee.last_name}</h4>

      {employee.alerts && employee.alerts.replace(/<[^>]+>/g, '').trim() !== '' && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/40 text-purple-900 dark:text-purple-300 p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 mb-2 font-semibold">
            <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Alerts / Reminders
          </div>
          <div
            className="text-sm [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: employee.alerts }}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Pay Types Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 border-b dark:border-slate-700 pb-2">Pay Types</h3>
          {payData.payTypes.length === 0 && (!importedTimeData || Object.keys(importedTimeData.payTypes).length === 0) ? (
            <div className="text-center py-6 text-slate-500 dark:text-slate-400">
              <p>No pay types configured for this employee.</p>
              <p className="text-sm">Add pay types in the employee's Pay tab or import from WorkPRO.</p>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-5 gap-0 bg-slate-200 dark:bg-slate-700 font-medium text-sm p-3 dark:text-slate-200">
                <div>Pay Type</div>
                <div className="text-center">Hours</div>
                <div className="text-center">Rate</div>
                <div className="text-center">Unit</div>
                <div className="text-right">Line Total</div>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {payData.payTypes.map((item, index) => {
                  return (
                    <React.Fragment key={`${item.type}-${index}`}>
                      <div className="grid grid-cols-5 gap-0 p-3 items-center">
                        <Label className="font-medium dark:text-slate-200">{item.type}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={item.hours}
                          onChange={(e) => handleInputChange(index, e.target.value)}
                          className="text-center border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <div className="text-center font-medium dark:text-slate-200">${item.rate.toFixed(2)}</div>
                        <div className="text-center text-slate-600 dark:text-slate-400">{item.unit || 'Hour'}</div>
                        <div className="text-right font-medium dark:text-slate-200">${item.amount.toFixed(2)}</div>
                      </div>
                      {item.warning && (
                        <div className="col-span-5 text-sm text-red-600 dark:text-red-400 px-3 pb-1 -mt-1 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-900/40">
                          Warning: {item.warning}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Vacation Pay Display - Different behavior based on banking status */}
                {vacationPayEarned > 0 && (
                  <>
                    {isVacationBanked ? (
                      <div className="grid grid-cols-5 gap-0 p-3 items-center bg-green-50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-900/40">
                        <Label className="font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
                          <PiggyBank className="w-4 h-4" />
                          Vacation Pay ({(vacationPayRate * 100).toFixed(1)}%) - Banked
                        </Label>
                        <div className="text-center text-green-700 dark:text-green-400">-</div>
                        <div className="text-center text-green-700 dark:text-green-400">-</div>
                        <div className="text-center text-green-700 dark:text-green-400">-</div>
                        <div className="text-right font-medium text-green-800 dark:text-green-300">${vacationPayEarned.toFixed(2)}</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-0 p-3 items-center bg-blue-50 dark:bg-blue-900/20">
                        <Label className="font-medium text-blue-800 dark:text-blue-300">Vacation Pay ({(vacationPayRate * 100).toFixed(1)}%)</Label>
                        <div className="text-center text-blue-700 dark:text-blue-400">-</div>
                        <div className="text-center text-blue-700 dark:text-blue-400">-</div>
                        <div className="text-center text-blue-700 dark:text-blue-400">-</div>
                        <div className="text-right font-medium text-blue-800 dark:text-blue-300">${vacationPayEarned.toFixed(2)}</div>
                      </div>
                    )}
                  </>
                )}

                {/* Released Vacation Pay */}
                {vacationPayRelease > 0 && (
                  <div className="grid grid-cols-5 gap-0 p-3 items-center bg-emerald-50 dark:bg-emerald-900/20 border-t-2 border-emerald-200 dark:border-emerald-900/40">
                    <Label className="font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <PiggyBank className="w-4 h-4" />
                      Vacation Pay Released
                    </Label>
                    <div className="text-center text-emerald-700 dark:text-emerald-400">-</div>
                    <div className="text-center text-emerald-700 dark:text-emerald-400">-</div>
                    <div className="text-center text-emerald-700 dark:text-emerald-400">-</div>
                    <div className="text-right font-medium text-emerald-800 dark:text-emerald-300">${vacationPayRelease.toFixed(2)}</div>
                  </div>
                )}

                <div className="grid grid-cols-5 gap-0 p-3 items-center bg-slate-100 dark:bg-slate-700/60 font-semibold dark:text-slate-100">
                  <div>Total</div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div className="text-right text-lg">${grossEarnings.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Banked Vacation Pay Release Section */}
          {isVacationBanked && currentBankedBalance > 0 && (
            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/40 mt-4">
              <CardHeader>
                <CardTitle className="text-lg text-green-900 dark:text-green-300 flex items-center gap-2">
                  <PiggyBank className="w-5 h-5" />
                  Release Banked Vacation Pay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-2 bg-white dark:bg-slate-900 rounded border border-green-200 dark:border-green-900/40">
                  <span className="text-sm text-green-800 dark:text-green-300">Available Balance:</span>
                  <span className="font-bold text-green-900 dark:text-green-200">${currentBankedBalance.toFixed(2)}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vacation_release" className="text-green-900 dark:text-green-300">
                    Amount to Release This Period
                  </Label>
                  <Input
                    id="vacation_release"
                    type="number"
                    step="0.01"
                    min="0"
                    max={currentBankedBalance}
                    value={vacationPayRelease}
                    onChange={(e) => setVacationPayRelease(parseFloat(e.target.value) || 0)}
                    className="border-green-300 dark:border-green-800 focus:border-green-500 bg-white dark:bg-slate-900 dark:text-slate-100"
                  />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    This amount will be added to gross earnings and subject to regular deductions
                  </p>
                </div>
                {(vacationPayEarned > 0 || vacationPayRelease > 0) && (
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 dark:border-green-800">
                    <p className="text-sm text-green-900 dark:text-green-200">
                      <span className="font-semibold">New Balance After This Period:</span>{' '}
                      ${newBankedBalance.toFixed(2)}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      (Current: ${currentBankedBalance.toFixed(2)} + Earned: ${vacationPayEarned.toFixed(2)} - Released: ${vacationPayRelease.toFixed(2)})
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Deductions and Advances */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 border-b dark:border-slate-700 pb-2">Deductions</h3>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg overflow-hidden">
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              <div className="grid grid-cols-2 gap-0 p-3 items-center"><Label className="dark:text-slate-200">EI Payable</Label><div className="text-right dark:text-slate-200">${standardDeductions.eiDeduction.toFixed(2)}</div></div>
              <div className="grid grid-cols-2 gap-0 p-3 items-center"><Label className="dark:text-slate-200">Income Tax</Label><div className="text-right dark:text-slate-200">${(standardDeductions.federalTax + standardDeductions.provincialTax).toFixed(2)}</div></div>
              <div className="grid grid-cols-2 gap-0 p-3 items-center"><Label className="dark:text-slate-200">CPP</Label><div className="text-right dark:text-slate-200">${standardDeductions.cppDeduction.toFixed(2)}</div></div>
              {(standardDeductions.cpp2Deduction || 0) > 0 && (
                <div className="grid grid-cols-2 gap-0 p-3 items-center"><Label className="dark:text-slate-200">Enhanced CPP (CPP2)</Label><div className="text-right dark:text-slate-200">${standardDeductions.cpp2Deduction.toFixed(2)}</div></div>
              )}
              {employeeDeductions.map(deduction => {
                const isInactive = inactiveDeductions.has(deduction.id);
                const deductionAmount = isInactive ? 0 : (deduction.deduction_type === 'percentage'
                    ? baseForPercentageDeductions * (deduction.amount / 100)
                    : deduction.amount);
                return (
                  <div
                    key={deduction.id}
                    className={`grid grid-cols-2 gap-0 p-3 items-center cursor-pointer transition-colors ${isInactive ? 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-300 border-l-4 border-red-500 dark:border-red-700' : 'hover:bg-slate-100 dark:hover:bg-slate-700/60 border-l-4 border-transparent dark:text-slate-200'}`}
                    onClick={() => toggleDeduction(deduction.id)}
                    title="Click to toggle this deduction"
                  >
                    <Label className={`cursor-pointer ${isInactive ? 'text-red-900 dark:text-red-300' : 'dark:text-slate-200'}`}>
                      {deduction.deduction_name} {deduction.deduction_type === 'percentage' && `(${deduction.amount}%)`}
                      {isInactive && " (Skipped)"}
                    </Label>
                    <div className={`text-right ${isInactive ? 'opacity-50 line-through' : ''}`}>
                      ${deductionAmount.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Advance Management - Collapsible */}
          <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/40">
            <CardHeader
              className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors duration-200"
              onClick={() => setIsAdvanceSectionOpen(!isAdvanceSectionOpen)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
                  <CardTitle className="text-lg text-yellow-900 dark:text-yellow-300">Advance Management</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-yellow-200 dark:hover:bg-yellow-900/40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAdvanceSectionOpen(!isAdvanceSectionOpen);
                  }}
                >
                  {isAdvanceSectionOpen ? (
                    <ChevronUp className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
                  )}
                </Button>
              </div>
              {!isAdvanceSectionOpen && (
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  Current Balance: ${advanceBalance.toFixed(2)}
                </p>
              )}
            </CardHeader>

            {isAdvanceSectionOpen && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-yellow-900 dark:text-yellow-300">Current Advance Balance</Label>
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-800">
                      <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">
                        ${advanceBalance.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="advance_new_advance" className="text-yellow-900 dark:text-yellow-300">
                      Give New Advance
                    </Label>
                    <Input
                      id="advance_new_advance"
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceData.newAdvance}
                      onChange={(e) => handleAdvanceChange('newAdvance', e.target.value)}
                      className="border-yellow-300 dark:border-yellow-800 focus:border-yellow-500 bg-white dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="advance_deduction" className="text-yellow-900 dark:text-yellow-300">
                    Deduct from This Paycheque
                  </Label>
                  <Input
                    id="advance_deduction"
                    type="number"
                    step="0.01"
                    min="0"
                    max={advanceBalance + advanceData.newAdvance}
                    value={advanceData.deductAdvance}
                    onChange={(e) => handleAdvanceChange('deductAdvance', e.target.value)}
                    className="border-yellow-300 dark:border-yellow-800 focus:border-yellow-500 bg-white dark:bg-slate-900 dark:text-slate-100"
                  />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Maximum deduction: ${(advanceBalance + advanceData.newAdvance).toFixed(2)}
                  </p>
                </div>

                {(advanceData.newAdvance > 0 || advanceData.deductAdvance > 0) && (
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-800">
                    <p className="text-sm text-yellow-900 dark:text-yellow-200">
                      <span className="font-semibold">New Advance Balance After Transactions:</span>{' '}
                      ${newAdvanceBalance.toFixed(2)}
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
            <div className="flex justify-between items-center font-semibold">
              <div className="dark:text-emerald-300">Net Pay</div><div className="text-lg text-emerald-800 dark:text-emerald-300">${netPay.toFixed(2)}</div>
            </div>
          </div>

          <Button
            onClick={handleSaveClick}
            disabled={grossEarnings <= 0 || saving}
            className="w-full bg-blue-800 hover:bg-blue-900 dark:bg-blue-700 dark:hover:bg-blue-600 text-white py-3 text-lg"
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : (SaveIcon && <SaveIcon className="mr-2 h-5 w-5" />)}
            {saving ? "Saving..." : (saveLabel || "Save")}
          </Button>
        </div>
      </div>

      {/* Comments Section */}
      <div className="border-t dark:border-slate-700 pt-6 mt-6">
        <Label htmlFor="paycheque-comments" className="text-base font-semibold mb-2 block dark:text-slate-100">
          Comments / Notes
        </Label>
        <Textarea
          id="paycheque-comments"
          placeholder="Add any notes or comments for this paycheque (optional)..."
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="resize-y dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
