import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { base44 } from '@/api/base44Client';
import { getVehicleWorkOrderHistory } from '@/functions/getVehicleWorkOrderHistory';
import { format } from 'date-fns';
import { FileText, Calendar, DollarSign, Gauge } from 'lucide-react';
import ModalCloseButton from '@/components/ui/modal-close-button';
import VehicleForm from './VehicleForm';
import VehicleHistorySummaryCards from './VehicleHistorySummaryCards';
import VehicleHistoryFilters, { DEFAULT_VEHICLE_HISTORY_FILTERS } from './VehicleHistoryFilters';
import VehicleHistoryPrintHeader from './VehicleHistoryPrintHeader';
import { printVehicleHistory } from './vehicleHistoryUtils';

export default function VehicleHistoryModal({ open, onClose, vehicle, customer, onVehicleUpdated }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState(vehicle);
  const [filters, setFilters] = useState({ ...DEFAULT_VEHICLE_HISTORY_FILTERS });

  useEffect(() => {
    setCurrentVehicle(vehicle);
  }, [vehicle]);

  useEffect(() => {
    if (open && vehicle?.id) {
      const fetchHistory = async () => {
        setLoading(true);
        try {
          const response = await getVehicleWorkOrderHistory({
            vehicleId: vehicle.id,
            daysBack: filters.daysBack,
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            searchTerm: filters.search.trim()
          });
          setHistory(response.data?.workOrders || []);
        } catch (error) {
          console.error("Failed to fetch vehicle history:", error);
          alert("Could not load vehicle history.");
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    }
  }, [open, vehicle?.id, filters]);



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
      case 'estimate': return 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-900/60';
      case 'work_order': return 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-900/60';
      case 'invoice': return 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-900/60';
      case 'credit_invoice': return 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-900/60';
      default: return 'bg-slate-100 dark:bg-slate-900/40 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-800';
    }
  };

  const handleEditClick = async () => {
    try {
      const res = await base44.functions.invoke('SupabaseProxy', { 
        action: 'read', 
        table: 'Customer'
      });
      setCustomers(res.data?.data || []);
      setShowEditVehicle(true);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    }
  };

  const handleUpdateVehicle = async (vehicleData) => {
    setIsSubmitting(true);
    try {
      const response = await base44.functions.invoke('SupabaseProxy', { 
        action: 'update', 
        table: 'Vehicle',
        id: currentVehicle.id,
        data: vehicleData 
      });
      const updated = response.data?.data?.[0];
      if (updated) {
        setCurrentVehicle(updated);
        setShowEditVehicle(false);
        if (onVehicleUpdated) {
          onVehicleUpdated(updated);
        }
      } else {
        throw new Error('Failed to update vehicle');
      }
    } catch (error) {
      console.error("Failed to update vehicle:", error);
      alert("Failed to update vehicle.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl vehicle-history-dialog [&>button:last-child]:hidden dark:bg-slate-950 dark:border-slate-800">
          <ModalCloseButton onClick={onClose} />
          <DialogHeader className="no-print">
            <div className="pr-16">
              <DialogTitle>Work Order History for {currentVehicle?.year} {currentVehicle?.make} {currentVehicle?.model}</DialogTitle>
              <DialogDescription>A list of all previous work orders for this vehicle.</DialogDescription>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1 vehicle-history-scroll vehicle-history-content">
            <VehicleHistoryPrintHeader vehicle={currentVehicle} customer={customer} />
            <VehicleHistorySummaryCards
              workOrders={history}
              onEdit={handleEditClick}
              onPrint={printVehicleHistory}
              layout="modal"
            />
            <VehicleHistoryFilters filters={filters} onApply={setFilters} />
          {loading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : history.length > 0 ? (
            history.map(wo => (
              <a 
                key={wo.id}
                href={wo.isLankar ? `/LankarWOView?woid=${wo.originalWoid}` : `/WorkOrderEdit?id=${wo.ro_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="vehicle-history-entry block p-4 border dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors text-inherit hover:text-inherit no-underline"
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
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{wo.description}</span>
                </p>
                <div className="flex items-center justify-between">
                  {wo.odometer !== undefined && wo.odometer !== null && (
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                      <Gauge className="w-4 h-4" />
                      {wo.odometer.toLocaleString()} km
                    </div>
                  )}
                  {wo.total_amount !== undefined && wo.total_amount !== null && (
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 ml-auto">
                      <DollarSign className="w-4 h-4" />
                      {wo.total_amount.toFixed(2)}
                    </div>
                  )}
                </div>
              </a>
            ))
          ) : (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">No work order history found for this vehicle.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showEditVehicle} onOpenChange={setShowEditVehicle}>
      <DialogContent className="max-w-3xl [&>button:last-child]:hidden dark:bg-slate-950 dark:border-slate-800">
        <ModalCloseButton onClick={() => setShowEditVehicle(false)} />
        <DialogHeader className="pr-16">
          <DialogTitle>Edit Vehicle</DialogTitle>
        </DialogHeader>
        <VehicleForm
          vehicle={currentVehicle}
          customers={customers}
          onSubmit={handleUpdateVehicle}
          onCancel={() => setShowEditVehicle(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}