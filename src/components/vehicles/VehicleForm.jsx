import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X, Car, Loader2, Merge, Search, Check } from "lucide-react";
import { supabase } from '@/lib/supabase';
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
        const term = customerSearchTerm.trim();
        let customersResult;
        if (term) {
          const { data, error } = await supabase.rpc('search_customers_ranked', {
            p_search_term: term,
            p_include_inactive: false,
            p_limit: 50,
            p_offset: 0
          });
          if (error) throw error;
          customersResult = (data || []).map(({ total_count, match_rank, ...item }) => item);
        } else {
          const { data, error } = await supabase
            .from('Customer')
            .select('*')
            .or('is_active.eq.true,is_active.is.null')
            .order('org_name', { ascending: true, nullsLast: true })
            .order('first_name', { ascending: true, nullsLast: true })
            .order('last_name', { ascending: true, nullsLast: true })
            .range(0, 49);
          if (error) throw error;
          customersResult = data || [];
        }
        if (isMounted) {
          setLocalCustomers(customersResult);
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
      const { data: decoded, error: decodeError } = await supabase.functions.invoke('autopro-decodeVin', { body: { vin: formData.vin } });

      if (decodeError) {
        alert(decodeError.message);
      } else if (decoded?.error) {
        alert(decoded.error);
      } else {
        setFormData(prev => ({
          ...prev,
          year: decoded.year || prev.year,
          make: decoded.make || prev.make,
          model: decoded.model || prev.model,
          trim: decoded.trim || prev.trim, // Update trim from decoded data
          engine: decoded.engine || prev.engine,
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
    <Card className="w-full max-w-2xl dark:bg-card border dark:border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-slate-100">
          <Car className="w-5 h-5" />
          {vehicle?.id ? 'Edit Vehicle' : 'New Vehicle'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catch autofocus on modal open to prevent the customer search popover from opening automatically */}
          <div tabIndex={0} className="w-0 h-0 p-0 m-0 opacity-0 focus:outline-none pointer-events-none" aria-hidden="true" />
          <div className="space-y-2">
            <Label htmlFor="customer_id" className="dark:text-slate-300">Customer *</Label>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder="Search or select a customer..."
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      if (formData.customer_id) handleChange('customer_id', ""); // Clear ID if they start typing
                      setCustomerSearchOpen(true);
                    }}
                    onFocus={() => setCustomerSearchOpen(true)}
                    className="pl-9 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[400px] max-w-[90vw] dark:bg-slate-950 dark:border-slate-800" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="max-h-[300px] overflow-y-auto p-1 bg-white dark:bg-slate-950">
                  {loadingCustomers ? (
                    <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      Searching...
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
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
                          className="flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-50 dark:border-slate-900 last:border-0"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{getCustomerDisplayName(customer)}</span>
                          {formData.customer_id === customer.id && (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
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
              <Label htmlFor="year" className="dark:text-slate-300">Year *</Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) => handleChange('year', e.target.value)}
                min="1900"
                max={new Date().getFullYear() + 1}
                required
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make" className="dark:text-slate-300">Make *</Label>
              <Input
                id="make"
                value={formData.make}
                onChange={(e) => handleChange('make', e.target.value)}
                required
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model" className="dark:text-slate-300">Model *</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                required
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="vin" className="dark:text-slate-300">VIN</Label>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    id="vin"
                    value={formData.vin}
                    onChange={(e) => handleChange('vin', e.target.value)}
                    maxLength="17"
                    className="font-mono uppercase dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  />
                  <div className="font-mono text-sm text-slate-400 dark:text-slate-500 px-3 mt-0.5 select-none pointer-events-none whitespace-pre overflow-hidden">
                    {'       * *      *'}
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={handleVinDecode} disabled={decoding} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"> {/* Changed onClick and disabled prop */}
                  {decoding ? ( // Changed condition
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Decode"
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="license_plate" className="dark:text-slate-300">License Plate</Label>
              <Input
                id="license_plate"
                value={formData.license_plate}
                onChange={(e) => handleChange('license_plate', e.target.value)}
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit_number" className="dark:text-slate-300">Unit Number</Label>
              <Input
                id="unit_number"
                value={formData.unit_number}
                onChange={(e) => handleChange('unit_number', e.target.value)}
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color" className="dark:text-slate-300">Color</Label>
              <Input
                id="color"
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage" className="dark:text-slate-300">Mileage</Label>
              <Input
                id="mileage"
                type="number"
                value={formData.mileage}
                onChange={(e) => handleChange('mileage', e.target.value)}
                min="0"
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* New row for Engine and Trim */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="engine" className="dark:text-slate-300">Engine</Label>
              <Input
                id="engine"
                value={formData.engine}
                onChange={(e) => handleChange('engine', e.target.value)}
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trim" className="dark:text-slate-300">Trim</Label>
              <Input
                id="trim"
                value={formData.trim}
                onChange={(e) => handleChange('trim', e.target.value)}
                className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="dark:text-slate-300">
              Notes <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(this field crosses over to WorkPRO's Vehicle Notes field)</span>
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange('is_active', checked)}
            />
            <Label htmlFor="is_active" className="cursor-pointer dark:text-slate-300">
              Active
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            {vehicle?.id && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowMergeModal(true)}
                className="mr-auto dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Merge className="w-4 h-4 mr-2" />
                Merge
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white">
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