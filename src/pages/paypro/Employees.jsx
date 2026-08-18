import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Employee } from "@/components/paypro/lib/payrollEntities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createPageUrl } from "@/utils";

import EmployeeList from "@/components/paypro/employees/EmployeeList";
import ValidPayTypeManagerModal from "@/components/paypro/paytypes/ValidPayTypeManagerModal";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPayTypeManager, setShowPayTypeManager] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await Employee.list('-created_date');
      setEmployees(data);
    } catch (error) {
      console.error("Error loading employees:", error);
    }
    setLoading(false);
  };

  const handleEdit = (employee) => {
    navigate(createPageUrl("paypro/EditEmployee") + "?id=" + employee.id);
  };

  const handleAddNew = () => {
    navigate(createPageUrl("paypro/EditEmployee"));
  };

  const filteredEmployees = employees.filter(employee => {
    const query = searchQuery.toLowerCase();
    return (
      employee.first_name?.toLowerCase().includes(query) ||
      employee.last_name?.toLowerCase().includes(query) ||
      employee.employee_id?.toLowerCase().includes(query) ||
      employee.email?.toLowerCase().includes(query)
    );
  });

  const activeEmployees = employees.filter(emp => emp.status === 'active').length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Employee Management</h1>
          <p className="text-slate-600 dark:text-slate-400">Manage your workforce and employee information</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowPayTypeManager(true)}
            variant="outline"
            className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            <Settings className="w-5 h-5 mr-2" />
            Manage Pay Types
          </Button>
          <Button
            onClick={handleAddNew}
            className="bg-blue-800 hover:bg-blue-900 text-white shadow-lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm dark:bg-slate-900">
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{employees.length}</div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Employees</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm dark:bg-slate-900">
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeEmployees}</div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Active Employees</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Employee List */}
      <EmployeeList
        employees={filteredEmployees}
        loading={loading}
        onEdit={handleEdit}
      />

      {/* Pay Type Manager Modal */}
      {showPayTypeManager && (
        <ValidPayTypeManagerModal
          isOpen={showPayTypeManager}
          onClose={() => setShowPayTypeManager(false)}
        />
      )}
    </div>
  );
}
