import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { PayStub, Employee, Remittance, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, History, CheckCircle, Settings } from "lucide-react";
import RemittanceDialog from "@/components/paypro/remittances/RemittanceDialog";
import RemittanceHistory from "@/components/paypro/remittances/RemittanceHistory";

export default function Remittances() {
  const navigate = useNavigate();
  const [payStubs, setPayStubs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [taxYearConstants, setTaxYearConstants] = useState([]);
  const [selectedStubs, setSelectedStubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRemittanceDialog, setShowRemittanceDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [stubs, emps, remittances, constants] = await Promise.all([
      PayStub.filter({ is_paid: true }),
      Employee.list(),
      Remittance.list(),
      TaxYearConstant.list(),
    ]);

    // D2: a cancelled remittance's stubs must not stay locked - only non-cancelled
    // remittances count toward the "already remitted" set.
    const remittedStubIds = remittances
      .filter((r) => r.status !== 'cancelled')
      .flatMap((r) => r.pay_stub_ids || []);
    const availableStubs = stubs.filter((stub) => !remittedStubIds.includes(stub.id) && !stub.is_cancelled);

    setPayStubs(availableStubs);
    setEmployees(emps);
    setTaxYearConstants(constants);
    setLoading(false);
  };

  const getEmployee = (employeeId) => {
    return employees.find((e) => e.employee_id === employeeId);
  };

  // D6 fix: real per-year employer EI multiplier, not a hardcoded 1.4.
  const getEmployerMultiplier = (year) => {
    const row = taxYearConstants.find((c) => c.year === year);
    return row?.ei_rate_employer_multiplier ?? 1.4;
  };

  const handleStubSelection = (stubId, checked) => {
    setSelectedStubs((prev) =>
      checked
        ? [...prev, stubId]
        : prev.filter((id) => id !== stubId)
    );
  };

  const handleSelectAll = (checked) => {
    setSelectedStubs(checked ? payStubs.map((stub) => stub.id) : []);
  };

  const calculateTotals = () => {
    const selected = payStubs.filter((stub) => selectedStubs.includes(stub.id));

    const totals = selected.reduce((acc, stub) => {
      acc.grossPay += stub.gross_pay || 0;
      acc.incomeTax += (stub.federal_tax || 0) + (stub.provincial_tax || 0);
      acc.cppEmployee += stub.cpp_deduction || 0;
      acc.cppEmployer += stub.cpp_deduction || 0; // Employer matches employee

      acc.eiEmployee += stub.ei_deduction || 0;

      const eiEmp = (stub.ei_deduction || 0) * getEmployerMultiplier(stub.year);
      acc.eiEmployer += Math.round(eiEmp * 100) / 100;

      return acc;
    }, {
      grossPay: 0,
      incomeTax: 0,
      cppEmployee: 0,
      cppEmployer: 0,
      eiEmployee: 0,
      eiEmployer: 0,
    });

    totals.totalRemittance = totals.incomeTax + totals.cppEmployee + totals.cppEmployer + totals.eiEmployee + totals.eiEmployer;

    return totals;
  };

  const totals = calculateTotals();
  const hasSelection = selectedStubs.length > 0;

  const handleRemittanceComplete = () => {
    setShowRemittanceDialog(false);
    setSelectedStubs([]);
    loadData();
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Government Remittances</h1>
          <p className="text-slate-600 dark:text-slate-400">Process government remittances for paid paycheques</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("paypro/Setup"))}
            className="flex items-center gap-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Manage the period close date in Setup > General Settings"
          >
            <Settings className="w-4 h-4" />
            Manage Period Close Date
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <History className="w-4 h-4" />
            View History
          </Button>
        </div>
      </div>

      {hasSelection && (
        <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center justify-between dark:text-slate-100">
              <span>Remittance Summary ({selectedStubs.length} paycheques selected)</span>
              <Button
                onClick={() => setShowRemittanceDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Send className="w-4 h-4 mr-2" />
                Process Remittance
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Gross Pay</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">${totals.grossPay.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">Income Tax</p>
                <p className="text-xl font-semibold text-blue-600 dark:text-blue-400">${totals.incomeTax.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">CPP (Employee + Employer)</p>
                <p className="text-xl font-semibold text-purple-600 dark:text-purple-400">${(totals.cppEmployee + totals.cppEmployer).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">EI (Employee + Employer)</p>
                <p className="text-xl font-semibold text-orange-600 dark:text-orange-400">${(totals.eiEmployee + totals.eiEmployer).toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t dark:border-slate-700 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Remittance Amount</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">${totals.totalRemittance.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between dark:text-slate-100">
            <span>Available Paid Paycheques</span>
            {payStubs.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedStubs.length === payStubs.length}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">Select All</span>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-blue-800 dark:text-blue-400" />
            </div>
          ) : payStubs.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">All Up to Date!</h3>
              <p className="text-slate-600 dark:text-slate-400">No paid paycheques available for remittance.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>Pay Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Income Tax</TableHead>
                  <TableHead>CPP (Emp)</TableHead>
                  <TableHead>CPP (Empr)</TableHead>
                  <TableHead>EI (Emp)</TableHead>
                  <TableHead>EI (Empr)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payStubs.map((stub) => {
                  const employee = getEmployee(stub.employee_id);
                  const isSelected = selectedStubs.includes(stub.id);
                  const multiplier = getEmployerMultiplier(stub.year);
                  return (
                    <TableRow key={stub.id} className={isSelected ? "bg-blue-50 dark:bg-blue-950/30" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleStubSelection(stub.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="dark:text-slate-300">
                        {(() => {
                          const [year, month, day] = stub.pay_date.split('-');
                          const date = new Date(year, month - 1, day);
                          return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          });
                        })()}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">{employee ? `${employee.first_name} ${employee.last_name}` : 'N/A'}</TableCell>
                      <TableCell className="font-semibold dark:text-slate-100">${stub.gross_pay?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${((stub.federal_tax || 0) + (stub.provincial_tax || 0)).toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${stub.cpp_deduction?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${stub.cpp_deduction?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${stub.ei_deduction?.toFixed(2)}</TableCell>
                      <TableCell className="dark:text-slate-300">${((stub.ei_deduction || 0) * multiplier).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showRemittanceDialog && (
        <RemittanceDialog
          selectedStubs={payStubs.filter((stub) => selectedStubs.includes(stub.id))}
          totals={totals}
          onComplete={handleRemittanceComplete}
          onCancel={() => setShowRemittanceDialog(false)}
        />
      )}

      {showHistory && (
        <RemittanceHistory
          onClose={() => setShowHistory(false)}
          onChanged={loadData}
        />
      )}
    </div>
  );
}
