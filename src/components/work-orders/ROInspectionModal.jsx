import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Calendar, User, CheckCircle2, AlertCircle, Clock, RefreshCw, ExternalLink } from "lucide-react";
import { format } from 'date-fns';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68be5d798e9d5c950954eb0d';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function ROInspectionModal({ open, onClose, workOrder, onInspectionCountUpdate }) {
    const [inspections, setInspections] = useState([]);
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchInspections = useCallback(async () => {
        if (!workOrder?.wo_number) {
            setError("Work Order has no WO number. Cannot fetch inspections.");
            setInspections([]);
            setProject(null);
            return;
        }

        setLoading(true);
        setError(null);
        
        try {
            console.log(`Fetching inspections for WO: ${workOrder.wo_number}`);
            
            // First, find the project associated with this work order
            const projectResponse = await fetch(`${API_BASE_URL}/Project?work_order=${workOrder.wo_number}`, {
                headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' }
            });

            if (!projectResponse.ok) {
                throw new Error(`Failed to fetch WorkPRO project: ${projectResponse.status}`);
            }

            const projectsData = await projectResponse.json();
            const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
            const foundProject = projects.length > 0 ? projects[0] : null;

            if (!foundProject) {
                setError("This work order is not connected to a WorkPRO project. Connect it to WorkPRO to view inspections.");
                setInspections([]);
                setProject(null);
                onInspectionCountUpdate(0);
                return;
            }

            setProject(foundProject);

            // Fetch inspections for this project
            const inspectionsResponse = await fetch(`${API_BASE_URL}/Inspection?project_id=${foundProject.id}`, {
                headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' }
            });

            if (!inspectionsResponse.ok) {
                throw new Error(`Failed to fetch inspections: ${inspectionsResponse.status}`);
            }

            const inspectionsData = await inspectionsResponse.json();
            const inspectionsArray = Array.isArray(inspectionsData) ? inspectionsData : (inspectionsData?.records || []);
            
            // Sort inspections by creation date (newest first)
            const sortedInspections = inspectionsArray.sort((a, b) => 
                new Date(b.created_date || b.inspection_date) - new Date(a.created_date || a.inspection_date)
            );

            setInspections(sortedInspections);
            onInspectionCountUpdate(sortedInspections.length);

        } catch (err) {
            console.error('Error fetching inspections:', err);
            setError(err.message);
            setInspections([]);
            onInspectionCountUpdate(0);
        } finally {
            setLoading(false);
        }
    }, [workOrder?.wo_number, onInspectionCountUpdate]);

    useEffect(() => {
        if (open && workOrder?.wo_number) {
            fetchInspections();
        }
    }, [open, workOrder?.wo_number, fetchInspections]);

    const getStatusBadge = (status) => {
        const statusLower = status?.toLowerCase() || '';
        
        if (statusLower.includes('complete') || statusLower.includes('done')) {
            return (
                <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Completed
                </Badge>
            );
        } else if (statusLower.includes('progress') || statusLower.includes('active')) {
            return (
                <Badge variant="default" className="bg-blue-600">
                    <Clock className="w-3 h-3 mr-1" />
                    In Progress
                </Badge>
            );
        } else if (statusLower.includes('pending') || statusLower.includes('scheduled')) {
            return (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Pending
                </Badge>
            );
        } else {
            return (
                <Badge variant="outline">
                    {status || 'Unknown'}
                </Badge>
            );
        }
    };

    const handleRefresh = () => {
        fetchInspections();
    };

    const handleOpenInWorkPRO = (inspection) => {
        if (inspection?.id && project?.id) {
            // Construct URL to open inspection in WorkPRO (adjust URL structure as needed)
            const workPROUrl = `https://app.base44.com/apps/${WORKPRO_APP_ID}/inspection/${inspection.id}`;
            window.open(workPROUrl, '_blank');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Digital Inspections</DialogTitle>
                    <DialogDescription>
                        Digital inspections for Work Order #{workOrder?.wo_number} 
                        {project && ` (WorkPRO Project: ${project.name || project.id})`}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 max-h-96 overflow-y-auto">
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <span className="text-red-700">{error}</span>
                        </div>
                    ) : inspections.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg font-medium mb-2">No Digital Inspections Found</p>
                            <p>No inspections have been created for this work order yet.</p>
                            <p className="text-sm mt-2">Inspections will appear here when created through the WorkPRO platform.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {inspections.map((inspection) => (
                                <Card key={inspection.id} className="hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <FileText className="w-5 h-5" />
                                                    {inspection.inspection_name || inspection.title || `Inspection #${inspection.id}`}
                                                </CardTitle>
                                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                                    {inspection.inspection_date && (
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            {format(new Date(inspection.inspection_date), 'MMM d, yyyy')}
                                                        </div>
                                                    )}
                                                    {inspection.inspector_name && (
                                                        <div className="flex items-center gap-1">
                                                            <User className="w-4 h-4" />
                                                            {inspection.inspector_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(inspection.status)}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOpenInWorkPRO(inspection)}
                                                >
                                                    <ExternalLink className="w-4 h-4 mr-1" />
                                                    Open
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    {(inspection.description || inspection.notes) && (
                                        <CardContent className="pt-0">
                                            <p className="text-gray-700 text-sm">
                                                {inspection.description || inspection.notes}
                                            </p>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between">
                    <div className="flex items-center text-sm text-gray-500">
                        {inspections.length > 0 && (
                            <span>{inspections.length} inspection{inspections.length !== 1 ? 's' : ''} found</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}