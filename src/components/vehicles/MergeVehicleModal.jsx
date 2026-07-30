import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function MergeVehicleModal({ open, onClose, onMergeComplete, masterVehicle }) {
  const [step, setStep] = useState(1); // 1: Select Duplicate, 2: Confirm
  const [duplicateVehicle, setDuplicateVehicle] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setStep(1);
      setDuplicateVehicle(null);
      setSearchTerm("");
      setSearchResults([]);
    }
  }, [open, masterVehicle]);

  // Search vehicles
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await base44.functions.invoke('searchVehicles', {
          searchTerm: searchTerm,
          limit: 10,
          page: 1,
          includeInactive: true
        });
        
        if (response?.data?.vehicles) {
          // Filter out the master vehicle from results, and only keep vehicles from the SAME customer
          setSearchResults(response.data.vehicles.filter(v => 
            v.id !== masterVehicle?.id && 
            v.customer_id === masterVehicle?.customer_id
          ));
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, masterVehicle]);

  const handleSelect = (vehicle) => {
    setDuplicateVehicle(vehicle);
    setStep(2);
  };

  const handleMerge = async () => {
    if (!masterVehicle || !duplicateVehicle) return;

    setMerging(true);
    try {
      const response = await base44.functions.invoke('mergeVehicles', {
        masterId: masterVehicle.id,
        duplicateId: duplicateVehicle.id
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      alert("Merge completed successfully!");
      if (onMergeComplete) onMergeComplete();
      onClose();
    } catch (error) {
      console.error("Merge failed:", error);
      alert(`Merge failed: ${error.message}`);
    } finally {
      setMerging(false);
    }
  };

  const getVehicleName = (v) => {
    if (!v) return '';
    return `${v.year} ${v.make} ${v.model}`;
  };

  const renderVehicleCard = (vehicle, type) => (
    <div className={`p-4 rounded-lg border ${type === 'master' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'} dark:text-slate-200`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${type === 'master' ? 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
          {type === 'master' ? 'MASTER (Keep & Update)' : 'DUPLICATE (Merge & Deactivate)'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-bold text-lg text-slate-900 dark:text-slate-100">{getVehicleName(vehicle)}</div>
        <div className="text-sm text-gray-600 dark:text-slate-400">VIN: {vehicle.vin || 'N/A'}</div>
        <div className="text-sm text-gray-600 dark:text-slate-400">Plate: {vehicle.license_plate || 'N/A'}</div>
        <div className="text-xs text-gray-400 dark:text-slate-500 mt-2">ID: {vehicle.id}</div>
        
        <div className="mt-2 pt-2 border-t border-gray-200/50 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 dark:text-slate-400">Mileage:</span>
            <div className="font-medium">{vehicle.mileage || 0}</div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">Odo Date:</span>
            <div className="font-medium">{vehicle.odometer_date || 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Merge Vehicles</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-md border border-blue-200 dark:border-blue-800 text-sm mb-4 text-slate-800 dark:text-slate-200">
              <span className="font-bold">Master Vehicle:</span> {getVehicleName(masterVehicle)}
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Search for the vehicle you want to merge INTO this master vehicle. Only vehicles belonging to the same customer can be selected.</div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-slate-500 w-4 h-4" />
              <Input
                placeholder="Search for Duplicate Vehicle (VIN, Make, Model, Plate)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                autoFocus
              />
            </div>

            <div className="max-h-60 overflow-y-auto border dark:border-slate-800 rounded-md">
              {searching ? (
                <div className="p-4 text-center text-gray-500 dark:text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="divide-y dark:divide-slate-850">
                  {searchResults.map(vehicle => (
                    <div 
                      key={vehicle.id} 
                      className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 cursor-pointer flex justify-between items-center"
                      onClick={() => handleSelect(vehicle)}
                    >
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{getVehicleName(vehicle)}</div>
                        <div className="text-sm text-gray-500 dark:text-slate-400">
                          VIN: {vehicle.vin} • Customer: {vehicle.customer_name || 'Unknown'}
                        </div>
                        {vehicle.license_plate && (
                           <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Plate: {vehicle.license_plate}</div>
                        )}
                      </div>
                      <div className="text-right text-sm text-gray-400 dark:text-slate-500">
                        {vehicle.unit_number ? `Unit: ${vehicle.unit_number}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="p-4 text-center text-gray-500 dark:text-slate-400">No vehicles found</div>
              ) : (
                <div className="p-4 text-center text-gray-400 dark:text-slate-500">Type at least 2 characters to search</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-500 dark:text-yellow-400 mr-2" />
                <div>
                  <p className="font-bold text-yellow-700 dark:text-yellow-400">Warning: This action cannot be undone</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                    Merging will move all Work Orders and Appointments from the Duplicate to the Master vehicle.
                    <br />
                    The Duplicate vehicle will be marked inactive.
                    <br />
                    Empty fields on Master will be filled from Duplicate.
                    <br />
                    <strong>Highest mileage</strong> and <strong>latest odometer date</strong> will be kept.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
              {renderVehicleCard(duplicateVehicle, 'duplicate')}
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-slate-500" />
              {renderVehicleCard(masterVehicle, 'master')}
            </div>

            {/* Preview of Logic Logic */}
            <div className="bg-gray-50 dark:bg-slate-800/40 p-3 rounded text-sm grid grid-cols-2 gap-4">
                <div>
                    <span className="text-gray-500 dark:text-slate-400 block">New Mileage</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                        {Math.max(parseFloat(masterVehicle.mileage || 0), parseFloat(duplicateVehicle.mileage || 0))}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500 dark:text-slate-400 block">New Odometer Date</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                         {
                            new Date(masterVehicle.odometer_date || 0) > new Date(duplicateVehicle.odometer_date || 0) 
                            ? (masterVehicle.odometer_date || 'N/A') 
                            : (duplicateVehicle.odometer_date || 'N/A')
                         }
                    </span>
                </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">Back</Button>
              <Button 
                onClick={handleMerge} 
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                disabled={merging}
              >
                {merging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirm Merge
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose} className="dark:text-slate-400 dark:hover:text-slate-100">Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}