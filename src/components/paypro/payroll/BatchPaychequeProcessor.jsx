import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, AlertCircle, ArrowRight, UserCheck, ChevronsRight, Send } from "lucide-react";
import PaychequeForm from "./PaychequeForm";

export default function BatchPaychequeProcessor({ employeeIds, employees, payPeriod, importedTimeData, onComplete }) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingPaycheques, setPendingPaycheques] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [ytdDataCache, setYtdDataCache] = useState({});
  const [loadingYtd, setLoadingYtd] = useState(true);
  const [error, setError] = useState(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [paychequeNumbers, setPaychequeNumbers] = useState({});

  const selectedEmployees = employees.filter(e => employeeIds.includes(e.id));
  const currentEmployee = selectedEmployees[currentIndex];
  const currentEmployeeTimeData = importedTimeData?.[currentEmployee?.id];

  useEffect(() => {
    if (employeeIds.length === 0) {
      setLoadingYtd(false);
      return;
    }

    setLoadingYtd(true);
    setError(null);

    const handler = setTimeout(() => {
      const loadYtdData = async () => {
        try {
          // Use payDate to determine the tax year, not the period start date
          const currentYear = new Date(payPeriod.payDate).getFullYear();
          const employeeDbIds = selectedEmployees.map(e => e.employee_id);

          // D1: payrollEntities.js's filter() now translates '$in' to .in() -
          // without that fix this matched zero rows silently against every
          // employee's real YTD history (phase_5_implementation_plan.md D1).
          const allStubs = await PayStub.filter({
            employee_id: { '$in': employeeDbIds },
            year: currentYear
          });

          const stubsByEmployee = allStubs.reduce((acc, stub) => {
            const empId = stub.employee_id;
            if (!acc[empId]) acc[empId] = [];
            acc[empId].push(stub);
            return acc;
          }, {});

          const ytdCache = {};
          for (const employee of selectedEmployees) {
            const employeeStubs = stubsByEmployee[employee.employee_id] || [];
            if (employeeStubs.length > 0) {
              const latestStub = employeeStubs.sort((a, b) => new Date(b.pay_date) - new Date(a.pay_date))[0];
              ytdCache[employee.id] = {
                cpp: latestStub.ytd_cpp || 0,
                ei: latestStub.ytd_ei || 0,
                gross: latestStub.ytd_gross || 0,
                federal_tax: latestStub.ytd_federal_tax || 0,
                provincial_tax: latestStub.ytd_provincial_tax || 0,
                net: latestStub.ytd_net || 0
              };
            } else {
              ytdCache[employee.id] = { cpp: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 };
            }
          }
          setYtdDataCache(ytdCache);

          // Pre-generate unique paycheque numbers for all employees in this batch
          const endDate = new Date(payPeriod.end);
          const year = endDate.getFullYear();
          const month = String(endDate.getMonth() + 1).padStart(2, '0');
          const prefix = `${year}${month}`;

          // Get all existing paycheque numbers for this month
          const allPayStubs = await PayStub.list();
          const matchingNumbers = allPayStubs
            .filter(stub => stub.paycheque_number && stub.paycheque_number.startsWith(prefix))
            .map(stub => {
              const parts = stub.paycheque_number.split('-');
              return parts.length === 2 ? parseInt(parts[1]) : 0;
            })
            .filter(num => !isNaN(num));

          let nextNumber = matchingNumbers.length > 0 ? Math.max(...matchingNumbers) + 1 : 1;

          // Assign unique numbers to each employee
          const numbers = {};
          for (const employee of selectedEmployees) {
            const formattedNumber = String(nextNumber).padStart(3, '0');
            numbers[employee.id] = `${prefix}-${formattedNumber}`;
            nextNumber++;
          }
          setPaychequeNumbers(numbers);

        } catch (err) {
          console.error("Error loading YTD data:", err);
          setError("Failed to load year-to-date data. Please try again.");
          const defaultYtdCache = {};
          for (const employee of selectedEmployees) {
            defaultYtdCache[employee.id] = { cpp: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 };
          }
          setYtdDataCache(defaultYtdCache);
        } finally {
          setLoadingYtd(false);
        }
      };
      loadYtdData();
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [employeeIds, employees, payPeriod, refetchTrigger]);

  const handleAddToBatch = (payStubData) => {
    setPendingPaycheques(prev => [...prev, payStubData]);
    if (currentIndex < selectedEmployees.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleSkip = () => {
    if (currentIndex < selectedEmployees.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleSubmitAll = async () => {
    if (pendingPaycheques.length === 0) {
      alert("No paycheques have been prepared for submission.");
      return;
    }
    setIsSubmitting(true);
    try {
      await PayStub.bulkCreate(pendingPaycheques);
      alert(`Successfully created ${pendingPaycheques.length} paycheques!`);
      navigate(createPageUrl("paypro/PayStubs"));
    } catch (error) {
      console.error("Error creating paycheques in batch:", error);
      alert("An error occurred while submitting the batch. Please check the console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEmployeeProcessed = (employeeId) => {
    return pendingPaycheques.some(p => employees.find(e => e.id === employeeId)?.employee_id === p.employee_id);
  };

  const totalNetPay = pendingPaycheques.reduce((sum, stub) => sum + stub.net_pay, 0);

  if (loadingYtd) {
    return (
      <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
        <CardContent className="p-10 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-800 dark:text-blue-400" />
          <p className="text-slate-600 dark:text-slate-400">Loading Year-to-Date data...</p>
          <p className="text-xs text-slate-500 dark:text-slate-500">This may take a moment for multiple employees</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
        <CardContent className="p-10 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button onClick={() => {
            setError(null);
            setLoadingYtd(true);
            setRefetchTrigger(prev => prev + 1); // Increment refetchTrigger to force useEffect re-run
          }}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-slate-100">
          <Users className="w-5 h-5" />
          Interactive Batch Payroll
        </CardTitle>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <p>Pay Period: {new Date(payPeriod.start).toLocaleDateString('en-CA')} to {new Date(payPeriod.end).toLocaleDateString('en-CA')}</p>
          {importedTimeData && Object.keys(importedTimeData).length > 0 && (
            <p className="text-blue-600 dark:text-blue-400 font-semibold mt-1">
              ✓ Processing {Object.keys(importedTimeData).length} employee(s) with WorkPRO time data
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
              {isFinished ? "Review & Submit" : `Processing: ${currentIndex + 1} of ${selectedEmployees.length}`}
            </h3>
          </div>
          <Progress value={((currentIndex + 1) / selectedEmployees.length) * 100} className="w-1/2" />
        </div>

        {/* Employee Stepper */}
        <div className="flex flex-wrap gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {selectedEmployees.map((emp, index) => (
            <Badge
              key={emp.id}
              className={`flex items-center gap-1 transition-all duration-200 ${
                isEmployeeProcessed(emp.id)
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  : index === currentIndex && !isFinished
                  ? 'bg-blue-800 text-white dark:bg-blue-700'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {isEmployeeProcessed(emp.id) && <UserCheck className="w-3 h-3" />}
              {emp.first_name}
            </Badge>
          ))}
        </div>

        {!isFinished && currentEmployee && (
          <div>
            <PaychequeForm
              key={currentEmployee.id}
              employee={currentEmployee}
              payPeriod={payPeriod}
              ytdData={ytdDataCache[currentEmployee.id] || {}}
              importedTimeData={currentEmployeeTimeData}
              onSave={handleAddToBatch}
              saveLabel="Add to Batch & Next"
              saveIcon={ArrowRight}
              preAssignedPaychequeNumber={paychequeNumbers[currentEmployee.id]}
            />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={handleSkip} className="text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
                Skip Employee <ChevronsRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {isFinished && (
          <div className="space-y-6">
             <Card className="bg-blue-50/50 dark:bg-blue-900/20 dark:border-blue-900/40">
                <CardHeader>
                    <CardTitle className="dark:text-slate-100">Batch Review</CardTitle>
                    <CardDescription className="dark:text-slate-400">Review the prepared paycheques before submitting. {pendingPaycheques.length} of {selectedEmployees.length} employees will be processed.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{pendingPaycheques.length}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Successful</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{selectedEmployees.length - pendingPaycheques.length}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Skipped</p>
                        </div>
                         <div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{selectedEmployees.length}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Total</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${totalNetPay.toFixed(2)}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Total Net Pay</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
              <Button variant="outline" onClick={onComplete}>Cancel Batch</Button>
              <Button
                onClick={handleSubmitAll}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" /> Submit All ({pendingPaycheques.length})</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
