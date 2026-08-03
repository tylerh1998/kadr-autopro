
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Briefcase, 
  FileText, 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  User,
  Calendar,
  X
} from 'lucide-react';
import { format } from 'date-fns';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function WorkPROViewModal({ open, onClose, workOrder }) {
  const [project, setProject] = useState(null);
  const [comments, setComments] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkPROData = useCallback(async () => {
    if (!workOrder?.wo_number) return;

    setLoading(true);
    try {
      // Fetch project
      const projectResponse = await fetch(`${API_BASE_URL}/Project?work_order=${workOrder.wo_number}`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });

      if (projectResponse.ok) {
        const projectsData = await projectResponse.json();
        const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
        const foundProject = projects.length > 0 ? projects[0] : null;
        setProject(foundProject);

        if (foundProject) {
          // Fetch comments
          const commentsResponse = await fetch(`${API_BASE_URL}/ProjectComment?project_id=${foundProject.id}`, {
            headers: { 'api_key': WORKPRO_API_KEY }
          });
          
          if (commentsResponse.ok) {
            const commentsData = await commentsResponse.json();
            const commentsArray = Array.isArray(commentsData) ? commentsData : (commentsData?.records || []);
            setComments(commentsArray.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
          }

          // Fetch inspections
          const inspectionsResponse = await fetch(`${API_BASE_URL}/Inspection?project_id=${foundProject.id}`, {
            headers: { 'api_key': WORKPRO_API_KEY }
          });
          
          if (inspectionsResponse.ok) {
            const inspectionsData = await inspectionsResponse.json();
            const inspectionsArray = Array.isArray(inspectionsData) ? inspectionsData : (inspectionsData?.records || []);
            setInspections(inspectionsArray);
          }
        }
      }

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
                      <p>{project.employee_assigned || 'Not assigned'}</p>
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

              {/* Comments */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                    Project Comments
                    {comments.length > 0 && (
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        {comments.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {comments.length > 0 ? (
                    <div className="space-y-4">
                      {comments.map((comment) => (
                        <div key={comment.id} className="bg-slate-50 p-4 rounded-lg dark:bg-slate-800">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {comment.author_name || 'Unknown'}
                              </span>
                            </div>
                            {comment.created_date && (
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {format(new Date(comment.created_date), 'MMM d, yyyy h:mm a')}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-700 whitespace-pre-wrap dark:text-slate-300">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-600 dark:text-slate-400">No comments yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Inspections */}
              {inspections.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      Digital Inspections
                      <Badge variant="outline" className="bg-indigo-100 text-indigo-800">
                        {inspections.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {inspections.map((inspection) => (
                        <div key={inspection.id} className="bg-slate-50 p-4 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {inspection.inspection_name || inspection.title || `Inspection #${inspection.id}`}
                              </p>
                              {inspection.inspection_date && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Calendar className="w-3 h-3 text-slate-500" />
                                  <span className="text-sm text-slate-600">
                                    {format(new Date(inspection.inspection_date), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              )}
                            </div>
                            <Badge variant="outline">{inspection.status || 'Unknown'}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Approvals */}
              {approvals.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Customer Approvals
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        {approvals.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {approvals.map((approval) => (
                        <div key={approval.id} className="bg-slate-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {getApprovalBadge(approval.type)}
                              <span className="font-semibold">{approval.customer_name || 'Customer'}</span>
                            </div>
                            {approval.date_approved && (
                              <span className="text-sm text-slate-500">
                                {format(new Date(approval.date_approved), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                          {approval.approval_amount && (
                            <p className="text-sm text-slate-600">
                              Amount: <span className="font-medium">${approval.approval_amount.toFixed(2)}</span>
                            </p>
                          )}
                          {approval.customer_comments && (
                            <p className="text-sm text-slate-700 mt-2 p-2 bg-white rounded border">
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
