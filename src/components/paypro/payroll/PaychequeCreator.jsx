import React, { useState, useEffect } from "react";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, AlertCircle, Loader2 } from "lucide-react";
import PaychequeForm from "./PaychequeForm";

export default function PaychequeCreator({ employee, payPeriod, importedTimeData, onComplete }) {
  const [ytdData, setYtdData] = useState({ cpp: 0, cpp2: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If no employee is selected or available, don't try to load data.
    if (!employee) {
        setLoading(false);
        setError(null); // Clear any previous errors if employee becomes null
        setYtdData({ cpp: 0, cpp2: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 }); // Reset YTD data
        return;
    }

    setLoading(true); // Indicate loading when employee is available
    setError(null); // Clear previous errors

    // Debounce the API call with a short delay
    const handler = setTimeout(() => {
        const loadYtdData = async () => {
            try {
                // Use payDate to determine the tax year, not the period start date
                const currentYear = new Date(payPeriod.payDate).getFullYear();
                const stubs = await PayStub.filter({ employee_id: employee.employee_id, year: currentYear });

                if (stubs.length > 0) {
                    // D2 fix: sort newest-first and take index 0 directly - the source's
                    // trailing .reverse() flipped this back to oldest-first, silently
                    // seeding YTD from each employee's *first* stub of the year instead
                    // of their most recent.
                    const latestStub = stubs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime())[0];
                    setYtdData({
                        cpp: latestStub.ytd_cpp || 0,
                        cpp2: latestStub.ytd_cpp2 || 0,
                        ei: latestStub.ytd_ei || 0,
                        gross: latestStub.ytd_gross || 0,
                        federal_tax: latestStub.ytd_federal_tax || 0,
                        provincial_tax: latestStub.ytd_provincial_tax || 0,
                        net: latestStub.ytd_net || 0
                    });
                } else {
                    setYtdData({ cpp: 0, cpp2: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 });
                }
            } catch (err) {
                console.error("Error loading YTD data:", err);
                setError("Failed to load year-to-date data. Using default values.");
                setYtdData({ cpp: 0, cpp2: 0, ei: 0, gross: 0, federal_tax: 0, provincial_tax: 0, net: 0 });
            } finally {
                setLoading(false);
            }
        };
        loadYtdData();
    }, 300); // 300ms debounce delay

    return () => {
        clearTimeout(handler);
    };
  }, [employee, payPeriod]); // Depend on employee object and payPeriod for stability and changes

  const handleCreatePaycheque = async (payStubData) => {
    try {
      await PayStub.create(payStubData);
      alert(`Paycheque created successfully for ${employee.first_name} ${employee.last_name}!`);
      onComplete();
    } catch (error) {
      alert("Error creating paycheque. Please try again.");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
        <CardContent className="p-10 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-800 dark:text-blue-400" />
          <p className="text-slate-600 dark:text-slate-400">Loading employee data...</p>
        </CardContent>
      </Card>
    );
  }

  // Render nothing if employee is null after loading
  if (!employee) {
    return (
        <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
            <CardContent className="p-10 flex flex-col items-center justify-center gap-4">
                <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                <p className="text-slate-600 dark:text-slate-400">Please select an employee to create a paycheque.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="mt-6 border-0 shadow-sm dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-slate-100">
          <Calendar className="w-5 h-5" />
          Create Paycheque - {employee.first_name} {employee.last_name}
        </CardTitle>
        <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
          <p>Pay Period: {new Date(payPeriod.start).toLocaleDateString('en-CA')} to {new Date(payPeriod.end).toLocaleDateString('en-CA')}</p>
          <p>Pay Date: {new Date(payPeriod.payDate).toLocaleDateString('en-CA')}</p>
          <p>Employee ID: {employee.employee_id}</p>
          {importedTimeData && (
            <p className="text-blue-600 dark:text-blue-400 font-semibold">
              ✓ WorkPRO time data loaded ({Object.keys(importedTimeData.payTypes).length} pay type(s))
            </p>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <PaychequeForm
            employee={employee}
            payPeriod={payPeriod}
            ytdData={ytdData}
            importedTimeData={importedTimeData}
            onSave={handleCreatePaycheque}
            saveLabel="Create Paycheque"
            saveIcon={null}
        />
      </CardContent>
    </Card>
  );
}
