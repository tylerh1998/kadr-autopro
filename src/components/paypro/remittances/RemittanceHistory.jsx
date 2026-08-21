import React, { useState, useEffect } from "react";
import { Remittance, PayStub, Employee, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Calendar, FileText, Ban } from "lucide-react";
import RemittanceReportPDF from "./RemittanceReportPDF";
import CancelRemittanceModal from "./CancelRemittanceModal";

export default function RemittanceHistory({ onClose, onChanged }) {
  const [remittances, setRemittances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taxYearConstants, setTaxYearConstants] = useState([]);
  const [cancellingRemittance, setCancellingRemittance] = useState(null);

  useEffect(() => {
    loadRemittances();
  }, []);

  const loadRemittances = async () => {
    setLoading(true);
    try {
      const [data, constants] = await Promise.all([
        Remittance.list('-remittance_date'),
        TaxYearConstant.list(),
      ]);
      setRemittances(data);
      setTaxYearConstants(constants);
    } catch (error) {
      console.error("Error loading remittances:", error);
    }
    setLoading(false);
  };

  // D6 fix: reads the real per-year employer EI multiplier instead of a hardcoded 1.4 -
  // same fix Phase 6 made everywhere else this hardcode was found.
  const getEmployerMultiplier = (year) => {
    const row = taxYearConstants.find((c) => c.year === year);
    return row?.ei_rate_employer_multiplier ?? 1.4;
  };

  const handleViewReport = async (remittance) => {
    try {
      const [payStubs, employees] = await Promise.all([
        Promise.all(remittance.pay_stub_ids.map((id) => PayStub.get(id))),
        Employee.list(),
      ]);

      const multiplier = getEmployerMultiplier(payStubs[0]?.year || new Date(remittance.remittance_date).getFullYear());
      const pdfHTML = RemittanceReportPDF(remittance, payStubs, employees, multiplier);
      const pdfWindow = window.open("", "_blank");
      pdfWindow.document.write(pdfHTML);
      pdfWindow.document.close();
      pdfWindow.focus();
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report. Please try again later.");
    }
  };

  const handleDownloadText = async (remittance) => {
    try {
      const [payStubs, employees] = await Promise.all([
        Promise.all(remittance.pay_stub_ids.map((id) => PayStub.get(id))),
        Employee.list(),
      ]);

      const employeeMap = employees.filter((e) => payStubs.some((s) => s.employee_id === e.employee_id));
      const multiplier = getEmployerMultiplier(payStubs[0]?.year || new Date(remittance.remittance_date).getFullYear());

      const cppTotal = (remittance.total_cpp_employee || 0) + (remittance.total_cpp_employer || 0);
      const eiTotal = (remittance.total_ei_employee || 0) + (remittance.total_ei_employer || 0);

      const formatDateLocal = (date) => (date ? date.split('T')[0] : '');

      const header = `KADR PayPRO - Government Remittance Statement
${'='.repeat(80)}

Generated: ${new Date().toLocaleString('en-CA')}
Remittance Date: ${formatDateLocal(remittance.remittance_date)}
Remittance Period: ${formatDateLocal(remittance.period_start)} to ${formatDateLocal(remittance.period_end)}
Number of Paycheques: ${payStubs.length}

${'='.repeat(80)}
REMITTANCE BREAKDOWN
${'='.repeat(80)}

Total Gross Pay:${' '.repeat(51)} $${(remittance.total_gross_pay || 0).toFixed(2).padStart(10)}

Deduction Type${' '.repeat(32)} Employee${' '.repeat(5)} Employer${' '.repeat(5)} Line Total
${'-'.repeat(80)}
Income Tax (Federal & Provincial)${' '.repeat(17)} $${(remittance.total_income_tax || 0).toFixed(2).padStart(8)} ${' '.repeat(6)} N/A${' '.repeat(7)} $${(remittance.total_income_tax || 0).toFixed(2).padStart(10)}
Canada Pension Plan (CPP)${' '.repeat(24)} $${(remittance.total_cpp_employee || 0).toFixed(2).padStart(8)} ${' '.repeat(2)} $${(remittance.total_cpp_employer || 0).toFixed(2).padStart(8)} ${' '.repeat(2)} $${cppTotal.toFixed(2).padStart(10)}
Employment Insurance (EI)${' '.repeat(24)} $${(remittance.total_ei_employee || 0).toFixed(2).padStart(8)} ${' '.repeat(2)} $${(remittance.total_ei_employer || 0).toFixed(2).padStart(8)} ${' '.repeat(2)} $${eiTotal.toFixed(2).padStart(10)}

${'-'.repeat(80)}
TOTAL REMITTANCE:${' '.repeat(52)} $${(remittance.total_remittance || 0).toFixed(2).padStart(10)}
${'='.repeat(80)}

`;

      const paychequeDetails = `
${'='.repeat(80)}
INDIVIDUAL PAYCHEQUE DETAILS
${'='.repeat(80)}

Paycheque #${' '.repeat(4)} Employee Name${' '.repeat(14)} Pay Date${' '.repeat(5)} Gross${' '.repeat(7)} Income Tax${' '.repeat(3)} CPP (Emp)${' '.repeat(3)} CPP (Empr)${' '.repeat(2)} EI (Emp)${' '.repeat(4)} EI (Empr)${' '.repeat(4)} Net Pay
${'-'.repeat(80)}
${payStubs.map(stub => {
  const employee = employeeMap.find(e => e.employee_id === stub.employee_id);
  const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown';
  const incomeTax = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
  const eiEmployer = (stub.ei_deduction || 0) * multiplier;
  const paychequeNum = (stub.paycheque_number || 'N/A').padEnd(13);

  return `${paychequeNum} ${employeeName.padEnd(28)} ${formatDateLocal(stub.pay_date).padEnd(12)} $${(stub.gross_pay || 0).toFixed(2).padStart(9)} $${incomeTax.toFixed(2).padStart(10)} $${(stub.cpp_deduction || 0).toFixed(2).padStart(9)} $${(stub.cpp_deduction || 0).toFixed(2).padStart(10)} $${(stub.ei_deduction || 0).toFixed(2).padStart(9)} $${eiEmployer.toFixed(2).padStart(10)} $${(stub.net_pay || 0).toFixed(2).padStart(9)}`;
}).join('\n')}
${'-'.repeat(80)}
TOTALS:${' '.repeat(57)} $${(remittance.total_gross_pay || 0).toFixed(2).padStart(9)} $${(remittance.total_income_tax || 0).toFixed(2).padStart(10)} $${(remittance.total_cpp_employee || 0).toFixed(2).padStart(9)} $${(remittance.total_cpp_employer || 0).toFixed(2).padStart(10)} $${(remittance.total_ei_employee || 0).toFixed(2).padStart(9)} $${(remittance.total_ei_employer || 0).toFixed(2).padStart(10)} $${payStubs.reduce((sum, s) => sum + (s.net_pay || 0), 0).toFixed(2).padStart(9)}
${'='.repeat(80)}

`;

      const footer = `
This statement represents the government remittances due for the specified period.
Please ensure this amount is paid to the Canada Revenue Agency (CRA) by the due date.

Total Amount to Remit: $${(remittance.total_remittance || 0).toFixed(2)}
`;

      const previewText = header + paychequeDetails + footer;

      const blob = new Blob([previewText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remittance_${remittance.remittance_date}_${remittance.period_start}_to_${remittance.period_end}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Error generating text file:", error);
      alert("Failed to generate text file. Please try again later.");
    }
  };

  const handleCancelComplete = () => {
    setCancellingRemittance(null);
    loadRemittances();
    if (onChanged) onChanged();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Calendar className="w-5 h-5" />
            Remittance History
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-blue-800 dark:text-blue-400" />
            </div>
          ) : remittances.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 dark:text-slate-400">No remittances have been processed yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remittance Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Paycheques</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Income Tax</TableHead>
                  <TableHead>CPP Total</TableHead>
                  <TableHead>EI Total</TableHead>
                  <TableHead>Total Remitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remittances.map(remittance => {
                  const isCancelled = remittance.status === 'cancelled';
                  return (
                    <TableRow key={remittance.id} className={isCancelled ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => handleDownloadText(remittance)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-left"
                          title="Download Remittance Text File"
                        >
                          {(() => {
                            const dateStr = remittance.remittance_date.split('T')[0];
                            const [year, month, day] = dateStr.split('-');
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                          })()}
                        </button>
                      </TableCell>
                      <TableCell className="dark:text-slate-300">
                        {(() => {
                          const startStr = remittance.period_start.split('T')[0];
                          const [year1, month1, day1] = startStr.split('-');
                          const start = new Date(year1, month1 - 1, day1);
                          const endStr = remittance.period_end.split('T')[0];
                          const [year2, month2, day2] = endStr.split('-');
                          const end = new Date(year2, month2 - 1, day2);
                          return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                        })()}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">{remittance.pay_stub_ids?.length || 0}</TableCell>
                      <TableCell className="dark:text-slate-300">${remittance.total_gross_pay?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${remittance.total_income_tax?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${((remittance.total_cpp_employee || 0) + (remittance.total_cpp_employer || 0)).toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${((remittance.total_ei_employee || 0) + (remittance.total_ei_employer || 0)).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                        ${remittance.total_remittance?.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {isCancelled ? (
                          <Badge className="bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300">Cancelled</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300">
                            {remittance.status || 'Completed'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewReport(remittance)}
                            className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Report
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCancellingRemittance(remittance)}
                            disabled={isCancelled}
                            title={isCancelled ? "This remittance is already cancelled." : "Cancel this remittance"}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end pt-4 border-t dark:border-slate-700">
            <Button variant="outline" onClick={onClose} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        {cancellingRemittance && (
          <CancelRemittanceModal
            remittance={cancellingRemittance}
            onComplete={handleCancelComplete}
            onCancel={() => setCancellingRemittance(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
