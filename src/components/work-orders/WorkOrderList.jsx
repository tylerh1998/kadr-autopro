import React, { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { 
  Car, 
  Calendar, 
  Clock,
  DollarSign,
  ChevronRight,
  FileText,
  Lock
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const StatusBadge = ({ status }) => {
  const colors = {
    "Open": "bg-blue-100 text-blue-800 border-blue-200",
    "Parts On Order": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Scheduled": "bg-purple-100 text-purple-800 border-purple-200",
    "On Hold": "bg-gray-100 text-gray-800 border-gray-200",
    "Completed": "bg-green-100 text-green-800 border-green-200",
  };
  
  return (
    <Badge className={`${colors[status] || colors['On Hold']} border font-medium`}>
      {status}
    </Badge>
  );
};

function WorkOrderList({ 
  workOrders, 
  customers, 
  vehicles, 
  loading, 
  onSelect,
  onEdit,   
  onStatusUpdate
}) {
  // Helper function to get customer display name
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return 'Customer Not Found';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
  };

  const handleEditClick = (workOrder) => {
    const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
    const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
    window.open(url, '_blank', windowFeatures);
  };

  const getStageDate = (workOrder) => {
    if (workOrder.stage === 'estimate' && workOrder.est_date) {
      return { label: 'Est', date: workOrder.est_date };
    } else if (workOrder.stage === 'work_order' && workOrder.wo_date) {
      return { label: 'WO', date: workOrder.wo_date };
    } else if (workOrder.stage === 'invoice' && workOrder.invoice_date) {
      return { label: 'Inv', date: workOrder.invoice_date };
    } else if (workOrder.completed_date) {
      return { label: 'Completed', date: workOrder.completed_date };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array(5).fill(0).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full max-w-md" />
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (workOrders.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <div className="text-slate-400 mb-4">
            <Clock className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Work Orders Found</h3>
          <p className="text-slate-600 mb-4">No work orders match your current filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {workOrders.map((workOrder) => {
          const customer = customers.find(c => c.id === workOrder.customer_id);
          const vehicle = vehicles.find(v => v.id === workOrder.vehicle_id);
          
          const displayNumber = workOrder.stage === 'estimate' ? workOrder.est_number :
                              workOrder.stage === 'invoice' ? workOrder.inv_number :
                              workOrder.wo_number;
          
          const isLocked = workOrder.LockedByUser && workOrder.LockedByUser.trim() !== '';
          const stageDate = getStageDate(workOrder);
          
          return (
            <Card 
              key={workOrder.id} 
              className="hover:shadow-lg transition-all duration-200 cursor-pointer"
              onClick={() => handleEditClick(workOrder)}
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-slate-900">
                        {getCustomerName(workOrder.customer_id)}
                      </h3>
                      <StatusBadge status={workOrder.status} />
                      
                      {isLocked && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 flex items-center gap-1 cursor-help">
                                <Lock className="w-3 h-3" />
                                Locked
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-slate-900 text-white">
                            <p className="text-sm">
                              Locked by: <span className="font-semibold">{workOrder.LockedByUser}</span>
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    <p className="text-slate-600 line-clamp-2">{workOrder.description}</p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        <span>{displayNumber || `RO ${workOrder.ro_number}`}</span>
                      </div>

                      {vehicle && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Car className="w-4 h-4" />
                            <span>{vehicle.year} {vehicle.make} {vehicle.model}</span>
                          </div>
                          {stageDate && stageDate.date && !isNaN(new Date(stageDate.date).getTime()) && (
                            <span className="text-slate-400">
                              • {stageDate.label}: {format(new Date(stageDate.date), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {workOrder.scheduled_date && !isNaN(new Date(workOrder.scheduled_date).getTime()) && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>Sched: {format(new Date(workOrder.scheduled_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      
                      {workOrder.technician && (
                        <div className="flex items-center gap-1">
                          <span>Tech: {workOrder.technician}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-lg font-bold text-slate-900">
                        <DollarSign className="w-4 h-4" />
                        {(workOrder.total_amount || 0).toFixed(2)}
                      </div>
                      {workOrder.estimated_hours && (
                        <div className="text-sm text-slate-500">
                          {workOrder.estimated_hours}h estimated
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// Memoize to prevent re-renders when props haven't changed
export default memo(WorkOrderList);