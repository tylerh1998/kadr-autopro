import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from '@/lib/supabase';
import { Car, History } from 'lucide-react';
import VehicleHistoryModal from '../vehicles/VehicleHistoryModal';

export default function CustomerHistoryModal({ open, onClose, customer, onOpenCustomerHistory }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    if (open && customer?.id) {
      const fetchVehicles = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('Vehicle')
            .select('*')
            .eq('customer_id', customer.id);
          if (error) throw error;
          setVehicles(data || []);
        } catch (error) {
          console.error("Failed to fetch customer vehicles:", error);
          alert("Could not load customer vehicles.");
        } finally {
          setLoading(false);
        }
      };
      fetchVehicles();
    }
  }, [open, customer]);

  const handleVehicleClick = (vehicle) => {
    setSelectedVehicle(vehicle);
    setIsHistoryModalOpen(true);
  };
  
  const handleCloseHistoryModal = () => {
    setIsHistoryModalOpen(false);
    setSelectedVehicle(null);
  }

  const handleVehicleUpdated = (updatedVehicle) => {
    setVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
  };

  const filteredVehicles = includeInactive 
    ? vehicles 
    : vehicles.filter(v => v.is_active !== false && String(v.is_active).toLowerCase() !== 'false');

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-xl no-print">
          <DialogHeader>
            <div className="flex justify-between items-center pr-8">
              <div>
                <DialogTitle>Vehicles for {customer?.first_name} {customer?.last_name}</DialogTitle>
                <DialogDescription>Select a vehicle to view its service history.</DialogDescription>
              </div>
              <button
                type="button"
                onClick={onOpenCustomerHistory}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <History className="w-4 h-4 mr-2" />
                Customer History
              </button>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="includeInactiveVehicles" 
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              <Label htmlFor="includeInactiveVehicles" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-700 dark:text-slate-300">
                Include Inactive Vehicles
              </Label>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
            {loading ? (
              Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : filteredVehicles.length > 0 ? (
              filteredVehicles.map(v => (
                <div 
                  key={v.id}
                  className="p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => handleVehicleClick(v)}
                >
                  <div className="flex items-center gap-4">
                    <Car className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{v.year} {v.make} {v.model}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{v.vin || 'No VIN'}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-8">No {includeInactive ? '' : 'active '}vehicles found for this customer.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {selectedVehicle && (
        <VehicleHistoryModal
          open={isHistoryModalOpen}
          onClose={handleCloseHistoryModal}
          vehicle={selectedVehicle}
          customer={customer}
          onVehicleUpdated={handleVehicleUpdated}
        />
      )}

    </>
  );
}