import React, { useState, useEffect } from "react";
import moment from "moment-timezone";
import { PayStub, Employee, EmployeeDeduction, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { supabase } from "@/lib/supabase";
import { checkFiscalPeriodStatus } from "@/components/utils/fiscalPeriodUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, X, Banknote, CalendarDays, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const getMountainTimestamp = () => moment.tz('America/Edmonton').format();
const generateId = () => crypto.randomUUID().replace(/-/g, '').substring(0, 24);

// This is the phase's core deliverable: replaces the old exportPaystubs+manual-MarkPaidModal
// handoff with one action that posts real GLTransaction/BankTransaction rows directly, gated
// by the Fiscal Period check (O-5/O-10). GL mapping ported from src/components/payroll/MarkPaidModal.jsx's
// handleMarkPaid, adapted to PayPro_PayStub's own field names.
export default function BatchPaymentModal({ stubs, onComplete, onCancel }) {
  const [payDate, setPayDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [busDriverFlags, setBusDriverFlags] = useState({});

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      try {
        const employeeIds = [...new Set(stubs.map(s => s.employee_id))];
        const [employeeList, allDeductions, accountsResult] = await Promise.all([
          Employee.filter({ employee_id: { '$in': employeeIds } }),
          EmployeeDeduction.list(),
          // getBankAccounts is deleted (D4) - read BankAccount natively.
          supabase.from('BankAccount').select('*').eq('is_active', true),
        ]);
        if (accountsResult.error) throw accountsResult.error;

        setEmployees(employeeList);
        setDeductions(allDeductions);
        setBankAccounts(accountsResult.data || []);

        // Bus Driver GL split default (O-6): pre-filled from PayPro_Employee.employee_type,
        // but stays operator-overridable per stub.
        setBusDriverFlags((prev) => {
          const next = { ...prev };
          for (const stub of stubs) {
            if (next[stub.id] === undefined) {
              const employee = employeeList.find((e) => e.employee_id === stub.employee_id);
              next[stub.id] = employee?.employee_type === 'Bus Driver';
            }
          }
          return next;
        });
      } catch (err) {
        console.error('Error loading batch payment data:', err);
        setError('Failed to load employees/bank accounts. Please try again.');
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getEmployee = (employeeId) => employees.find((e) => e.employee_id === employeeId);

  // Joins additional_deductions[].name (stub-time snapshot) against EmployeeDeduction.deduction_name
  // (live config) - case-insensitive, trimmed, matched to the employee's system id (D7, lesson row).
  const getResolvedDeductions = (stub) => {
    const employee = getEmployee(stub.employee_id);
    return (stub.additional_deductions || []).map((d) => {
      const record = employee
        ? deductions.find((ed) =>
            ed.employee_id_ref === employee.id &&
            (ed.deduction_name || '').trim().toLowerCase() === (d.name || '').trim().toLowerCase()
          )
        : null;
      return { ...d, gl_account: record?.gl_account || null };
    });
  };

  const handleBusDriverToggle = (stubId, isBusDriver) => {
    setBusDriverFlags((prev) => ({ ...prev, [stubId]: isBusDriver }));
  };

  const handleGeneratePreview = () => {
    setError('');
    if (!payDate) {
      setError('Please select a pay date.');
      return;
    }
    if (!selectedBankAccountId) {
      setError('Please select a bank account.');
      return;
    }
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    setError('');

    const hasUnselectedBusDriverFlags = stubs.some((stub) => busDriverFlags[stub.id] === undefined);
    if (hasUnselectedBusDriverFlags) {
      setError("Please select Yes or No for 'Bus Driver Wages?' for all paycheques.");
      return;
    }

    setProcessing(true);

    try {
      // O-10/D2: Fiscal Period gate runs before any write, gated on the batch's shared pay date.
      const fiscalStatus = await checkFiscalPeriodStatus(payDate);
      if (!fiscalStatus.isValid) {
        setError(fiscalStatus.message);
        setProcessing(false);
        return;
      }

      const selectedAccount = bankAccounts.find((a) => a.id === selectedBankAccountId);
      if (!selectedAccount) {
        setError('Selected bank account not found.');
        setProcessing(false);
        return;
      }

      const taxYearConstants = await TaxYearConstant.list();
      const getEmployerMultiplier = (year) => {
        const row = taxYearConstants.find((c) => c.year === year);
        return row?.ei_rate_employer_multiplier ?? 1.4;
      };

      // Resolve every stub's additional-deduction GL accounts up front and block if any
      // fails to resolve, rather than silently dropping the line - a dropped line would
      // break the balance check below and post an unbalanced GL batch.
      const stubDeductions = {};
      for (const stub of stubs) {
        const resolved = getResolvedDeductions(stub);
        const unresolved = resolved.find((d) => (d.amount || 0) > 0 && !d.gl_account);
        if (unresolved) {
          const employee = getEmployee(stub.employee_id);
          const employeeLabel = employee ? `${employee.first_name} ${employee.last_name}` : stub.employee_id;
          throw new Error(
            `${employeeLabel}: no GL account is configured for the deduction "${unresolved.name}". Set one on this employee's Deductions tab before processing this payment.`
          );
        }
        stubDeductions[stub.id] = resolved;
      }

      // Balance check (ported, 0.02 tolerance preserved from MarkPaidModal.jsx).
      let totalDebits = 0;
      let totalCredits = 0;
      for (const stub of stubs) {
        const multiplier = getEmployerMultiplier(stub.year);
        const employerCppMatch = (stub.cpp_deduction || 0) + (stub.cpp2_deduction || 0);
        const employerEi = (stub.ei_deduction || 0) * multiplier;
        const additionalDeductionsTotal = (stubDeductions[stub.id] || []).reduce((s, d) => s + (d.amount || 0), 0);

        totalCredits +=
          (stub.net_pay || 0) +
          (stub.federal_tax || 0) + (stub.provincial_tax || 0) +
          (stub.cpp_deduction || 0) + (stub.cpp2_deduction || 0) +
          (stub.ei_deduction || 0) +
          additionalDeductionsTotal +
          employerCppMatch +
          employerEi;

        totalDebits += (stub.gross_pay || 0) + employerCppMatch + employerEi;
      }

      if (Math.abs(totalDebits - totalCredits) > 0.02) {
        throw new Error(`GL transactions do not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
      }

      // Sequential per-stub loop (ported: not Promise.all, awaited in order). Note: like the
      // MarkPaidModal.jsx pattern this is adapted from, there is no transaction wrapping - a
      // mid-batch failure leaves prior iterations' writes in place. Inherited, pre-existing
      // gap in the pattern being ported, not fixed here (see Phase 6 plan §6C task list).
      const glRowsToInsert = [];
      for (const stub of stubs) {
        const multiplier = getEmployerMultiplier(stub.year);
        const isBusDriver = !!busDriverFlags[stub.id];
        const reference = stub.paycheque_number || stub.id;
        const netPay = stub.net_pay || 0;

        // lesson 6: PayStub writes go through the shim, not a raw .update().
        await PayStub.update(stub.id, { is_paid: true, pay_date: payDate, paid_via: 'Direct Deposit' });

        const mountainTimestamp = getMountainTimestamp();
        const { error: bankTxError } = await supabase.from('BankTransaction').insert({
          id: generateId(),
          bank_account_id: selectedAccount.id,
          transaction_date: payDate,
          description: `Paycheque ${stub.paycheque_number || ''}`,
          reference,
          debit_amount: netPay,
          credit_amount: 0,
          cleared: false,
          source_type: 'payment',
          source_id: stub.id,
          gl_account: 'Split',
          created_date: mountainTimestamp,
          updated_date: mountainTimestamp,
        });
        if (bankTxError) throw new Error(`Bank transaction failed for ${reference}: ${bankTxError.message}`);

        // Credit Bank Account (payment out)
        glRowsToInsert.push({
          account_number: selectedAccount.gl_account || '1000',
          transaction_date: payDate,
          description: `Paycheque payment ${stub.paycheque_number || ''}`,
          reference,
          debit_amount: 0,
          credit_amount: netPay,
          source_type: 'payment',
          source_id: stub.id,
        });

        // Debit Payroll Expense Account - 5009 Bus Driver Wages, 5008 Regular Wages (O-6)
        const expenseAccount = isBusDriver ? '5009' : '5008';
        const expenseLabel = isBusDriver ? 'Bus Driver Wages' : 'Wages & Salaries';
        glRowsToInsert.push({
          account_number: expenseAccount,
          transaction_date: payDate,
          description: `${expenseLabel} ${stub.paycheque_number || ''}`,
          reference,
          debit_amount: stub.gross_pay || 0,
          credit_amount: 0,
          source_type: 'payment',
          source_id: stub.id,
        });

        const incomeTax = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
        if (incomeTax > 0) {
          glRowsToInsert.push({
            account_number: '2054',
            transaction_date: payDate,
            description: `Income tax withheld ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: 0,
            credit_amount: incomeTax,
            source_type: 'payment',
            source_id: stub.id,
          });
        }

        // Combined CPP+CPP2 into the single CPP Payable line (2052)
        const totalCppEmployee = (stub.cpp_deduction || 0) + (stub.cpp2_deduction || 0);
        if (totalCppEmployee > 0) {
          glRowsToInsert.push({
            account_number: '2052',
            transaction_date: payDate,
            description: `CPP/CPP2 withheld ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: 0,
            credit_amount: totalCppEmployee,
            source_type: 'payment',
            source_id: stub.id,
          });
        }

        if ((stub.ei_deduction || 0) > 0) {
          glRowsToInsert.push({
            account_number: '2053',
            transaction_date: payDate,
            description: `EI withheld ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: 0,
            credit_amount: stub.ei_deduction,
            source_type: 'payment',
            source_id: stub.id,
          });
        }

        for (const deduction of stubDeductions[stub.id] || []) {
          if ((deduction.amount || 0) > 0 && deduction.gl_account) {
            glRowsToInsert.push({
              account_number: deduction.gl_account,
              transaction_date: payDate,
              description: `${deduction.name} withheld ${stub.paycheque_number || ''}`,
              reference,
              debit_amount: 0,
              credit_amount: deduction.amount,
              source_type: 'payment',
              source_id: stub.id,
            });
          }
        }

        // Employer Contributions
        if (totalCppEmployee > 0) {
          glRowsToInsert.push({
            account_number: '5006',
            transaction_date: payDate,
            description: `CPP Employer Expense ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: totalCppEmployee,
            credit_amount: 0,
            source_type: 'payment',
            source_id: stub.id,
          });
          glRowsToInsert.push({
            account_number: '2052',
            transaction_date: payDate,
            description: `CPP Employer Liability ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: 0,
            credit_amount: totalCppEmployee,
            source_type: 'payment',
            source_id: stub.id,
          });
        }

        const employerEi = (stub.ei_deduction || 0) * multiplier;
        if (employerEi > 0) {
          glRowsToInsert.push({
            account_number: '5007',
            transaction_date: payDate,
            description: `EI Employer Expense ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: employerEi,
            credit_amount: 0,
            source_type: 'payment',
            source_id: stub.id,
          });
          glRowsToInsert.push({
            account_number: '2053',
            transaction_date: payDate,
            description: `EI Employer Liability ${stub.paycheque_number || ''}`,
            reference,
            debit_amount: 0,
            credit_amount: employerEi,
            source_type: 'payment',
            source_id: stub.id,
          });
        }
      }

      if (glRowsToInsert.length > 0) {
        const glRowsWithIds = glRowsToInsert.map((row) => ({ id: generateId(), ...row }));
        const { error: glError } = await supabase.from('GLTransaction').insert(glRowsWithIds);
        if (glError) throw new Error(`GL posting failed (paycheques were still marked paid - reconcile manually): ${glError.message}`);
      }

      const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: selectedAccount.id },
      });
      if (balanceError) throw balanceError;
      if (balanceData?.error) throw new Error(balanceData.error);

      onComplete();
    } catch (err) {
      console.error('Error processing batch payment:', err);
      setError(err.message || 'An error occurred while processing the batch payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const totalPay = stubs.reduce((acc, stub) => acc + (stub.net_pay || 0), 0);

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Send className="w-5 h-5" />
            Process Batch Payment
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            You are about to mark {stubs.length} paycheque{stubs.length !== 1 ? 's' : ''} as paid and post the corresponding GL/Bank entries.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {loadingData ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : !showPreview ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <Banknote className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Paycheques</p>
                    <p className="text-lg font-bold dark:text-slate-100">{stubs.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <CalendarDays className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">Total Net Pay</p>
                    <p className="text-lg font-bold text-emerald-900 dark:text-emerald-200">${totalPay.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-date" className="font-semibold dark:text-slate-300">Pay Date *</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank-account" className="font-semibold dark:text-slate-300">Bank Account *</Label>
                  <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                    <SelectTrigger id="bank-account" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
                      <SelectValue placeholder="Select a bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} {account.account_number ? `(${account.account_number})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                <Button variant="outline" onClick={onCancel} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleGeneratePreview} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Review Payment
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg max-h-96 overflow-y-auto divide-y dark:divide-slate-700">
                  {stubs.map((stub) => {
                    const employee = getEmployee(stub.employee_id);
                    const resolvedDeductions = getResolvedDeductions(stub);
                    const incomeItems = stub.income_breakdown || [{ type: 'Regular', hours: 0, rate: 0, amount: stub.gross_pay }];
                    return (
                      <div key={stub.id} className="p-4 bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b dark:border-slate-700">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {employee ? `${employee.first_name} ${employee.last_name}` : stub.employee_id}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Paycheque: {stub.paycheque_number || 'N/A'}</p>
                          </div>
                          <div className="flex flex-col space-y-1 bg-slate-50 dark:bg-slate-800 p-2 rounded-md border dark:border-slate-700 min-w-[200px]">
                            <Label className="font-semibold text-sm text-slate-700 dark:text-slate-300">Bus Driver Wages?</Label>
                            <RadioGroup
                              value={busDriverFlags[stub.id] === undefined ? "" : (busDriverFlags[stub.id] ? "yes" : "no")}
                              onValueChange={(val) => handleBusDriverToggle(stub.id, val === "yes")}
                              className="flex space-x-4"
                            >
                              <div className="flex items-center space-x-1">
                                <RadioGroupItem value="yes" id={`bus-yes-${stub.id}`} />
                                <Label htmlFor={`bus-yes-${stub.id}`} className="cursor-pointer dark:text-slate-300">Yes</Label>
                              </div>
                              <div className="flex items-center space-x-1">
                                <RadioGroupItem value="no" id={`bus-no-${stub.id}`} />
                                <Label htmlFor={`bus-no-${stub.id}`} className="cursor-pointer dark:text-slate-300">No</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Income</p>
                            {incomeItems.map((item, i) => (
                              <div key={i} className="flex justify-between text-slate-600 dark:text-slate-400">
                                <span>{item.type}</span>
                                <span>${(item.amount || 0).toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 pt-1 border-t dark:border-slate-700 mt-1">
                              <span>Gross Pay</span>
                              <span>${(stub.gross_pay || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Deductions</p>
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>Federal + Provincial Tax</span>
                              <span>${((stub.federal_tax || 0) + (stub.provincial_tax || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>CPP/CPP2</span>
                              <span>${((stub.cpp_deduction || 0) + (stub.cpp2_deduction || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>EI</span>
                              <span>${(stub.ei_deduction || 0).toFixed(2)}</span>
                            </div>
                            {resolvedDeductions.map((d, i) => (
                              <div key={i} className={`flex justify-between ${!d.gl_account && (d.amount || 0) > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                                <span>{d.name} {d.gl_account ? `(GL ${d.gl_account})` : (d.amount || 0) > 0 ? '(no GL account!)' : ''}</span>
                                <span>${(d.amount || 0).toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 pt-1 border-t dark:border-slate-700 mt-1">
                              <span>Net Pay</span>
                              <span>${(stub.net_pay || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(false)}
                  disabled={processing}
                  className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={processing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Confirm &amp; Mark as Paid
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
