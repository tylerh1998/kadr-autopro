import React, { useState, useEffect } from "react";
import { Employee, PayStub, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calendar, FileText, Users } from "lucide-react";
import T4_PDF from "@/components/paypro/t4/T4_PDF";
import T4A_PDF from "@/components/paypro/t4/T4A_PDF";

export default function T4s() {
  const [employees, setEmployees] = useState([]);
  const [taxConstants, setTaxConstants] = useState({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [emps, constantsList] = await Promise.all([
          Employee.list(),
          TaxYearConstant.list()
        ]);

        const constantsMap = constantsList.reduce((acc, item) => {
            acc[item.year] = {
                EI_MAX_INSURABLE_EARNINGS: item.ei_max_insurable_earnings,
                CPP_MAX_PENSIONABLE_EARNINGS: item.cpp_max_pensionable_earnings
            };
            return acc;
        }, {});

        setEmployees(emps);
        setTaxConstants(constantsMap);
      } catch (error) {
        console.error("Failed to load data for T4 page:", error);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const handleEmployeeSelection = (employeeId, checked) => {
    setSelectedEmployeeIds(prev =>
      checked
        ? [...prev, employeeId]
        : prev.filter(id => id !== employeeId)
    );
  };

  const handleSelectAll = (checked) => {
    setSelectedEmployeeIds(checked ? employees.map(emp => emp.id) : []);
  };

  const handleGenerateT4s = async () => {
    if (selectedEmployeeIds.length === 0 || !selectedYear) {
      alert("Please select at least one employee and a tax year.");
      return;
    }
    setGenerating(true);

    try {
      const constants = taxConstants[selectedYear];
      if (!constants) {
        alert(`Tax constants for the year ${selectedYear} are not configured. Please add them in the Setup page.`);
        setGenerating(false);
        return;
      }

      // Collect all T4 data for T4A summary
      const t4SummaryData = [];

      // Generate T4s for each selected employee
      for (const employeeId of selectedEmployeeIds) {
        const employee = employees.find(e => e.id === employeeId);
        const stubs = await PayStub.filter({ employee_id: employee.employee_id, year: parseInt(selectedYear) });

        if (stubs.length === 0) {
          console.warn(`No pay stubs found for ${employee.first_name} ${employee.last_name} in ${selectedYear}`);
          continue;
        }

        const totals = stubs.reduce((acc, stub) => {
          acc.gross += stub.gross_pay || 0;
          acc.cpp += stub.cpp_deduction || 0;
          acc.ei += stub.ei_deduction || 0;
          acc.tax += (stub.federal_tax || 0) + (stub.provincial_tax || 0);
          return acc;
        }, { gross: 0, cpp: 0, ei: 0, tax: 0 });

        const t4Data = {
          box14: totals.gross,
          box16: totals.cpp,
          box18: totals.ei,
          box22: totals.tax,
          box24: Math.min(totals.gross, constants.EI_MAX_INSURABLE_EARNINGS),
          box26: Math.min(totals.gross, constants.CPP_MAX_PENSIONABLE_EARNINGS),
          box52: 0, // Assuming no pension adjustment
        };

        t4SummaryData.push({ employee, t4Data });

        // Generate individual T4
        const pdfHTML = T4_PDF(employee, selectedYear, t4Data);
        const pdfWindow = window.open("", "_blank");
        pdfWindow.document.write(pdfHTML);
        pdfWindow.document.close();
        pdfWindow.focus();

        // Small delay between opening windows to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Generate T4A Summary after all T4s
      if (t4SummaryData.length > 0) {
        const t4aSummaryHTML = T4A_PDF(t4SummaryData, selectedYear);
        const t4aWindow = window.open("", "_blank");
        t4aWindow.document.write(t4aSummaryHTML);
        t4aWindow.document.close();
        t4aWindow.focus();
      }

      alert(`Generated T4s for ${t4SummaryData.length} employees and T4A summary for ${selectedYear}.`);

    } catch (error) {
      console.error("Error generating T4s:", error);
      alert("An error occurred while generating T4s. Please check the console.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Generate T4 & T4A Slips</h1>
        <p className="text-slate-600 dark:text-slate-400">Create official T4 Statement of Remuneration Paid slips and T4A summary for your employees.</p>
      </div>

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">T4 Generation Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
               <div className="flex justify-center items-center h-24"><Loader2 className="w-8 h-8 animate-spin text-blue-800 dark:text-blue-400"/></div>
          ) : (
          <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                  <Label className="flex items-center gap-2 dark:text-slate-300"><Calendar className="w-4 h-4" />Tax Year</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent>
                      {Object.keys(taxConstants).sort((a,b) => b-a).map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                  </SelectContent>
                  </Select>
              </div>
              <div className="space-y-2">
                  <Label className="flex items-center gap-2 dark:text-slate-300">
                  <Users className="w-4 h-4" />
                  Selected: {selectedEmployeeIds.length} of {employees.length}
                  </Label>
                  <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                      checked={selectedEmployeeIds.length === employees.length && employees.length > 0}
                      onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Select All Employees</span>
                  </div>
              </div>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto border dark:border-slate-700 rounded-lg p-4">
              {employees.map(employee => (
                  <div key={employee.id} className="flex items-center space-x-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Checkbox
                      checked={selectedEmployeeIds.includes(employee.id)}
                      onCheckedChange={(checked) => handleEmployeeSelection(employee.id, checked)}
                  />
                  <div className="flex-1">
                      <div className="font-medium dark:text-slate-100">{employee.first_name} {employee.last_name}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{employee.employee_id}</div>
                  </div>
                  </div>
              ))}
              </div>

              <div className="pt-6 border-t dark:border-slate-700">
              <Button
                  onClick={handleGenerateT4s}
                  disabled={generating || selectedEmployeeIds.length === 0 || !selectedYear}
                  className="w-full md:w-auto bg-blue-800 hover:bg-blue-900 text-white"
              >
                  {generating ? (
                  <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating T4s & T4A...
                  </>
                  ) : (
                  <>
                      <FileText className="w-4 h-4 mr-2" />
                      Generate T4s & T4A ({selectedEmployeeIds.length} selected)
                  </>
                  )}
              </Button>
              </div>
          </>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>This tool generates T4 slips for each selected employee and a T4A summary based on pay stubs recorded for the selected year.</p>
        <p>Please verify all amounts before distributing to employees and submitting to CRA.</p>
      </div>
    </div>
  );
}
