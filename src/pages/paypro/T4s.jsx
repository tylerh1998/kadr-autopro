import React, { useState, useEffect } from "react";
import { Employee, PayStub, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calendar, FileText, Users, Download, ChevronLeft, ChevronRight, BarChart3, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import T4_PDF from "@/components/paypro/t4/T4_PDF";
import T4A_PDF from "@/components/paypro/t4/T4A_PDF";
import { calculateT4Totals } from "@/components/paypro/t4/calculateT4Totals";
import { downloadT4Xml } from "@/components/paypro/t4/craT4Xml";
import CraXmlExportModal from "@/components/paypro/t4/CraXmlExportModal";

export default function T4s() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [taxConstants, setTaxConstants] = useState({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingXml, setExportingXml] = useState(false);
  const [showXmlContactModal, setShowXmlContactModal] = useState(false);

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
                CPP_MAX_PENSIONABLE_EARNINGS: item.cpp_max_pensionable_earnings,
                EI_RATE_EMPLOYER_MULTIPLIER: item.ei_rate_employer_multiplier
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

  // Shared by the PDF and XML flows so both are built from identical totals.
  const collectT4SummaryData = async (constants) => {
    const t4SummaryData = [];
    for (const employeeId of selectedEmployeeIds) {
      const employee = employees.find(e => e.id === employeeId);
      const stubs = await PayStub.filter({ employee_id: employee.employee_id, year: parseInt(selectedYear) });

      if (stubs.length === 0) {
        console.warn(`No pay stubs found for ${employee.first_name} ${employee.last_name} in ${selectedYear}`);
        continue;
      }

      t4SummaryData.push({ employee, t4Data: calculateT4Totals(stubs, constants) });
    }
    return t4SummaryData;
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

      const t4SummaryData = await collectT4SummaryData(constants);

      // Generate individual T4s
      for (const { employee, t4Data } of t4SummaryData) {
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

  const handleOpenXmlExport = () => {
    if (selectedEmployeeIds.length === 0 || !selectedYear) {
      alert("Please select at least one employee and a tax year.");
      return;
    }
    if (!taxConstants[selectedYear]) {
      alert(`Tax constants for the year ${selectedYear} are not configured. Please add them in the Setup page.`);
      return;
    }
    setShowXmlContactModal(true);
  };

  const handleExportXml = async (transmitterContact) => {
    setExportingXml(true);

    try {
      const constants = taxConstants[selectedYear];
      const t4SummaryData = await collectT4SummaryData(constants);
      if (t4SummaryData.length === 0) {
        alert(`No pay stubs found for the selected employees in ${selectedYear}.`);
        return;
      }

      downloadT4Xml(t4SummaryData, selectedYear, transmitterContact);
      setShowXmlContactModal(false);
    } catch (error) {
      console.error("Error exporting CRA XML:", error);
      alert(error.message || "An error occurred while exporting the CRA XML file. Please check the console.");
    } finally {
      setExportingXml(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Generate T4 & T4A Slips</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/paypro/Reports')} className="flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" />
            <BarChart3 className="w-4 h-4 mr-1" />
            Reports
          </Button>
          <Button variant="outline" onClick={() => navigate('/paypro/Trends')} className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4 mr-1" />
            Trends
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
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
              <Button
                  onClick={handleOpenXmlExport}
                  disabled={exportingXml || selectedEmployeeIds.length === 0 || !selectedYear}
                  variant="outline"
                  className="w-full md:w-auto md:ml-3 mt-3 md:mt-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                  <Download className="w-4 h-4 mr-2" />
                  Export CRA XML
              </Button>
              </div>
          </>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>This tool generates T4 slips for each selected employee and a T4A summary based on pay stubs recorded for the selected year.</p>
        <p>Export CRA XML produces an Internet File Transfer submission file for the selected employees and year - review it before uploading to My Business Account.</p>
        <p>Please verify all amounts before distributing to employees and submitting to CRA.</p>
      </div>

      {showXmlContactModal && (
        <CraXmlExportModal
          exporting={exportingXml}
          onExport={handleExportXml}
          onCancel={() => setShowXmlContactModal(false)}
        />
      )}
    </div>
  );
}
