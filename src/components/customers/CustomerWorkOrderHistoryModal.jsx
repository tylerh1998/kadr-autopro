import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCustomerWorkOrderHistory } from '@/functions/getCustomerWorkOrderHistory';
import { format } from 'date-fns';
import { FileText, Calendar, DollarSign, Gauge, Car } from 'lucide-react';
import HistoryFilters, { DEFAULT_HISTORY_FILTERS } from '@/components/history/HistoryFilters';
import VehicleHistorySummaryCards from '../vehicles/VehicleHistorySummaryCards';
import CustomerHistoryPrintHeader from './CustomerHistoryPrintHeader';
import { printVehicleHistory } from '../vehicles/vehicleHistoryUtils';

export default function CustomerWorkOrderHistoryModal({ open, onClose, customer, onOpenVehicleHistory }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ ...DEFAULT_HISTORY_FILTERS });

  useEffect(() => {
    if (open && customer?.id) {
      const fetchHistory = async () => {
        setLoading(true);
        try {
          const response = await getCustomerWorkOrderHistory({
            customerId: customer.id,
            daysBack: filters.daysBack,
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            searchTerm: filters.search.trim()
          });

          setHistory(response.data?.workOrders || []);
        } catch (error) {
          console.error("Failed to fetch customer work order history:", error);
          alert("Could not load customer history.");
        } finally {
          setLoading(false);
        }
      };

      fetchHistory();
    }
  }, [open, customer?.id, filters]);

  const getDisplayNumber = (workOrder) => {
    if (workOrder.stage === 'estimate') return workOrder.est_number;
    if (workOrder.stage === 'invoice') return workOrder.inv_number;
    if (workOrder.stage === 'credit_invoice') return workOrder.crinv_number;
    return workOrder.wo_number;
  };

  const getStageLabel = (stage) => {
    switch(stage) {
      case 'estimate': return 'Estimate';
      case 'work_order': return 'Work Order';
      case 'invoice': return 'Invoice';
      case 'credit_invoice': return 'Credit Invoice';
      default: return stage;
    }
  };

  const getStageBadgeColor = (stage) => {
    switch(stage) {
      case 'estimate': return 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      case 'work_order': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'invoice': return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800';
      case 'credit_invoice': return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600';
    }
  };

  const getVehicleLabel = (workOrder) => {
    return [workOrder.vehicle_year, workOrder.vehicle_make, workOrder.vehicle_model].filter(Boolean).join(' ') || 'Vehicle information unavailable';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl vehicle-history-dialog">
        <DialogHeader className="no-print">
          <div className="pr-8">
            <DialogTitle>Customer History for {customer?.org_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()}</DialogTitle>
            <DialogDescription>A list of all previous work orders for this customer.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1 vehicle-history-scroll vehicle-history-content">
          <CustomerHistoryPrintHeader customer={customer} />
          <VehicleHistorySummaryCards
            workOrders={history}
            onEdit={onOpenVehicleHistory}
            onPrint={printVehicleHistory}
            layout="modal"
            primaryActionLabel="Vehicle History"
          />
          <HistoryFilters filters={filters} onApply={setFilters} />
          {loading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
          ) : history.length > 0 ? (
            history.map(wo => (
              <a
                key={wo.id}
                href={wo.isLankar ? `/LankarWOView?woid=${wo.originalWoid}` : `/WorkOrderEdit?id=${wo.ro_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="vehicle-history-entry block p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors text-inherit hover:text-inherit no-underline"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-blue-700 dark:text-blue-400">
                      {getDisplayNumber(wo) || `RO ${wo.ro_number}`}
                    </p>
                    <Badge variant="outline" className={`text-xs border ${getStageBadgeColor(wo.stage)}`}>
                      {getStageLabel(wo.stage)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(wo.scheduled_date || wo.created_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{wo.description}</span>
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 flex items-start gap-2">
                  <Car className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{getVehicleLabel(wo)}</span>
                </p>
                <div className="flex items-center justify-between">
                  {wo.odometer !== undefined && wo.odometer !== null ? (
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                      <Gauge className="w-4 h-4" />
                      {Number(wo.odometer).toLocaleString()} km
                    </div>
                  ) : <div />}
                  {wo.total_amount !== undefined && wo.total_amount !== null && (
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 ml-auto">
                      <DollarSign className="w-4 h-4" />
                      {Number(wo.total_amount).toFixed(2)}
                    </div>
                  )}
                </div>
              </a>
            ))
          ) : (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">No work order history found for this customer.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}