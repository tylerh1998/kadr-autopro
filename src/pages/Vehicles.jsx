import React, { useState, useEffect } from "react";
import { Vehicle, Customer } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Search, 
  Car, 
  User,
  Gauge,
  Palette,
  Edit3,
  Eye,
  Phone,
  Mail
} from "lucide-react";

import VehicleForm from "../components/vehicles/VehicleForm";
import VehicleDetails from "../components/vehicles/VehicleDetails";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
    total: 0
  });

  // Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reload when debounced search, page, or includeInactive changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 on new search
    loadData(1);
  }, [debouncedSearchTerm, includeInactive]);

  useEffect(() => {
    loadData(pagination.page);
  }, [pagination.page]);

  const loadData = async (pageToLoad = 1) => {
    setLoading(true);
    try {
      // Use new backend search function
      const response = await base44.functions.invoke('searchVehicles', { 
        searchTerm: debouncedSearchTerm,
        page: pageToLoad,
        limit: 50,
        includeInactive
      });

      if (response.data.success) {
        setVehicles(response.data.vehicles);
        setCustomers(response.data.customers); // Customers are returned for name mapping
        setPagination(response.data.pagination);
      } else {
        console.error('Search failed:', response.data.error);
        // Fallback for customers if needed, though searchVehicles should handle it
        const customersData = await Customer.list();
        setCustomers(customersData);
      }
    } catch (error) {
      console.error('Error loading vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (vehicleData) => {
    try {
      if (editingVehicle) {
        await Vehicle.update(editingVehicle.id, vehicleData);
      } else {
        await Vehicle.create(vehicleData);
      }
      
      setShowForm(false);
      setEditingVehicle(null);
      loadData(pagination.page);
    } catch (error) {
      console.error('Error saving vehicle:', error);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setShowForm(true);
  };

  // Vehicles are already filtered and paginated from backend
  const filteredVehicles = vehicles;

  const getCustomer = (customerId) => customers.find(c => c.id === customerId);

  const getStageLabel = (stage) => {
    const labels = {
      estimate: 'Estimate',
      work_order: 'Work Order',
      invoice: 'Invoice',
      credit_invoice: 'Credit Invoice'
    };
    return labels[stage] || 'Work Order';
  };

  const getDisplayNumber = (workOrder) => {
    if (workOrder.stage === 'estimate') return workOrder.est_number;
    if (workOrder.stage === 'invoice') return workOrder.inv_number;
    if (workOrder.stage === 'credit_invoice') return workOrder.crinv_number;
    return workOrder.wo_number;
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Vehicles</h1>
            <p className="text-slate-600 mt-1">Manage customer vehicle information</p>
          </div>
          <Button 
            onClick={() => {
              setEditingVehicle(null);
              setShowForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search vehicles by make, model, VIN, license plate, or customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDebouncedSearchTerm(searchTerm);
                  }
                }}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="checkbox"
                id="includeInactive"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              <label htmlFor="includeInactive" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-700">
                Include Inactive Vehicles
              </label>
            </div>
          </CardContent>
        </Card>

        {showForm && (
          <VehicleForm
            vehicle={editingVehicle}
            customers={customers}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingVehicle(null);
            }}
          />
        )}

        {selectedVehicle && (
          <VehicleDetails
            vehicle={selectedVehicle}
            customer={getCustomer(selectedVehicle.customer_id)}
            onClose={() => setSelectedVehicle(null)}
            onEdit={() => {
              handleEdit(selectedVehicle);
              setSelectedVehicle(null);
            }}
          />
        )}

        {/* Vehicles Grid */}
        {!showForm && !selectedVehicle && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                      <div className="space-y-2">
                        <div className="h-3 bg-slate-200 rounded"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredVehicles.length > 0 ? (
              filteredVehicles.map((vehicle) => {
                const customer = getCustomer(vehicle.customer_id);
                
                return (
                  <Card key={vehicle.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {/* Vehicle Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                              <Car className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">
                                {vehicle.year} {vehicle.make}
                              </h3>
                              <p className="text-slate-600 font-medium">{vehicle.model}</p>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Vehicle Details */}
                        <div className="space-y-2 text-sm">
                          {vehicle.license_plate && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">License Plate:</span>
                              <Badge variant="outline" className="font-mono">
                                {vehicle.license_plate}
                              </Badge>
                            </div>
                          )}
                          
                          {vehicle.color && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Palette className="w-3 h-3" />
                                Color:
                              </span>
                              <span className="font-medium">{vehicle.color}</span>
                            </div>
                          )}
                          
                          {vehicle.mileage && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Gauge className="w-3 h-3" />
                                Mileage:
                              </span>
                              <span className="font-medium">{vehicle.mileage.toLocaleString()} mi</span>
                            </div>
                          )}

                          {vehicle.engine && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Engine:</span>
                              <span className="font-medium text-xs">{vehicle.engine}</span>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Customer Info */}
                        {customer && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                              <User className="w-4 h-4" />
                              Owner Information
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p className="font-medium text-slate-900">
                                {customer.org_name ? (
                                  <>
                                    <span className="block">{customer.org_name}</span>
                                    {(customer.first_name || customer.last_name) && (
                                      <span className="text-sm font-normal text-slate-500">
                                        {customer.first_name} {customer.last_name}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  `${customer.first_name} ${customer.last_name}`
                                )}
                              </p>
                              {customer.phone && (
                                <p className="text-slate-600 flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {customer.phone}
                                </p>
                              )}
                              {customer.email && (
                                <p className="text-slate-600 flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {customer.email}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* VIN */}
                        {vehicle.vin && (
                          <div className="pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500">VIN:</p>
                            <p className="text-xs font-mono text-slate-700 break-all">{vehicle.vin}</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVehicle(vehicle);
                            }}
                            className="flex-1 gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(vehicle);
                            }}
                            className="flex-1 gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full">
                <Card className="text-center py-12">
                  <CardContent>
                    <div className="text-slate-400 mb-4">
                      <Car className="w-12 h-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Vehicles Found</h3>
                    <p className="text-slate-600 mb-4">
                      {searchTerm ? 'No vehicles match your search criteria.' : 'No vehicles have been added yet.'}
                    </p>
                    <Button onClick={() => setShowForm(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Vehicle
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {!showForm && !selectedVehicle && (
          <div className="flex justify-between items-center text-sm text-slate-500 px-1 pt-4">
            <div>
              Showing {vehicles.length > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} vehicles
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}