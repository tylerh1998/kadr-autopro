
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { WorkOrder, Vehicle } from '@/entities/all';
import { format } from 'date-fns';

export default function OdometerPromptModal({ open, onClose, onSubmit, workOrder, workPROProject, mode = 'invoiceConversion', vehicle }) {
  const [odometer, setOdometer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && workOrder) {
      // Pre-fill with existing odometer reading if available
      const existingOdometer = workOrder.odometer;
      if (existingOdometer !== null && existingOdometer !== undefined) {
        setOdometer(existingOdometer.toString());
      } else {
        setOdometer('');
      }
    }
  }, [open, workOrder]);

  const handlePullFromWorkPRO = () => {
    // Pull odometer reading from WorkPRO project if available
    if (workPROProject?.odometer_reading) {
      setOdometer(workPROProject.odometer_reading.toString());
    }
  };

  const handleContinue = async () => {
    // Validate odometer input: if provided, must be a valid number
    if (odometer.trim() && isNaN(Number(odometer.trim()))) {
      alert('Please enter a valid number for the odometer reading.');
      return;
    }
    
    setIsLoading(true);
    try {
      // Submit the odometer value as a number if provided, null if empty
      const odometerValue = odometer.trim() ? Number(odometer.trim()) : null;
      
      // Update WorkOrder entity
      if (workOrder && workOrder.id) {
        await WorkOrder.update(workOrder.id, { odometer: odometerValue });
      }
      
      // Update Vehicle entity with mileage and odometer_date
      if (odometerValue !== null && workOrder && workOrder.vehicle_id) {
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        await Vehicle.update(workOrder.vehicle_id, {
          mileage: odometerValue,
          odometer_date: currentDate
        });
      }
      
      await onSubmit({ odometer: odometerValue });
    } catch (error) {
      console.error('Error submitting odometer:', error);
      alert('Error saving odometer reading. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSkip = async () => {
    setIsLoading(true);
    try {
      // Skip odometer - submit null value, no vehicle update
      if (workOrder && workOrder.id) {
        await WorkOrder.update(workOrder.id, { odometer: null });
      }
      
      await onSubmit({ odometer: null });
    } catch (error) {
      console.error('Error skipping odometer:', error);
      alert('Error during skip. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasWorkPROOdometer = workPROProject?.odometer_reading !== null && 
                              workPROProject?.odometer_reading !== undefined && 
                              workPROProject?.odometer_reading !== '';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Odometer Reading</DialogTitle>
          <DialogDescription>
            Confirm or enter the vehicle's current odometer reading. This step is optional and can be skipped for trailers, counter sales, or when odometer is unavailable.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {vehicle?.mileage && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
              <p className="text-sm font-medium text-slate-700 mb-1">Previous Odometer Recording</p>
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-slate-900">{vehicle.mileage.toLocaleString()}</span>
                {vehicle.odometer_date && (
                  <span className="text-sm text-slate-600">
                    {format(new Date(vehicle.odometer_date), 'MMM d, yyyy')}
                  </span>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="odometer">Odometer Reading</Label>
            <div className="flex items-center gap-2">
              <Input
                id="odometer"
                type="number"
                placeholder="e.g., 150000"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handlePullFromWorkPRO}
                disabled={!hasWorkPROOdometer || isLoading}
                title={hasWorkPROOdometer ? 
                  `Pull odometer reading from WorkPRO: ${workPROProject.odometer_reading}` : 
                  'No odometer reading available in WorkPRO'
                }
              >
                Pull from WorkPRO
              </Button>
            </div>
            {hasWorkPROOdometer && (
              <p className="text-sm text-muted-foreground">
                WorkPRO has odometer reading: {workPROProject.odometer_reading}
              </p>
            )}
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          {mode === 'invoiceConversion' && (
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel Conversion
            </Button>
          )}
          {mode === 'invoiceConversion' && (
            <Button variant="secondary" onClick={handleSkip} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip"}
            </Button>
          )}
          <Button onClick={handleContinue} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'simpleUpdate' ? "Save Odometer" : "Continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
