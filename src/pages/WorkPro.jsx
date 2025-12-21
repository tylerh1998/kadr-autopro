import React, { useState, useEffect, useCallback } from "react";
import { Employee, User } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, FileText, DollarSign } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createPageUrl } from '@/utils';
// import ProjectForm from "../components/projects/ProjectForm"; // Temporarily commented out
import WorkPROModal from "../components/work-orders/WorkPROModal";

export default function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]); // This will be local Base44 Employee entity
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("-start_time");
  const [selectedProject, setSelectedProject] = useState(null); // This will hold WorkPRO Project data
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassignedRecordToAssign, setUnassignedRecordToAssign] = useState(null);
  const [activeProjects, setActiveProjects] = useState([]); // WorkPRO Projects
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [projectToAssign, setProjectToAssign] = useState(null);

  const getDefaultDateRange = () => {
    const today = new Date();
    const firstOfMonth = startOfMonth(today);
    const lastOfMonth = endOfMonth(today);

    return {
      from: format(firstOfMonth, "yyyy-MM-dd"),
      to: format(lastOfMonth, "yyyy-MM-dd")
    };
  };

  const formatHoursToHoursMinutes = (hours) => {
    if (hours === null || hours === undefined) return "0 hours 0 minutes";
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  useEffect(() => {
    const defaultRange = getDefaultDateRange();
    setDateFrom(defaultRange.from);
    setDateTo(defaultRange.to);
  }, []);

  const applyFilters = useCallback((activitiesToFilter, employee, type, fromDate, toDate) => {
    let filtered = activitiesToFilter;

    // Filter by employee
    if (employee !== "all") {
      filtered = filtered.filter(activity => activity.employee_name === employee);
    }

    // Filter by type
    if (type !== "all") {
      filtered = filtered.filter(activity => activity.type === type);
    }

    // Filter by date range
    if (fromDate && toDate) {
      filtered = filtered.filter(activity => {
        const activityDate = format(new Date(activity.start_time), 'yyyy-MM-dd');
        return activityDate >= fromDate && activityDate <= toDate;
      });
    }

    // Sort activities
    if (sortBy === "-start_time") {
      filtered = filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    } else if (sortBy === "start_time") {
      filtered = filtered.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    } else if (sortBy === "employee_name") {
      filtered = filtered.sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
    } else if (sortBy === "-hours") {
      filtered = filtered.sort((a, b) => (b.hours || 0) - (a.hours || 0));
    }

    setActivities(filtered);
  }, [sortBy]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await User.me();
      setUser(currentUser);

      let payrollActivities = [];
      let projectActivities = [];
      let unassignedActivities = [];
      let initialEmployeeFilter = "all";
      let employeeListForFilter = [];

      if (currentUser.access_level === 'lvl3_user') { 
        // Admin users can see all records
        const [timeRecordsRes, projectSessionsRes, unassignedSessionsRes] = await Promise.all([
          base44.functions.invoke('workProProxy', { entityName: 'TimeRecord', method: 'list', params: { sort: '-clock_in_time', limit: 1000 } }),
          base44.functions.invoke('workProProxy', { entityName: 'ProjectTimeSession', method: 'list', params: { sort: '-start_time', limit: 1000 } }),
          base44.functions.invoke('workProProxy', { entityName: 'UnassignedTime', method: 'list', params: { sort: '-start_time', limit: 1000 } }),
        ]);

        payrollActivities = timeRecordsRes.data.data.map(record => ({
          id: `payroll-${record.id}`,
          employee_name: record.employee_name,
          start_time: record.clock_in_time,
          end_time: record.clock_out_time,
          hours: record.total_hours,
          type: 'Payroll',
          project_name: null,
          project_id: null,
          status: record.status
        }));

        projectActivities = projectSessionsRes.data.data.map(session => ({
          id: `project-${session.id}`,
          employee_name: session.user_name,
          start_time: session.start_time,
          end_time: session.end_time,
          hours: session.total_hours,
          type: 'Project',
          project_name: session.project_name,
          project_id: session.project_id,
          status: session.status
        }));

        unassignedActivities = unassignedSessionsRes.data.data
          .filter(session => session.total_hours && session.total_hours > 0)
          .map(session => ({
            id: `unassigned-${session.id}`,
            employee_name: session.user_name,
            start_time: session.start_time,
            end_time: session.end_time,
            hours: session.total_hours,
            type: 'Unassigned',
            project_name: null,
            project_id: null,
            status: session.status
          }));

        const allLocalEmployees = await Employee.list();
        employeeListForFilter = [...new Set(allLocalEmployees.map(e => e.full_name))].sort();

      } else if (currentUser.access_level === 'lvl1_user' || currentUser.access_level === 'lvl2_user') {
        // For non-admin users, filter by their own employee name
        const employeeData = await Employee.filter({ email: currentUser.email, is_active: true });
        if (employeeData.length > 0) {
          const employeeSpecificName = employeeData[0].full_name;

          const [timeRecordsRes, projectSessionsRes, unassignedSessionsRes] = await Promise.all([
            base44.functions.invoke('workProProxy', { entityName: 'TimeRecord', method: 'filter', params: { employee_name: employeeSpecificName }, sort: '-clock_in_time', limit: 1000 }),
            base44.functions.invoke('workProProxy', { entityName: 'ProjectTimeSession', method: 'filter', params: { user_name: employeeSpecificName }, sort: '-start_time', limit: 1000 }),
            base44.functions.invoke('workProProxy', { entityName: 'UnassignedTime', method: 'filter', params: { user_name: employeeSpecificName }, sort: '-start_time', limit: 1000 }),
          ]);

          payrollActivities = timeRecordsRes.data.data.map(record => ({
            id: `payroll-${record.id}`,
            employee_name: record.employee_name,
            start_time: record.clock_in_time,
            end_time: record.clock_out_time,
            hours: record.total_hours,
            type: 'Payroll',
            project_name: null,
            project_id: null,
            status: record.status
          }));

          projectActivities = projectSessionsRes.data.data.map(session => ({
            id: `project-${session.id}`,
            employee_name: session.user_name,
            start_time: session.start_time,
            end_time: session.end_time,
            hours: session.total_hours,
            type: 'Project',
            project_name: session.project_name,
            project_id: session.project_id,
            status: session.status
          }));

          unassignedActivities = unassignedSessionsRes.data.data
            .filter(session => session.total_hours && session.total_hours > 0)
            .map(session => ({
              id: `unassigned-${session.id}`,
              employee_name: session.user_name,
              start_time: session.start_time,
              end_time: session.end_time,
              hours: session.total_hours,
              type: 'Unassigned',
              project_name: null,
              project_id: null,
              status: session.status
            }));

          initialEmployeeFilter = employeeSpecificName;
          employeeListForFilter = [employeeSpecificName];
        } else {
          console.warn("No active employee record found for current user. Displaying no activities.");
          setIsLoading(false);
          setAllActivities([]);
          setActivities([]);
          setEmployees([]);
          setSelectedEmployee("all");
          return;
        }
      } else {
        console.warn("User has no access level or an unsupported one. Displaying no activities.");
        setIsLoading(false);
        setAllActivities([]);
        setActivities([]);
        setEmployees([]);
        setSelectedEmployee("all");
        return;
      }

      const combinedActivities = [...payrollActivities, ...projectActivities, ...unassignedActivities];

      if (currentUser.access_level === 'lvl3_user') {
        employeeListForFilter = [...new Set(combinedActivities.map(a => a.employee_name))].sort();
        // Removed adding 'all' to the list to prevent duplicate dropdown option
        initialEmployeeFilter = selectedEmployee === 'all' ? 'all' : (employeeListForFilter.includes(selectedEmployee) ? selectedEmployee : 'all');

      } else {
         // For lvl1/lvl2, ensure their own name is selected if available
         initialEmployeeFilter = employeeListForFilter.includes(selectedEmployee) ? selectedEmployee : employeeListForFilter[0];
      }
      setEmployees(employeeListForFilter);
      setSelectedEmployee(initialEmployeeFilter);
      setAllActivities(combinedActivities);
      applyFilters(combinedActivities, initialEmployeeFilter, selectedType, dateFrom, dateTo);

    } catch (error) {
      console.error("Error loading activity data:", error);
      setAllActivities([]);
      setActivities([]);
      setEmployees([]);
      setSelectedEmployee("all");
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, dateFrom, dateTo, applyFilters, selectedEmployee]);

  const loadActiveProjects = useCallback(async () => {
    try {
      const projectsRes = await base44.functions.invoke('workProProxy', { entityName: 'Project', method: 'filter', params: { status: { '$ne': 'archived' } }, sort: '-created_date', limit: 500 });
      setActiveProjects(projectsRes.data.data);
    } catch (error) {
      console.error("Error loading active WorkPRO projects:", error);
      setActiveProjects([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isLoading && allActivities.length > 0) {
      applyFilters(allActivities, selectedEmployee, selectedType, dateFrom, dateTo);
    } else if (!isLoading && allActivities.length === 0) {
      setActivities([]);
    }
  }, [selectedEmployee, selectedType, dateFrom, dateTo, sortBy, allActivities, isLoading, applyFilters]);

  const handleProjectClick = async (projectId) => {
    if (!projectId) return;

    setIsProjectLoading(true);
    try {
      const projectDataRes = await base44.functions.invoke('workProProxy', { entityName: 'Project', method: 'get', id: projectId });
      setSelectedProject(projectDataRes.data.data);
    } catch (error) {
      console.error("Error loading WorkPRO project:", error);
      alert("Failed to load project details");
    } finally {
      setIsProjectLoading(false);
    }
  };

  const handleCancelProjectForm = () => {
    setSelectedProject(null);
  };

  const handleOpenAssignModal = async (activity) => {
    setUnassignedRecordToAssign(activity);
    setProjectSearchQuery("");
    await loadActiveProjects();
    setShowAssignModal(true);
  };

  const handleCancelAssignModal = () => {
    setShowAssignModal(false);
    setUnassignedRecordToAssign(null);
    setProjectSearchQuery("");
  };

  const handleOpenConfirmDialog = (project) => {
    setProjectToAssign(project);
    setShowConfirmDialog(true);
  };

  const handleCancelConfirmDialog = () => {
    setShowConfirmDialog(false);
    setProjectToAssign(null);
  };

  const handleConfirmAssignment = async () => {
    if (!unassignedRecordToAssign || !projectToAssign) return;

    try {
      const unassignedRecordId = unassignedRecordToAssign.id.replace('unassigned-', '');
      const hoursToAssign = unassignedRecordToAssign.hours;

      await base44.functions.invoke('workProProxy', { entityName: 'UnassignedTime', method: 'update', id: unassignedRecordId, params: { total_hours: 0 } });

      await base44.functions.invoke('workProProxy', {
        entityName: 'ProjectTimeSession',
        method: 'create',
        params: {
          project_id: projectToAssign.id,
          project_name: projectToAssign.name,
          user_email: user.email, // Assuming user.email is available and correct for WorkPRO
          user_name: unassignedRecordToAssign.employee_name,
          start_time: unassignedRecordToAssign.start_time,
          end_time: unassignedRecordToAssign.end_time,
          total_hours: hoursToAssign,
          status: "completed",
          notes: `Assigned from unassigned time`
        }
      });

      setShowConfirmDialog(false);
      setShowAssignModal(false);
      setUnassignedRecordToAssign(null);
      setProjectToAssign(null);
      await loadData();
      alert("Time successfully assigned to project!");
    } catch (error) {
      console.error("Error assigning time to WorkPRO project:", error);
      alert("Failed to assign time: " + (error.response?.data?.message || error.message));
    }
  };

  const filteredActiveProjects = activeProjects.filter(project => {
    if (!projectSearchQuery.trim()) return true;
    const query = projectSearchQuery.toLowerCase();
    return (
      (project.name && project.name.toLowerCase().includes(query)) ||
      (project.customer && project.customer.toLowerCase().includes(query)) ||
      (project.vehicle && project.vehicle.toLowerCase().includes(query)) ||
      (project.work_order && project.work_order.toLowerCase().includes(query))
    );
  });

  const totalHours = activities.reduce((sum, activity) => sum + (activity.hours || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="activity_log" className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <TabsList>
              <TabsTrigger value="activity_log">Activity Log</TabsTrigger>
              <TabsTrigger value="time_records">Time Records</TabsTrigger>
            </TabsList>

            {user?.access_level === 'lvl3_user' && (
              <Button
                onClick={() => window.location.href = createPageUrl('Payroll')}
                className="bg-green-600 hover:bg-green-700 shadow-lg"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                Payroll
              </Button>
            )}
          </div>

          <TabsContent value="activity_log">
            <Card className="shadow-lg border-0 mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {employees.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="employee-filter">Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger id="employee-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {user?.access_level === 'lvl3_user' && ( // Changed from lvl2 to lvl3_user
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
                <Label htmlFor="type-filter">Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger id="type-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Payroll">Payroll</SelectItem>
                    <SelectItem value="Project">Project</SelectItem>
                    <SelectItem value="Unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">Date From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to">Date To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort-by">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger id="sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-start_time">Latest First</SelectItem>
                    <SelectItem value="start_time">Oldest First</SelectItem>
                    <SelectItem value="employee_name">Employee Name</SelectItem>
                    <SelectItem value="-hours">Most Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-gray-600">Total Hours</Label>
                <div className="text-2xl font-bold text-blue-600 pt-2">
                  {totalHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Activity Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading activities...</p>
            </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No activities found</h3>
                <p className="text-gray-600">Adjust your filters to view activities.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold">Employee</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Project</TableHead>
                      <TableHead className="font-semibold">Start Time</TableHead>
                      <TableHead className="font-semibold">End Time</TableHead>
                      <TableHead className="font-semibold">Hours</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {activity.employee_name}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            activity.type === "Project"
                              ? "bg-green-100 text-green-800"
                              : activity.type === "Unassigned"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-purple-100 text-purple-800"
                          }>
                            {activity.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {activity.type === "Unassigned" ? (
                            <span
                              className="text-blue-600 hover:text-blue-800 cursor-pointer underline"
                              onClick={() => handleOpenAssignModal(activity)}
                            >
                              Assign
                            </span>
                          ) : activity.project_name ? (
                            <span
                              className="text-blue-600 hover:text-blue-800 cursor-pointer underline"
                              onClick={() => handleProjectClick(activity.project_id)}
                            >
                              {activity.project_name}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {activity.start_time ? format(new Date(activity.start_time), "MMM d, yyyy HH:mm") : <span className="text-gray-400">-</span>}
                        </TableCell>
                        <TableCell>
                          {activity.end_time
                            ? format(new Date(activity.end_time), "MMM d, yyyy HH:mm")
                            : <span className="text-gray-400">-</span>
                          }
                        </TableCell>
                        <TableCell
                          className="font-medium cursor-help"
                          title={activity.hours ? formatHoursToHoursMinutes(activity.hours) : ""}
                        >
                          {activity.hours ? `${activity.hours.toFixed(2)}h` : <span className="text-gray-400">-</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            activity.status === "running" || activity.status === "clocked_in" || activity.status === "active"
                              ? "bg-green-100 text-green-800"
                              : activity.status === "locked"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                          }>
                            {activity.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time_records">
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900">Time Records Module</h3>
                <p>This feature will be available in a future update.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Loading Modal */}
      <Dialog open={isProjectLoading} onOpenChange={(open) => !open && setIsProjectLoading(false)}>
        <DialogContent>
            <div className="flex justify-center items-center p-8">
                <Loader2 className="w-8 h-8 animate-spin mr-2" />
                <span>Loading Project...</span>
            </div>
        </DialogContent>
      </Dialog>

      {/* WorkPRO Project Modal */}
      {selectedProject && (
        <WorkPROModal
            open={!!selectedProject}
            onClose={handleCancelProjectForm}
            workOrder={selectedProject.work_order ? { ro_number: selectedProject.work_order } : null}
            customer={selectedProject.customer ? { org_name: selectedProject.customer } : null}
            initialWorkPROProject={selectedProject}
        />
      )}

      {/* Assign Unassigned Time Modal */}
      <Dialog open={showAssignModal} onOpenChange={(open) => !open && handleCancelAssignModal()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Time to Project</DialogTitle>
            <DialogDescription>
              {unassignedRecordToAssign && (
                <p className="text-sm text-gray-600 mt-2">
                  {unassignedRecordToAssign.employee_name} • {unassignedRecordToAssign.hours?.toFixed(2)}h • {format(new Date(unassignedRecordToAssign.start_time), "MMM d, yyyy HH:mm")}
                </p>
              )}
              <p className="text-xs text-blue-600 mt-2">
                Only active projects appear here. To add time to an archived project, change its status first.
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0 py-4">
            <Input
              placeholder="Search projects by name, customer, vehicle, or work order..."
              value={projectSearchQuery}
              onChange={(e) => setProjectSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredActiveProjects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">
                  {projectSearchQuery.trim() ? "No projects match your search" : "No active projects available"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredActiveProjects.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{project.name}</h3>
                        <p className="text-sm text-gray-600">
                          {project.customer} • {project.vehicle}
                        </p>
                        {project.work_order && (
                          <p className="text-xs text-gray-500 mt-1">WO: {project.work_order}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={
                          project.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : project.status === "to_do"
                              ? "bg-gray-100 text-gray-800"
                              : project.status === "done"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                        }>
                          {project.status?.replace(/_/g, " ")}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleOpenConfirmDialog(project)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Assign
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleCancelAssignModal}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => !open && handleCancelConfirmDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {unassignedRecordToAssign && projectToAssign && (
              <div className="space-y-3">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Unassigned Time:</p>
                  <p className="text-sm text-gray-600">
                    <strong>Employee:</strong> {unassignedRecordToAssign.employee_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Hours:</strong> {unassignedRecordToAssign.hours?.toFixed(2)}h
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Date:</strong> {format(new Date(unassignedRecordToAssign.start_time), "MMM d, yyyy HH:mm")}
                  </p>
                </div>

                <div className="flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Assign to Project:</p>
                  <p className="text-sm text-gray-600">
                    <strong>Project:</strong> {projectToAssign.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Customer:</strong> {projectToAssign.customer}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Vehicle:</strong> {projectToAssign.vehicle}
                  </p>
                  {projectToAssign.work_order && (
                    <p className="text-sm text-gray-600">
                      <strong>Work Order:</strong> {projectToAssign.work_order}
                    </p>
                  )}
                </div>

                <p className="text-sm text-gray-500 italic">
                  Are you sure you want to assign this unassigned time to this project?
                </p>
              </div>
            )}

            <DialogFooter className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCancelConfirmDialog}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAssignment}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Confirm Assignment
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}