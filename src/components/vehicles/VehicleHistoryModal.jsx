import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkOrder, Vehicle, Customer } from '@/entities/all';
import { Skeleton } from "@/components/ui/skeleton";
import { format } from 'date-fns';
import { FileText, Calendar, DollarSign, Gauge, Edit } from 'lucide-react';
import VehicleForm from './VehicleForm';

export default function VehicleHistoryModal({ open, onClose, vehicle, onVehicleUpdated }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState(vehicle);

  useEffect(() => {
    setCurrentVehicle(vehicle);
  }, [vehicle]);

  useEffect(() => {
    if (open && vehicle?.id) {
      const fetchHistory = async () => {
        setLoading(true);
        try {
          const workOrders = await WorkOrder.filter({ vehicle_id: vehicle.id }, '-created_date');
          setHistory(workOrders);
        } catch (error) {
          console.error("Failed to fetch vehicle history:", error);
          alert("Could not load vehicle history.");
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    }
  }, [open, vehicle]);

  const handleWorkOrderClick = (workOrder) => {
    const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
    window.open(url, '_blank');
  };

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
      case 'estimate': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'work_order': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'invoice': return 'bg-green-100 text-green-800 border-green-300';
      case 'credit_invoice': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const handleEditClick = async () => {
    try {
      const customerList = await Customer.list();
      setCustomers(customerList);
      setShowEditVehicle(true);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    }
  };

  const handleUpdateVehicle = async (vehicleData) => {
    setIsSubmitting(true);
    try {
      await Vehicle.update(currentVehicle.id, vehicleData);
      const updated = await Vehicle.get(currentVehicle.id);
      setCurrentVehicle(updated);
      setShowEditVehicle(false);
      if (onVehicleUpdated) {
        onVehicleUpdated(updated);
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex justify-between items-center pr-8">
              <div>
                <DialogTitle>Work Order History for {currentVehicle?.year} {currentVehicle?.make} {currentVehicle?.model}</DialogTitle>
                <DialogDescription>A list of all previous work orders for this vehicle.</DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleEditClick}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Vehicle
              </Button>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
          {loading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : history.length > 0 ? (
            history.map(wo => (
              <div 
                key={wo.id}
                className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleWorkOrderClick(wo)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-blue-700">
                      {getDisplayNumber(wo) || `RO ${wo.ro_number}`}
                    </p>
                    <Badge variant="outline" className={`text-xs border ${getStageBadgeColor(wo.stage)}`}>
                      {getStageLabel(wo.stage)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(wo.scheduled_date || wo.created_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <p className="text-sm text-slate-600 mb-2 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{wo.description}</span>
                </p>
                <div className="flex items-center justify-between">
                  {wo.odometer !== undefined && wo.odometer !== null && (
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Gauge className="w-4 h-4" />
                      {wo.odometer.toLocaleString()} km
                    </div>
                  )}
                  {wo.total_amount !== undefined && wo.total_amount !== null && (
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-700 ml-auto">
                      <DollarSign className="w-4 h-4" />
                      {wo.total_amount.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-slate-500 py-8">No work order history found for this vehicle.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showEditVehicle} onOpenChange={setShowEditVehicle}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
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