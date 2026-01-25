import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

export default function ROApprovalsModal({ open, onClose, workOrderId, onStatusSync, onRefreshComplete }) {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchApprovals = useCallback(async () => {
        if (!workOrderId) {
            setError("Work Order ID is missing. Cannot fetch approvals.");
            setApprovals([]);
            return;
        }

        setLoading(true);
        setError(null);
        
        try {
            console.log(`Fetching approvals for work_order_id: ${workOrderId}`);
            
            // Fetch approvals from Customer Portal via proxy
            const response = await base44.functions.invoke('getPortalApprovals', { work_order_id: workOrderId });
            
            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to fetch approvals from portal');
            }
            
            const records = response.data.data;
            
            console.log('Fetched approvals:', records);
            setApprovals(records);

            // Update work order approval status based on latest approval
            if (onStatusSync && typeof onStatusSync === 'function') {
                if (records.length > 0) {
                    const latestApproval = records[0];
                    const newStatus = latestApproval.type?.toLowerCase() === 'approved' ? 'approved' : 'skip_deny';
                    onStatusSync(newStatus);
                } else {
                    onStatusSync('pending');
                }
            }

            // Notify parent that refresh is complete
            if (onRefreshComplete) {
                onRefreshComplete();
            }

        } catch (err) {
            console.error('Error fetching approvals:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [workOrderId, onStatusSync, onRefreshComplete]);

    // Only fetch when modal opens, not when dependencies change
    useEffect(() => {
        if (open && workOrderId) {
            fetchApprovals();
        }
    }, [open, workOrderId, fetchApprovals]);

    const getStatusBadge = (type) => {
        const isApproved = type?.toLowerCase() === 'approved';
        const isDenied = type?.toLowerCase() === 'denied';
        
        return (
            <Badge 
                variant={isApproved ? 'default' : isDenied ? 'destructive' : 'outline'} 
                className={isApproved ? 'bg-green-600' : isDenied ? 'bg-red-600' : 'bg-yellow-600'}
            >
                {isApproved ? <CheckCircle2 className="w-4 h-4 mr-1" /> : 
                 isDenied ? <XCircle className="w-4 h-4 mr-1" /> : 
                 <AlertCircle className="w-4 h-4 mr-1" />}
                {type || 'Unknown'}
            </Badge>
        );
    };

    const handleRefresh = () => {
        fetchApprovals();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Customer Approvals</DialogTitle>
                    <DialogDescription>
                        This log shows all approval decisions made by the customer for this work order.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <span className="text-red-700">{error}</span>
                        </div>
                    ) : approvals.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No approval decisions found for this work order.</p>
                            <p className="text-sm mt-2">Approvals will appear here when customers respond via the portal.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                            {approvals.map((approval, index) => (
                                <div key={approval.id || index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            {getStatusBadge(approval.type)}
                                            <span className="font-semibold">{approval.customer_name || 'Customer'}</span>
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {approval.date_approved ? format(new Date(approval.date_approved), 'MMM d, yyyy') : 
                                             approval.created_date ? format(new Date(approval.created_date), 'MMM d, yyyy') : 'No date'}
                                        </div>
                                    </div>
                                    
                                    {approval.approval_amount && (
                                        <div className="text-sm text-gray-600 mb-1">
                                            Amount: <span className="font-medium">${approval.approval_amount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    
                                    {approval.method_approved && (
                                        <div className="text-sm text-gray-600 mb-1">
                                            Method: <span className="font-medium">{approval.method_approved}</span>
                                        </div>
                                    )}
                                    
                                    {approval.customer_comments && (
                                        <div className="text-sm text-gray-700 mt-2 p-2 bg-white rounded border">
                                            <strong>Comments:</strong> {approval.customer_comments}
                                        </div>
                                    )}
                                    
                                    {approval.customer_email && (
                                        <div className="text-xs text-gray-500 mt-2">
                                            Email: {approval.customer_email}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}