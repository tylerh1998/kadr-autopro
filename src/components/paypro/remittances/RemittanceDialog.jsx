import React, { useState, useEffect } from "react";
import moment from "moment-timezone";
import { Remittance, Employee, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { supabase } from "@/lib/supabase";
import { checkFiscalPeriodStatus } from "@/components/utils/fiscalPeriodUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, X, FileText, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import RemittanceReportPDF from "./RemittanceReportPDF";

const getMountainTimestamp = () => moment.tz('America/Edmonton').format();
const generateId = () => crypto.randomUUID().replace(/-/g, '').substring(0, 24);

// O-2, this phase's core deliverable: replaces exportRemittance + manual Mark Paid with one
// action that creates the PayPro_Remittance row AND posts balance-checked, Fiscal-Period-gated
// GL + Bank entries in the same submit. GL mapping ported from MarkPaidModal.jsx's Remittance
// branch (~L389-444). Q1 resolved: posts client-side, no paypro-postRemittanceGL function.
export default function RemittanceDialog({ selectedStubs, totals, onComplete, onCancel }) {
  const [remittanceDate, setRemittanceDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [employees, setEmployees] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [taxYearConstants, setTaxYearConstants] = useState([]);

  const initialStart = selectedStubs.map(s => s.pay_period_start).sort()[0];
  const initialEnd = selectedStubs.map(s => s.pay_period_end).sort().reverse()[0];
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountsResult, constants] = await Promise.all([
          // getBankAccounts-equivalent - read BankAccount natively (D4 precedent, Phase 6).
          supabase.from('BankAccount').select('*').eq('is_active', true),
          TaxYearConstant.list(),
        ]);
        if (accountsResult.error) throw accountsResult.error;
        setBankAccounts(accountsResult.data || []);
        setTaxYearConstants(constants);
      } catch (err) {
        console.error("Error loading bank accounts:", err);
      }
    };
    loadData();
  }, []);

  // D6 fix: real per-year employer EI multiplier, not a hardcoded 1.4.
  const getEmployerMultiplier = (year) => {
    const row = taxYearConstants.find((c) => c.year === year);
    return row?.ei_rate_employer_multiplier ?? 1.4;
  };

  const generateRemittanceText = async () => {
    const employeeIds = [...new Set(selectedStubs.map(s => s.employee_id))];
    const employeeList = await Employee.list();
    const employeeMap = employeeList.filter(e => employeeIds.includes(e.employee_id));
    setEmployees(employeeMap);

    const cppTotal = totals.cppEmployee + totals.cppEmployer;
    const eiTotal = totals.eiEmployee + totals.eiEmployer;

    const formatDateLocal = (date) => date;

    const header = `KADR PayPRO - Government Remittance Statement
${'='.repeat(80)}

Generated: ${new Date().toLocaleString('en-CA')}
Remittance Date: ${formatDateLocal(remittanceDate)}
Remittance Period: ${formatDateLocal(periodStart)} to ${formatDateLocal(periodEnd)}
Number of Paycheques: ${selectedStubs.length}

${'='.repeat(80)}
REMITTANCE BREAKDOWN
${'='.repeat(80)}

Total Gross Pay:${' '.repeat(51)} $${totals.grossPay.toFixed(2).padStart(10)}

Deduction Type${' '.repeat(32)} Employee${' '.repeat(5)} Employer${' '.repeat(5)} Line Total
${'-'.repeat(80)}
Income Tax (Federal & Provincial)${' '.repeat(17)} $${totals.incomeTax.toFixed(2).padStart(8)} ${' '.repeat(6)} N/A${' '.repeat(7)} $${totals.incomeTax.toFixed(2).padStart(10)}
Canada Pension Plan (CPP)${' '.repeat(24)} $${totals.cppEmployee.toFixed(2).padStart(8)} ${' '.repeat(2)} $${totals.cppEmployer.toFixed(2).padStart(8)} ${' '.repeat(2)} $${cppTotal.toFixed(2).padStart(10)}
Employment Insurance (EI)${' '.repeat(24)} $${totals.eiEmployee.toFixed(2).padStart(8)} ${' '.repeat(2)} $${totals.eiEmployer.toFixed(2).padStart(8)} ${' '.repeat(2)} $${eiTotal.toFixed(2).padStart(10)}

${'-'.repeat(80)}
TOTAL REMITTANCE:${' '.repeat(52)} $${totals.totalRemittance.toFixed(2).padStart(10)}
${'='.repeat(80)}

`;

    const paychequeDetails = `
${'='.repeat(80)}
INDIVIDUAL PAYCHEQUE DETAILS
${'='.repeat(80)}

Paycheque #${' '.repeat(4)} Employee Name${' '.repeat(14)} Pay Date${' '.repeat(5)} Gross${' '.repeat(7)} Income Tax${' '.repeat(3)} CPP (Emp)${' '.repeat(3)} CPP (Empr)${' '.repeat(2)} EI (Emp)${' '.repeat(4)} EI (Empr)${' '.repeat(4)} Net Pay
${'-'.repeat(80)}
${selectedStubs.map(stub => {
  const employee = employeeMap.find(e => e.employee_id === stub.employee_id);
  const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown';
  const incomeTax = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
  const eiEmployer = (stub.ei_deduction || 0) * getEmployerMultiplier(stub.year);
  const paychequeNum = (stub.paycheque_number || 'N/A').padEnd(13);

  return `${paychequeNum} ${employeeName.padEnd(28)} ${formatDateLocal(stub.pay_date).padEnd(12)} $${(stub.gross_pay || 0).toFixed(2).padStart(9)} $${incomeTax.toFixed(2).padStart(10)} $${(stub.cpp_deduction || 0).toFixed(2).padStart(9)} $${(stub.cpp_deduction || 0).toFixed(2).padStart(10)} $${(stub.ei_deduction || 0).toFixed(2).padStart(9)} $${eiEmployer.toFixed(2).padStart(10)} $${(stub.net_pay || 0).toFixed(2).padStart(9)}`;
}).join('\n')}
${'-'.repeat(80)}
TOTALS:${' '.repeat(57)} $${totals.grossPay.toFixed(2).padStart(9)} $${totals.incomeTax.toFixed(2).padStart(10)} $${totals.cppEmployee.toFixed(2).padStart(9)} $${totals.cppEmployer.toFixed(2).padStart(10)} $${totals.eiEmployee.toFixed(2).padStart(9)} $${totals.eiEmployer.toFixed(2).padStart(10)} $${selectedStubs.reduce((sum, s) => sum + (s.net_pay || 0), 0).toFixed(2).padStart(9)}
${'='.repeat(80)}

`;

    const footer = `
This statement represents the government remittances due for the specified period.
Please ensure this amount is paid to the Canada Revenue Agency (CRA) by the due date.

Total Amount to Remit: $${totals.totalRemittance.toFixed(2)}
`;

    return header + paychequeDetails + footer;
  };

  const handleGeneratePreview = async () => {
    setError('');
    if (!remittanceDate) {
      setError("Please select a remittance date.");
      return;
    }
    if (!selectedBankAccountId) {
      setError("Please select a bank account.");
      return;
    }
    const text = await generateRemittanceText();
    setPreviewText(text);
    setShowPreview(true);
  };

  const handleDownloadPreview = () => {
    const blob = new Blob([previewText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remittance_${remittanceDate}_${periodStart}_to_${periodEnd}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    setError('');
    setProcessing(true);

    try {
      // O-6: Fiscal Period gate before any write, gated on remittance_date.
      const fiscalStatus = await checkFiscalPeriodStatus(remittanceDate);
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

      // R5: balance check, ported in spirit (0.02 tolerance) even though these totals are
      // pre-summed and should already balance by construction.
      const totalCredits = totals.totalRemittance;
      const totalDebits = totals.incomeTax + totals.cppEmployee + totals.cppEmployer + totals.eiEmployee + totals.eiEmployer;
      if (Math.abs(totalDebits - totalCredits) > 0.02) {
        throw new Error(`GL transactions do not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
      }

      const remittanceData = {
        remittance_date: remittanceDate,
        period_start: periodStart,
        period_end: periodEnd,
        total_gross_pay: Math.round(totals.grossPay * 100) / 100,
        total_income_tax: Math.round(totals.incomeTax * 100) / 100,
        total_cpp_employee: Math.round(totals.cppEmployee * 100) / 100,
        total_cpp_employer: Math.round(totals.cppEmployer * 100) / 100,
        total_ei_employee: Math.round(totals.eiEmployee * 100) / 100,
        total_ei_employer: Math.round(totals.eiEmployer * 100) / 100,
        total_remittance: Math.round(totals.totalRemittance * 100) / 100,
        pay_stub_ids: selectedStubs.map(stub => stub.id),
        status: "completed",
      };

      const newRemittance = await Remittance.create(remittanceData);

      const reference = `Remittance-${remittanceDate}`;
      const mountainTimestamp = getMountainTimestamp();

      // Ported from MarkPaidModal.jsx's Remittance branch - source_id is now the new
      // PayPro_Remittance.id instead of a PayrollTransaction.id. One GL/Bank set for the
      // whole batch, not per-stub (structurally different from Phase 6's paystub loop).
      const { error: bankTxError } = await supabase.from('BankTransaction').insert({
        id: generateId(),
        bank_account_id: selectedAccount.id,
        transaction_date: remittanceDate,
        description: `Remittance ${reference}`,
        reference,
        debit_amount: totals.totalRemittance,
        credit_amount: 0,
        cleared: false,
        source_type: 'payment',
        source_id: newRemittance.id,
        gl_account: '2050',
        created_date: mountainTimestamp,
        updated_date: mountainTimestamp,
      });
      if (bankTxError) throw new Error(`Bank transaction failed: ${bankTxError.message}`);

      const glRows = [
        {
          account_number: selectedAccount.gl_account || '1000',
          transaction_date: remittanceDate,
          description: 'Remittance payment',
          reference,
          debit_amount: 0,
          credit_amount: totals.totalRemittance,
          source_type: 'payment',
          source_id: newRemittance.id,
        },
        {
          account_number: '2054',
          transaction_date: remittanceDate,
          description: 'Remittance paid - Income Tax',
          reference,
          debit_amount: totals.incomeTax,
          credit_amount: 0,
          source_type: 'payment',
          source_id: newRemittance.id,
        },
        {
          account_number: '2052',
          transaction_date: remittanceDate,
          description: 'Remittance paid - CPP',
          reference,
          debit_amount: totals.cppEmployee + totals.cppEmployer,
          credit_amount: 0,
          source_type: 'payment',
          source_id: newRemittance.id,
        },
        {
          account_number: '2053',
          transaction_date: remittanceDate,
          description: 'Remittance paid - EI',
          reference,
          debit_amount: totals.eiEmployee + totals.eiEmployer,
          credit_amount: 0,
          source_type: 'payment',
          source_id: newRemittance.id,
        },
      ];

      const { error: glError } = await supabase.from('GLTransaction').insert(
        glRows.map((row) => ({ id: generateId(), ...row }))
      );
      if (glError) throw new Error(`GL posting failed (remittance record was still created - reconcile manually): ${glError.message}`);

      const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: selectedAccount.id },
      });
      if (balanceError) throw balanceError;
      if (balanceData?.error) throw new Error(balanceData.error);

      alert(`Remittance processed successfully for ${selectedStubs.length} paycheques!`);

      // Report still opens automatically post-submit, unchanged from source (D3).
      const multiplier = getEmployerMultiplier(selectedStubs[0]?.year || new Date(remittanceDate).getFullYear());
      const pdfHTML = RemittanceReportPDF(newRemittance, selectedStubs, employees, multiplier);
      const pdfWindow = window.open("", "_blank");
      pdfWindow.document.write(pdfHTML);
      pdfWindow.document.close();
      pdfWindow.focus();

      onComplete();
    } catch (error) {
      console.error("Error processing remittance:", error);
      setError(error.message || "An error occurred while processing the remittance. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Send className="w-5 h-5" />
            Process Government Remittance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!showPreview ? (
            <>
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-slate-100">Remittance Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">Remittance Date</Label>
                    <Input
                      type="date"
                      value={remittanceDate}
                      onChange={(e) => setRemittanceDate(e.target.value)}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">Bank Account *</Label>
                    <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
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
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">Period Start</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">Period End</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-slate-100">Remittance Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">Total Gross Pay</p>
                        <p className="text-2xl font-bold dark:text-slate-100">${totals.grossPay.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">Number of Paycheques</p>
                        <p className="text-2xl font-bold dark:text-slate-100">{selectedStubs.length}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Income Tax</p>
                        <p className="text-xl font-semibold text-blue-600 dark:text-blue-400">${totals.incomeTax.toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg">
                        <p className="text-sm text-slate-600 dark:text-slate-400">CPP Employee</p>
                        <p className="text-xl font-semibold text-purple-600 dark:text-purple-400">${totals.cppEmployee.toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg">
                        <p className="text-sm text-slate-600 dark:text-slate-400">CPP Employer</p>
                        <p className="text-xl font-semibold text-purple-600 dark:text-purple-400">${totals.cppEmployer.toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg">
                        <p className="text-sm text-slate-600 dark:text-slate-400">EI Employee</p>
                        <p className="text-xl font-semibold text-orange-600 dark:text-orange-400">${totals.eiEmployee.toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg">
                        <p className="text-sm text-slate-600 dark:text-slate-400">EI Employer</p>
                        <p className="text-xl font-semibold text-orange-600 dark:text-orange-400">${totals.eiEmployer.toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 border dark:border-slate-700 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Total Remittance</p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">${totals.totalRemittance.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                <Button
                  onClick={handleGeneratePreview}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Preview
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Remittance File Ready</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadPreview}
                    className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download File
                  </Button>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border dark:border-slate-700 max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap dark:text-slate-300">
                    {previewText}
                  </pre>
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
                  <X className="mr-2 h-4 w-4" />
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
                      Confirm &amp; Process Remittance
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
