import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { Employee } from "@/entities/Employee";
import { Button } from "@/components/ui/button";
import { FileDown, LogIn, Clock } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from '@/api/base44Client';
import TimeRecordsList from "./TimeRecordsList";

export default function TimeRecordsView() {
  const [records, setRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [employees, setEmployees] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const getDefaultDateRange = () => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const sixteenthOfMonth = new Date(currentYear, currentMonth, 16);
    
    if (currentDay <= 15) {
      // Days 1-15: show first half of month
      return {
        from: format(firstOfMonth, "yyyy-MM-dd"),
        to: format(new Date(currentYear, currentMonth, 15), "yyyy-MM-dd")
      };
    } else {
      // Days 16+: show second half of month
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      return {
        from: format(sixteenthOfMonth, "yyyy-MM-dd"),
        to: format(new Date(currentYear, currentMonth, lastDayOfMonth), "yyyy-MM-dd")
      };
    }
  };

  useEffect(() => {
    const defaultRange = getDefaultDateRange();
    setDateFrom(defaultRange.from);
    setDateTo(defaultRange.to);
  }, []);

  const loadRecords = useCallback(async (currentUser) => {
    if (!currentUser) {
        setIsLoading(false);
        setAllRecords([]);
        setEmployees([]);
        return;
    }
    setIsLoading(true);
    try {
      let recordsData = [];
      let uniqueEmployeeNames = [];

      // Use workProProxy to fetch TimeRecords
      if (currentUser.access_level === 'lvl3_user') {
        // Admin users can see all records
        const response = await base44.functions.invoke('workProProxy', { 
            entityName: 'TimeRecord', 
            method: 'list', 
            params: { sort: '-clock_in_time', limit: 500 } 
        });
        recordsData = response.data.data || [];
        uniqueEmployeeNames = [...new Set(recordsData.map(r => r.employee_name))].sort();
      } else {
        // For non-admin users
        // Priority 1: Use User_name from User entity (matches WorkPRO data)
        let employeeName = currentUser.User_name;
        
        if (!employeeName) {
            // Priority 2: Try to find matching Employee entity by email
            const employeeData = await Employee.filter({ email: currentUser.email, is_active: true });
            
            if (employeeData.length > 0) {
                employeeName = employeeData[0].full_name;
            } else if (currentUser.full_name) {
                // Priority 3: Fallback to User's full name
                console.log("No User_name or linked Employee record found, using User full_name:", currentUser.full_name);
                employeeName = currentUser.full_name;
            }
        }

        if (employeeName) {
            const response = await base44.functions.invoke('workProProxy', { 
                entityName: 'TimeRecord', 
                method: 'filter', 
                params: { employee_name: employeeName },
                sort: '-clock_in_time', 
                limit: 500
            });
            recordsData = response.data.data || [];
            uniqueEmployeeNames = [employeeName];
            setSelectedEmployee(employeeName);
        } else {
            console.warn("Could not determine employee name for user:", currentUser.email);
            recordsData = [];
            uniqueEmployeeNames = [];
            setSelectedEmployee("all");
        }
      }
      
      const dailySums = {};
      const lastRecordOfDay = {};

      recordsData.forEach(record => { 
        if ((record.status === 'clocked_out' || record.status === 'locked' || record.status === 'error') && record.total_hours && record.clock_in_time) {
            const clockInDate = new Date(record.clock_in_time);
            if (isNaN(clockInDate.getTime())) return;
            
            const dayKey = `${format(clockInDate, 'yyyy-MM-dd')}-${record.employee_name}`;
            
            if (!dailySums[dayKey]) {
                dailySums[dayKey] = 0;
            }
            dailySums[dayKey] += record.total_hours;

            const clockOutTime = record.clock_out_time ? new Date(record.clock_out_time) : null;
            const existingRecordClockOut = lastRecordOfDay[dayKey] 
                ? new Date(recordsData.find(r => r.id === lastRecordOfDay[dayKey])?.clock_out_time)
                : null;
            
            if (!lastRecordOfDay[dayKey] || (clockOutTime && existingRecordClockOut && clockOutTime > existingRecordClockOut)) {
                lastRecordOfDay[dayKey] = record.id;
            }
        }
      });
      
      const augmentedRecords = recordsData.map(record => {
        if (!record.clock_in_time) return record;
        const clockInDate = new Date(record.clock_in_time);
        if (isNaN(clockInDate.getTime())) return record;
        
        const dayKey = `${format(clockInDate, 'yyyy-MM-dd')}-${record.employee_name}`;
        if (record.id === lastRecordOfDay[dayKey]) {
            const dayTotal = dailySums[dayKey];
            const regularHours = Math.min(dayTotal, 8);
            const overtimeHours = Math.max(0, dayTotal - 8);
            return { 
                ...record, 
                dayTotal: dayTotal,
                regularHours: regularHours,
                overtimeHours: overtimeHours
            };
        }
        return {
            ...record,
            dayTotal: null,
            regularHours: 0,
            overtimeHours: 0
        };
      });
      
      setAllRecords(augmentedRecords);
      setEmployees(uniqueEmployeeNames);

    } catch (error) {
      console.error("Error loading records:", error);
      setAllRecords([]);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchUserAndRecords = async () => {
      setIsLoading(true);
      try {
        const currentUser = await User.me();
        setUser(currentUser);
        await loadRecords(currentUser);
      } catch (error) {
        console.error("Error fetching user or initial records:", error);
        setUser(null);
        setRecords([]);
        setAllRecords([]);
        setEmployees([]);
        setSelectedEmployee("all");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserAndRecords();
  }, [loadRecords]);

  const applyFilters = useCallback((recordsToFilter, employee, fromDate, toDate) => {
    let filtered = recordsToFilter;

    if (employee !== "all") {
      filtered = filtered.filter(record => record.employee_name === employee);
    }

    if (fromDate && toDate) {
      filtered = filtered.filter(record => {
        if (!record.clock_in_time) return false;
        const clockInDate = new Date(record.clock_in_time);
        if (isNaN(clockInDate.getTime())) return false;
        const recordDate = format(clockInDate, 'yyyy-MM-dd');
        return recordDate >= fromDate && recordDate <= toDate;
      });
    }

    setRecords(filtered);
  }, []); 

  useEffect(() => {
    if (!isLoading && user) {
        applyFilters(allRecords, selectedEmployee, dateFrom, dateTo);
    }
  }, [selectedEmployee, dateFrom, dateTo, allRecords, user, isLoading, applyFilters]);

  const totals = {
    regular: records.reduce((sum, r) => sum + (r.regularHours || 0), 0),
    overtime: records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0),
    pto: records.reduce((sum, r) => sum + (r.pto_hours || 0), 0),
    stat: records.reduce((sum, r) => sum + (r.stat_hours || 0), 0)
  };

  return (
    <div id="print-section">
      <style>{`
        @media print {
          @page { size: landscape; margin: 1cm; }
          body * { visibility: hidden; }
          #print-section, #print-section * { visibility: visible; }
          #print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .hours-summary-card { 
            box-shadow: none !important; 
            border: 1px solid #e2e8f0 !important;
            margin-bottom: 20px !important;
          }
        }
        .print-only { display: none; }
      `}</style>

      <div className="print-only mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Time Records Report</h1>
        <div className="flex justify-between items-end">
          <div className="text-sm text-gray-600">
            <p>Employee: {selectedEmployee === 'all' ? 'All Employees' : selectedEmployee}</p>
            <p>Period: {dateFrom && dateTo ? `${format(new Date(dateFrom), 'MMM d, yyyy')} - ${format(new Date(dateTo), 'MMM d, yyyy')}` : 'All Dates'}</p>
          </div>
          <div className="text-sm text-gray-500">
            Generated: {format(new Date(), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
      </div>

      <Card className="shadow-lg border-0 mb-6 no-print">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {employees.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="tr-employee-filter">Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger id="tr-employee-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {user?.access_level === 'lvl3_user' && (
                      <SelectItem value="all">All Employees</SelectItem>
                    )}
                    {employees.map((employeeName) => (
                      <SelectItem key={employeeName} value={employeeName}>
                        {employeeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="tr-date-from">Date From</Label>
              <Input
                id="tr-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="tr-date-to">Date To</Label>
              <Input
                id="tr-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">Records Found</Label>
              <div className="text-2xl font-bold text-blue-600 pt-2">
                {records.length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-0 mb-6 hours-summary-card">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Hours Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{totals.regular.toFixed(1)}h</div>
              <div className="text-sm text-gray-600">Regular Hours</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{totals.overtime.toFixed(1)}h</div>
              <div className="text-sm text-gray-600">Overtime</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{totals.pto.toFixed(1)}h</div>
              <div className="text-sm text-gray-600">PTO Hours</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{totals.stat.toFixed(1)}h</div>
              <div className="text-sm text-gray-600">STAT Hours</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!user && !isLoading ? (
        <Card className="shadow-lg border-0 no-print">
          <CardContent className="p-12 text-center">
            <LogIn className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Please Sign In</h3>
            <p className="text-gray-600">You need to be logged in to view your time records.</p>
          </CardContent>
        </Card>
      ) : (
        <TimeRecordsList records={records} isLoading={isLoading} />
      )}
    </div>
  );
}