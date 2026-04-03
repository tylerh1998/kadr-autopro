import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, User, Car, Phone, Mail, Plus } from "lucide-react";
import { Customer, Vehicle, SystemSettings } from "@/entities/all"; // Added SystemSettings
import { base44 } from "@/api/base44Client";
import CustomerForm from "../customers/CustomerForm";
import VehicleForm from "../vehicles/VehicleForm";
import { format } from "date-fns";

export default function NewWorkOrderModal({
  open,
  onClose,
  onCreateWorkOrder
}) {
  const [localCustomers, setLocalCustomers] = useState([]);
  const [localVehicles, setLocalVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [step, setStep] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasOpenWO, setHasOpenWO] = useState(false);
  const searchInputRef = React.useRef(null);

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const vehiclesData = await Vehicle.list();
          setLocalVehicles(vehiclesData || []);
          
          // Do not load customers initially, let the user search
          setLocalCustomers([]);
        } catch (error) {
          console.error("Failed to fetch customers and vehicles:", error);
          setLocalCustomers([]);
          setLocalVehicles([]);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
      
      // Focus search input when modal opens
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    // Reload customers when search term or includeInactive changes
    if (open && activeSearchTerm) {
      const searchCustomers = async () => {
        setLoading(true);
        try {
          const response = await base44.functions.invoke('searchCustomers', { 
            searchTerm: activeSearchTerm,
            includeInactive 
          });
          if (response.data.success) {
            setLocalCustomers(response.data.customers || []);
          }
        } catch (error) {
          console.error("Failed to search customers:", error);
        } finally {
          setLoading(false);
        }
      };
      searchCustomers();
    } else if (open && !activeSearchTerm) {
      setLocalCustomers([]);
    }
  }, [activeSearchTerm, includeInactive, open]);

  // Customers are now filtered by the backend function
  // Only show if there's an active search term
  const filteredCustomers = activeSearchTerm ? (localCustomers || []) : [];

  const customerVehicles = (localVehicles || []).filter(v => 
    v.customer_id === selectedCustomer?.id && (includeInactive || v.is_active !== false)
  );

  const getCustomerDisplayName = (customer) => {
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSelectedVehicle(null);
    setStep(2);
  };

  const handleVehicleSelect = async (vehicle) => {
    setSelectedVehicle(vehicle);
    setHasOpenWO(false);
    
    // Check for open work orders or estimates for this vehicle
    try {
      const openWOs = await base44.entities.WorkOrder.filter({
        vehicle_id: vehicle.id,
        stage: { $in: ['estimate', 'work_order'] }
      });
      if (openWOs && openWOs.length > 0) {
        setHasOpenWO(true);
      }
    } catch (error) {
      console.error("Failed to check for open work orders:", error);
    }
  };

  const generateRandomString = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const generateNumbers = async (stage) => {
    // Fetch next RO number from SystemSettings
    const settings = await SystemSettings.list();
    const systemSettings = settings && settings.length > 0 ? settings[0] : null;
    
    const nextRo = systemSettings?.next_ro_number || 1001;
    
    // Increment and save back to SystemSettings
    if (systemSettings) {
      await SystemSettings.update(systemSettings.id, {
        next_ro_number: nextRo + 1
      });
    } else {
      await SystemSettings.create({
        next_ro_number: nextRo + 1
      });
    }

    const numbers = {
      ro_number: `RO${nextRo}`,
      cp_id: generateRandomString(10),
    };

    switch(stage) {
      case 'estimate':
        numbers.est_number = `EST${nextRo}`;
        break;
      case 'work_order':
        numbers.wo_number = `WO${nextRo}`;
        break;
      case 'invoice':
        numbers.inv_number = `INV${nextRo}`;
        break;
    }

    return numbers;
  };

  const handleCreate = async (stage) => {
    if (!selectedCustomer || !selectedVehicle) {
      alert("Please select both a customer and a vehicle.");
      return;
    }

    // Reactivate customer or vehicle if they are inactive
    if (selectedCustomer.is_active === false) {
      await Customer.update(selectedCustomer.id, { is_active: true });
    }
    if (selectedVehicle.is_active === false) {
      await Vehicle.update(selectedVehicle.id, { is_active: true });
    }

    const numbers = await generateNumbers(stage);

    const newWorkOrder = {
      ro_number: numbers.ro_number,
      wo_number: stage === 'work_order' ? numbers.wo_number || '' : '',
      est_number: stage === 'estimate' ? numbers.est_number || '' : '',
      inv_number: '',
      customer_id: selectedCustomer.id,
      vehicle_id: selectedVehicle.id,
      status: "Open",
      priority: "medium",
      stage: stage,
      description: "",
      internal_notes: "",
      labor_rate: 120,
      total_amount: 0,
      line_items: "[]",
      notes_to_customer: "",
      amount_paid: 0,
      payments: "[]",
      approval: 'pending',
      est_date: stage === 'estimate' ? format(new Date(), 'yyyy-MM-dd') : null,
      wo_date: stage === 'work_order' ? format(new Date(), 'yyyy-MM-dd') : null,
      default_taxable: selectedCustomer.default_taxable || false,
    };

    onCreateWorkOrder(newWorkOrder);
    handleClose();
  };

  const handleClose = () => {
    setSearchTerm("");
    setActiveSearchTerm("");
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setHasOpenWO(false);
    setStep(1);
    onClose();
  };

  const goBack = () => {
    if (step === 2) {
      setSelectedVehicle(null);
      setStep(1);
    }
  };

  const handleNewCustomerSubmit = async (customerData) => {
    try {
      const newCustomer = await Customer.create(customerData);
      setLocalCustomers(prev => [newCustomer, ...prev]);
      handleCustomerSelect(newCustomer);
      setShowCustomerForm(false);
    } catch (error) {
      console.error("Failed to create customer:", error);
      alert("Failed to create customer.");
    }
  };

  const handleNewVehicleSubmit = async (vehicleData) => {
    try {
      const newVehicle = await Vehicle.create(vehicleData);
      setLocalVehicles(prev => [newVehicle, ...prev]);
      handleVehicleSelect(newVehicle);
      setShowVehicleForm(false);
    } catch (error) {
      console.error("Failed to create vehicle:", error);
      alert("Failed to create vehicle.");
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!open) return;
      
      // Check for Alt + W (Work Order) or Alt + E (Estimate)
      // Note: Ctrl + W is reserved by browser (Close Tab) so using Alt + W
      if (e.altKey) {
        if (e.key.toLowerCase() === 'w') {
            e.preventDefault();
            e.stopPropagation();
            if (selectedCustomer && selectedVehicle) {
                handleCreate('work_order');
            }
        }
        if (e.key.toLowerCase() === 'e') {
            e.preventDefault();
            e.stopPropagation();
            if (selectedCustomer && selectedVehicle) {
                handleCreate('estimate');
            }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, selectedCustomer, selectedVehicle]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create New Work Order
              </div>
              <div className="flex items-center space-x-2 mr-4">
                <Checkbox 
                  id="showInactive" 
                  checked={includeInactive}
                  onCheckedChange={setIncludeInactive}
                />
                <Label htmlFor="showInactive" className="text-sm font-normal cursor-pointer">
                  Show Inactive Customers/Vehicles
                </Label>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4 my-6 flex-shrink-0">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step >= 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
                  <User className="w-4 h-4" />1. Select Customer
              </div>
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step >= 2 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
                  <Car className="w-4 h-4" />2. Select Vehicle
              </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-900">Select Customer</h3>
                <Button variant="outline" onClick={() => setShowCustomerForm(true)}>
                  <Plus className="w-4 h-4 mr-2" /> New Customer
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input 
                  ref={searchInputRef} 
                  placeholder="Search customers (Press Enter)..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveSearchTerm(searchTerm);
                    }
                  }}
                  className="pl-10" 
                />
              </div>
              
              {!activeSearchTerm && !loading && (
                <div className="text-center p-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 mt-4">
                  <Search className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p>Search to select a customer</p>
                </div>
              )}
              {activeSearchTerm && filteredCustomers.length === 0 && !loading && (
                <div className="text-center p-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 mt-4">
                  <p>No customers found matching "{activeSearchTerm}"</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1 mt-4">
                {filteredCustomers.map((customer) => (
                  <Card 
                    key={customer.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow focus:ring-2 focus:ring-blue-500 outline-none" 
                    onClick={() => handleCustomerSelect(customer)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCustomerSelect(customer);
                      }
                    }}
                  >
                    <CardContent className="p-4">
                        <h4 className="font-semibold">{getCustomerDisplayName(customer)}</h4>
                        {customer.org_name && customer.first_name && (
                          <p className="text-xs text-slate-500">Contact: {customer.first_name} {customer.last_name}</p>
                        )}
                        <p className="text-sm text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3"/>{customer.phone}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3"/>{customer.email}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Select Vehicle</h3>
                  <p className="text-sm text-slate-600">Customer: {getCustomerDisplayName(selectedCustomer)}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack}>Change Customer</Button>
                    <Button variant="outline" onClick={() => setShowVehicleForm(true)}><Plus className="w-4 h-4 mr-2" /> New Vehicle</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
                {customerVehicles.map((vehicle) => (
                  <Card 
                    key={vehicle.id} 
                    className={`cursor-pointer transition-all border-2 outline-none focus:ring-2 focus:ring-blue-500 ${selectedVehicle?.id === vehicle.id ? 'border-blue-500 bg-blue-50' : 'hover:border-blue-200'}`} 
                    onClick={() => handleVehicleSelect(vehicle)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleVehicleSelect(vehicle);
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <h4 className="font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</h4>
                      <p className="text-sm text-slate-500">VIN: {vehicle.vin}</p>
                      {vehicle.unit_number && (
                        <p className="text-sm text-slate-500">Unit #: {vehicle.unit_number}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            
            <div>
              {hasOpenWO && (
                <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded-md text-sm font-normal flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                  <span className="font-semibold">⚠</span>
                  A work order or estimate is already open for this vehicle.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleCreate('estimate')} disabled={!selectedCustomer || !selectedVehicle} className="bg-yellow-500 hover:bg-yellow-600">Create Estimate</Button>
              <Button onClick={() => handleCreate('work_order')} disabled={!selectedCustomer || !selectedVehicle} className="bg-green-600 hover:bg-green-700">Create Work Order</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Form Modal */}
      <Dialog open={showCustomerForm} onOpenChange={setShowCustomerForm}>
        <DialogContent className="max-w-3xl">
          <CustomerForm
            onSubmit={handleNewCustomerSubmit}
            onCancel={() => setShowCustomerForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Vehicle Form Modal */}
      <Dialog open={showVehicleForm} onOpenChange={setShowVehicleForm}>
        <DialogContent className="max-w-3xl">
          <VehicleForm
            customers={[selectedCustomer]}
            vehicle={useMemo(() => ({ customer_id: selectedCustomer?.id }), [selectedCustomer?.id])}
            onSubmit={handleNewVehicleSubmit}
            onCancel={() => setShowVehicleForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}