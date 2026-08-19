import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Employee } from "@/components/paypro/lib/payrollEntities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Settings, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPageUrl } from "@/utils";

import EmployeeList from "@/components/paypro/employees/EmployeeList";
import ValidPayTypeManagerModal from "@/components/paypro/paytypes/ValidPayTypeManagerModal";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
    if (statusFilter !== "all" && employee.status !== statusFilter) return false;

    const query = searchQuery.toLowerCase();
    return (
      employee.first_name?.toLowerCase().includes(query) ||
      employee.last_name?.toLowerCase().includes(query) ||
      employee.employee_id?.toLowerCase().includes(query) ||
      employee.email?.toLowerCase().includes(query)
    );
  });

  const activeEmployees = employees.filter(emp => emp.status === 'active').length;
  const inactiveEmployees = employees.filter(emp => emp.status === 'inactive').length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Employee Management</h1>
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

      {/* Action Bar — mini stat badges + search + status filter, consolidated into one control area */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{employees.length}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Total</span>
          </div>
          <div className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{activeEmployees}</span>
            <span className="text-xs text-emerald-600/80 dark:text-emerald-400/70">Active</span>
          </div>
        </div>

        <div className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[190px] shrink-0 border-slate-200 dark:border-slate-700 dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees ({employees.length})</SelectItem>
            <SelectItem value="active">Active ({activeEmployees})</SelectItem>
            <SelectItem value="inactive">Inactive ({inactiveEmployees})</SelectItem>
          </SelectContent>
        </Select>
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
