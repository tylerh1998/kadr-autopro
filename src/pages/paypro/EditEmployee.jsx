import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Employee, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import { createPageUrl } from "@/utils";

import GeneralTab from "@/components/paypro/employees/tabs/GeneralTab";
import PayTab from "@/components/paypro/employees/tabs/PayTab";
import DeductionsTab from "@/components/paypro/employees/tabs/DeductionsTab";
import TrainingTab from "@/components/paypro/employees/tabs/TrainingTab";
import OtherTab from "@/components/paypro/employees/tabs/OtherTab";

const calculateStatus = (startDate, endDate) => {
  if (startDate && !endDate) {
    return 'active';
  }
  return 'inactive';
};

// Function to generate a unique employee ID
const generateEmployeeId = async () => {
  const employees = await Employee.list();
  const existingIds = employees.map(e => e.employee_id).filter(id => id);

  let newId = 1;
  while (existingIds.includes(`EMP${String(newId).padStart(3, '0')}`)) {
    newId++;
  }

  return `EMP${String(newId).padStart(3, '0')}`;
};

export default function EditEmployee() {
  const location = useLocation();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState(null);
  const [employee, setEmployee] = useState({
    first_name: "",
    last_name: "",
    employee_id: "",
    email: "",
    sin: "",
    address: "",
    date_of_birth: "",
    start_date: "",
    end_date: null,
    employee_type: "Full Time",
    federal_td1_basic: 0,
    provincial_td1_basic: 0,
    vacation_pay_rate: 0,
    status: "inactive",
    notes: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      setEmployeeId(id);
      const fetchEmployee = async () => {
        try {
          const data = await Employee.get(id);
          // Ensure null dates are handled properly for input[type=date]
          data.date_of_birth = data.date_of_birth ? data.date_of_birth.split('T')[0] : "";
          data.start_date = data.start_date ? data.start_date.split('T')[0] : "";
          data.end_date = data.end_date ? data.end_date.split('T')[0] : null;

          // Ensure vacation_pay_rate has a default value
          if (data.vacation_pay_rate === undefined || data.vacation_pay_rate === null) {
            data.vacation_pay_rate = 0;
          }

          // Recalculate status on load
          data.status = calculateStatus(data.start_date, data.end_date);

          setEmployee(data);
        } catch (error) {
          console.error("Failed to fetch employee:", error);
        }
        setLoading(false);
      };
      fetchEmployee();
    } else {
      // For new employees, generate an employee ID and fetch current year tax constants
      const setupNewEmployee = async () => {
        try {
          const newEmployeeId = await generateEmployeeId();

          // Fetch current year's tax constants for defaults
          const currentYear = new Date().getFullYear();
          const taxConstants = await TaxYearConstant.filter({ year: currentYear });

          let federalDefault = 0;
          let provincialDefault = 0;

          if (taxConstants.length > 0) {
            federalDefault = taxConstants[0].federal_basic_personal_amount || 0;
            provincialDefault = taxConstants[0].provincial_basic_personal_amount || 0;
          }

          setEmployee(prev => ({
            ...prev,
            employee_id: newEmployeeId,
            federal_td1_basic: federalDefault,
            provincial_td1_basic: provincialDefault
          }));
        } catch (error) {
          console.error("Failed to setup new employee:", error);
        }
        setLoading(false);
      };
      setupNewEmployee();
    }
  }, [location.search]);

  const handleFieldChange = (field, value) => {
    setEmployee(prev => {
      const newEmployee = { ...prev, [field]: value };

      // Automatic status calculation using the new function
      newEmployee.status = calculateStatus(newEmployee.start_date, newEmployee.end_date);

      // Ensure end_date is cleared if start_date is removed
      if (!newEmployee.start_date) {
          newEmployee.end_date = null;
      }

      return newEmployee;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (employeeId) {
        await Employee.update(employeeId, employee);
      } else {
        await Employee.create(employee);
      }
      alert("Employee saved successfully!");
      navigate(createPageUrl("paypro/Employees"));
    } catch (error) {
      console.error("Failed to save employee:", error);
      alert("Error saving employee. Please check the console for details.");
    }
    setSaving(false);
  };

  if (loading) {
      return (
          <div className="flex items-center justify-center h-screen">
              <Loader2 className="w-8 h-8 animate-spin dark:text-slate-400" />
          </div>
      )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Button variant="ghost" onClick={() => navigate(createPageUrl("paypro/Employees"))} className="mb-2 dark:text-slate-300 dark:hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Employees
          </Button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {employeeId ? `Edit ${employee.first_name} ${employee.last_name}` : "Add New Employee"}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-800 text-white hover:bg-blue-900">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {employeeId ? "Save Changes" : "Create Employee"}
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
          <TabsTrigger value="general" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">General</TabsTrigger>
          <TabsTrigger value="pay" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Pay</TabsTrigger>
          <TabsTrigger value="deductions" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Deductions</TabsTrigger>
          <TabsTrigger value="training" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Training</TabsTrigger>
          <TabsTrigger value="other" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Other</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab employee={employee} onFieldChange={handleFieldChange} />
        </TabsContent>
        <TabsContent value="pay">
          <PayTab employeeId={employeeId} employee={employee} onFieldChange={handleFieldChange} />
        </TabsContent>
        <TabsContent value="deductions">
          <DeductionsTab employee={employee} onFieldChange={handleFieldChange} employeeId={employeeId} />
        </TabsContent>
        <TabsContent value="training">
          <TrainingTab employeeId={employeeId} />
        </TabsContent>
        <TabsContent value="other">
          <OtherTab employee={employee} onFieldChange={handleFieldChange} employeeId={employeeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
