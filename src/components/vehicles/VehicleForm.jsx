import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X, Car, Loader2, Merge, Search, Check } from "lucide-react";
import { base44 } from '@/api/base44Client'; // Added base44 import
import MergeVehicleModal from './MergeVehicleModal';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function VehicleForm({ vehicle, customers, onSubmit, onCancel, isSubmitting }) {
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: vehicle?.customer_id || "",
    year: vehicle?.year || "",
    make: vehicle?.make || "",
    model: vehicle?.model || "",
    trim: vehicle?.trim || "", // Added trim field
    vin: vehicle?.vin || "",
    license_plate: vehicle?.license_plate || "",
    unit_number: vehicle?.unit_number || "",
    color: vehicle?.color || "",
    engine: vehicle?.engine || "",
    mileage: vehicle?.mileage || "",
    notes: vehicle?.notes || "",
    is_active: vehicle?.is_active !== undefined ? vehicle.is_active : true
  });
  const [decoding, setDecoding] = useState(false); // Renamed from isDecodingVin
  const prevVehicleRef = useRef(vehicle);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  const getCustomerDisplayName = (customer) => {
    if (!customer) return "";
    const org = customer.org_name?.trim();
    const first = customer.first_name?.trim() || "";
    const last = customer.last_name?.trim() || "";
    const name = `${first} ${last}`.trim();
    if (org) {
      return name ? `${org} (${name})` : org;
    }
    return name;
  };

  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    if (formData.customer_id) {
      const c = localCustomers.find(c => c.id === formData.customer_id) || customers?.find(c => c.id === formData.customer_id);
      if (c) {
        if (!localCustomers.some(lc => lc.id === c.id)) {
          setLocalCustomers(prev => [...prev, c]);
        }
        setCustomerSearchTerm(getCustomerDisplayName(c));
      }
    } else {
      setCustomerSearchTerm("");
    }
  }, [formData.customer_id, customers]);

  useEffect(() => {
    if (!customerSearchOpen) {
      if (!customerSearchTerm && customers && customers.length > 0) {
        setLocalCustomers(customers);
      }
      return;
    }
    
    let isMounted = true;
    const searchDb = async () => {
      setLoadingCustomers(true);
      try {
        const response = await base44.functions.invoke('searchCustomers', { 
          searchTerm: customerSearchTerm,
          includeInactive: false 
        });
        if (response.data.success && isMounted) {
          setLocalCustomers(response.data.customers || []);
        }
      } catch (error) {
        console.error("Failed to search customers:", error);
      } finally {
        if (isMounted) setLoadingCustomers(false);
      }
    };
    
    const timeoutId = setTimeout(() => {
      searchDb();
    }, 400);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [customerSearchTerm, customerSearchOpen, customers]);

  const filteredCustomers = localCustomers || [];

  useEffect(() => {
    if (vehicle) {
        // Deep compare (via JSON stringify) to prevent resetting form on reference change
        // when the content hasn't actually changed.
        const prevVehicleStr = prevVehicleRef.current ? JSON.stringify(prevVehicleRef.current) : '';
        const currVehicleStr = JSON.stringify(vehicle);

        if (prevVehicleStr !== currVehicleStr) {
            setFormData({
                customer_id: vehicle.customer_id || "",
                year: vehicle.year || "",
                make: vehicle.make || "",
                model: vehicle.model || "",
                trim: vehicle.trim || "", // Initialize trim from vehicle prop
                vin: vehicle.vin || "",
                license_plate: vehicle.license_plate || "",
                unit_number: vehicle.unit_number || "",
                color: vehicle.color || "",
                engine: vehicle.engine || "",
                mileage: vehicle.mileage || "",
                notes: vehicle.notes || "",
                is_active: vehicle.is_active !== undefined ? vehicle.is_active : true
            });
            prevVehicleRef.current = vehicle;
        }
    }
  }, [vehicle]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'vin' ? value.toUpperCase() : value
    }));
  };

  const handleVinDecode = async () => { // Renamed from handleDecodeVin
    if (!formData.vin || formData.vin.length < 11) {
      alert("Please enter a valid VIN (at least 11 characters).");
      return;
    }
    
    setDecoding(true); // Changed from setIsDecodingVin
    try {
      // Replaced decodeVin function call with base44.functions.invoke
      // Assuming 'base44' is an available global or imported object/library as per the outline
      const response = await base44.functions.invoke('decodeVin', { vin: formData.vin });
      
      if (response.data.error) {
        alert(response.data.error);
      } else {
        setFormData(prev => ({
          ...prev,
          year: response.data.year || prev.year,
          make: response.data.make || prev.make,
          model: response.data.model || prev.model,
          trim: response.data.trim || prev.trim, // Update trim from decoded data
          engine: response.data.engine || prev.engine,
        }));
      }

    } catch (err) {
      console.error("Error decoding VIN:", err);
      alert("Failed to decode VIN. Please try again.");
    } finally {
      setDecoding(false); // Changed from setIsDecodingVin
    }
  };

  const handleMergeComplete = () => {
    if (onCancel) onCancel();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.customer_id || !formData.year || !formData.make || !formData.model) {
      alert("Please fill in all required fields (Customer, Year, Make, Model).");
      return;
    }

    const submissionData = {
      ...formData,
      vin: formData.vin ? formData.vin.toUpperCase() : "",
      year: formData.year ? parseInt(formData.year) : null,
      mileage: formData.mileage ? parseFloat(formData.mileage) : null
    };

    onSubmit(submissionData);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="w-5 h-5" />
          {vehicle?.id ? 'Edit Vehicle' : 'New Vehicle'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catch autofocus on modal open to prevent the customer search popover from opening automatically */}
          <div tabIndex={0} className="w-0 h-0 p-0 m-0 opacity-0 focus:outline-none pointer-events-none" aria-hidden="true" />
          <div className="space-y-2">
            <Label htmlFor="customer_id">Customer *</Label>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search or select a customer..."
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      if (formData.customer_id) handleChange('customer_id', ""); // Clear ID if they start typing
                      setCustomerSearchOpen(true);
                    }}
                    onFocus={() => setCustomerSearchOpen(true)}
                    className="pl-9"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[400px] max-w-[90vw]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="max-h-[300px] overflow-y-auto p-1 bg-white">
                  {loadingCustomers ? (
                    <div className="py-6 text-center text-sm text-slate-500">
                      Searching...
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-500">
                      No customers found.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          onClick={() => {
                            handleChange('customer_id', customer.id);
                            setCustomerSearchTerm(getCustomerDisplayName(customer));
                            setCustomerSearchOpen(false);
                          }}
                          className="flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-slate-100 cursor-pointer border-b border-slate-50 last:border-0"
                        >
                          <span className="font-medium text-slate-900">{getCustomerDisplayName(customer)}</span>
                          {formData.customer_id === customer.id && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) => handleChange('year', e.target.value)}
                min="1900"
                max={new Date().getFullYear() + 1}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">Make *</Label>
              <Input
                id="make"
                value={formData.make}
                onChange={(e) => handleChange('make', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="vin">VIN</Label>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    id="vin"
                    value={formData.vin}
                    onChange={(e) => handleChange('vin', e.target.value)}
                    maxLength="17"
                    className="font-mono uppercase"
                  />
                  <div className="font-mono text-sm text-slate-400 px-3 mt-0.5 select-none pointer-events-none whitespace-pre overflow-hidden">
                    {'       * *      *'}
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={handleVinDecode} disabled={decoding}> {/* Changed onClick and disabled prop */}
                  {decoding ? ( // Changed condition
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Decode"
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="license_plate">License Plate</Label>
              <Input
                id="license_plate"
                value={formData.license_plate}
                onChange={(e) => handleChange('license_plate', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit_number">Unit Number</Label>
              <Input
                id="unit_number"
                value={formData.unit_number}
                onChange={(e) => handleChange('unit_number', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
              <Input
                id="mileage"
                type="number"
                value={formData.mileage}
                onChange={(e) => handleChange('mileage', e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* New row for Engine and Trim */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="engine">Engine</Label>
              <Input
                id="engine"
                value={formData.engine}
                onChange={(e) => handleChange('engine', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trim">Trim</Label>
              <Input
                id="trim"
                value={formData.trim}
                onChange={(e) => handleChange('trim', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange('is_active', checked)}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Active
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            {vehicle?.id && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowMergeModal(true)}
                className="mr-auto"
              >
                <Merge className="w-4 h-4 mr-2" />
                Merge
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {vehicle?.id ? 'Update' : 'Create'} Vehicle
            </Button>
          </div>

          {vehicle?.id && (
            <MergeVehicleModal 
              open={showMergeModal} 
              onClose={() => setShowMergeModal(false)}
              masterVehicle={vehicle}
              onMergeComplete={handleMergeComplete}
            />
          )}
        </form>
      </CardContent>
    </Card>
  );
}