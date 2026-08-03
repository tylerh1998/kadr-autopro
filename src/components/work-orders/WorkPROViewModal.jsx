
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  FileText,
  CheckCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

// Inspection sections data (mirrors WorkPROModal.jsx's inline checklist)
const INSPECTION_SECTIONS = [
  {
    section_name: "Fluids",
    display_order: 1,
    inspection_items: ["Differential Fluid", "Transfer Case Fluid", "Brake Fluid", "Coolant", "Power Steering Fluid", "Windshield Wash", "Transmission Fluid"]
  },
  {
    section_name: "Tires (Visual Only)",
    display_order: 2,
    inspection_items: ["Tread Depth", "Tires/Rims"]
  },
  {
    section_name: "Electrical & Misc",
    display_order: 3,
    inspection_items: ["Battery", "Lights & Signals", "Shock/Strut (visual)", "Brakes (visual)", "Ball Joints", "Air/Cabin Filter", "Drive Belt(s)", "Wiper Blades", "Driveline (visual)", "Exhaust (visual)", "Block Heater"]
  }
];

export default function WorkPROViewModal({ open, onClose, workOrder }) {
  const [project, setProject] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkPROData = useCallback(async () => {
    if (!workOrder?.wo_number) return;

    setLoading(true);
    try {
      // Fetch project
      const { data: projects, error: projectError } = await supabase
        .from('Project')
        .select('*')
        .eq('work_order', workOrder.wo_number);

      if (projectError) console.error('Error fetching WorkPRO project:', projectError);
      const foundProject = (projects && projects.length > 0) ? projects[0] : null;
      setProject(foundProject);

      // Fetch approvals (using cp_id)
      if (workOrder.cp_id) {
        const { Approvals } = await import('@/entities/Approvals');
        const approvalsData = await Approvals.filter({ cp_id: workOrder.cp_id }, '-created_date');
        setApprovals(approvalsData);
      }
    } catch (error) {
      console.error('Error fetching WorkPRO data:', error);
    } finally {
      setLoading(false);
    }
  }, [workOrder?.wo_number, workOrder?.cp_id]);

  useEffect(() => {
    if (open && workOrder) {
      fetchWorkPROData();
    }
  }, [open, workOrder, fetchWorkPROData]);

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'done':
        return <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
      case 'on_hold':
        return <AlertTriangle className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getApprovalBadge = (type) => {
    const isApproved = type?.toLowerCase() === 'approved';
    const isDenied = type?.toLowerCase() === 'denied';

    return (
      <Badge
        variant={isApproved ? 'default' : isDenied ? 'destructive' : 'outline'}
        className={isApproved ? 'bg-green-600' : isDenied ? 'bg-red-600' : 'bg-yellow-600'}
      >
        {isApproved ? <CheckCircle className="w-3 h-3 mr-1" /> :
         isDenied ? <X className="w-3 h-3 mr-1" /> :
         <AlertTriangle className="w-3 h-3 mr-1" />}
        {type || 'Unknown'}
      </Badge>
    );
  };

  const getAssignedEmployeesDisplay = () => {
    if (Array.isArray(project?.employees_assigned) && project.employees_assigned.length > 0) {
      return project.employees_assigned.join(', ');
    }
    return project?.employee_assigned || 'Not assigned';
  };

  // Get inspection result for a specific item
  const getInspectionResult = (sectionName, itemName) => {
    if (!project?.inspection_results) return null;
    const key = `${sectionName}-${itemName}`;
    return project.inspection_results[key] || null;
  };

  // Parse inspection comments from JSON string
  const getInspectionComments = () => {
    if (!project?.inspection_comments) return {};
    try {
      return typeof project.inspection_comments === 'string'
        ? JSON.parse(project.inspection_comments)
        : project.inspection_comments;
    } catch (error) {
      console.error('Error parsing inspection comments:', error);
      return {};
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            WorkPRO Details - View Only
            {project && (
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800">
                Connected
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto dark:border-blue-400"></div>
              <p className="mt-2 text-slate-600 dark:text-slate-400">Loading WorkPRO data...</p>
            </div>
          )}

          {!loading && !project && (
            <Card className="border-2 border-dashed border-slate-300 dark:border-slate-700">
              <CardContent className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-4 dark:text-slate-500" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2 dark:text-slate-300">No WorkPRO Project Connected</h3>
                <p className="text-slate-600 dark:text-slate-400">
                  This work order is not currently linked to a WorkPRO project.
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && project && (
            <>
              {/* Project Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(project.status)}
                    Project Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Project Name</label>
                      <p className="font-semibold">{project.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Status</label>
                      <p className="font-semibold capitalize">{project.status?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Assigned Employees</label>
                      <p>{getAssignedEmployeesDisplay()}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Time Estimate</label>
                      <p>{project.time_estimate ? `${project.time_estimate} hours` : 'Not set'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Task */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Task
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-700 dark:text-slate-300">{project.name || 'No task defined'}</p>
                </CardContent>
              </Card>

              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-700 whitespace-pre-wrap dark:text-slate-300">{project.description || 'No description provided'}</p>
                </CardContent>
              </Card>

              {/* Tech Time */}
              {project.time_estimate && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      Tech Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Estimated Time</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{project.time_estimate} hours</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Inspection Results */}
              {project.inspection_results && Object.keys(project.inspection_results).length > 0 && (
                <Card className="bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 dark:text-slate-100">Inspection Results</h3>

                    <div className="space-y-4">
                      {INSPECTION_SECTIONS.sort((a, b) => a.display_order - b.display_order).map((section) => {
                        const comments = getInspectionComments();
                        const sectionComment = comments[section.section_name];

                        return (
                          <div key={section.section_name}>
                            <h4 className="text-xs font-semibold text-slate-700 mb-2 dark:text-slate-300">{section.section_name}</h4>
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden dark:bg-slate-900 dark:border-slate-700">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-slate-100 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                                    <th className="text-left p-2 font-medium text-slate-700 dark:text-slate-300">Item</th>
                                    <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Good</th>
                                    <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Fair</th>
                                    <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Poor</th>
                                    <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">N/A</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.inspection_items.map((item) => {
                                    const result = getInspectionResult(section.section_name, item);
                                    return (
                                      <tr key={item} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                        <td className="p-2 text-slate-900 dark:text-slate-100">{item}</td>
                                        <td className="p-2 text-center">
                                          {result === 'good' && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'fair' && <CheckCircle2 className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'poor' && <CheckCircle2 className="w-4 h-4 text-red-600 dark:text-red-400 mx-auto" />}
                                        </td>
                                        <td className="p-2 text-center">
                                          {result === 'n/a' && <CheckCircle2 className="w-4 h-4 text-slate-400 mx-auto" />}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {sectionComment && (
                              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-slate-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-slate-300">
                                <span className="font-medium">Comments: </span>
                                {sectionComment}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Approvals */}
              {approvals.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      Customer Approvals
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        {approvals.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {approvals.map((approval) => (
                        <div key={approval.id} className="bg-slate-50 p-4 rounded-lg dark:bg-slate-800">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {getApprovalBadge(approval.type)}
                              <span className="font-semibold">{approval.customer_name || 'Customer'}</span>
                            </div>
                            {approval.date_approved && (
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {format(new Date(approval.date_approved), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                          {approval.approval_amount && (
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              Amount: <span className="font-medium">${approval.approval_amount.toFixed(2)}</span>
                            </p>
                          )}
                          {approval.customer_comments && (
                            <p className="text-sm text-slate-700 mt-2 p-2 bg-white rounded border dark:text-slate-300 dark:bg-slate-900 dark:border-slate-700">
                              {approval.customer_comments}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
