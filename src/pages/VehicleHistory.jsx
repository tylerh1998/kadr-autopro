import React, { useState, useEffect } from 'react';
import { Customer, Vehicle } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Car } from 'lucide-react';
import VehicleHistoryModal from '../components/vehicles/VehicleHistoryModal';

export default function VehicleHistoryPage() {
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [customersData, vehiclesData] = await Promise.all([
            Customer.list(),
            Vehicle.list()
        ]);
        setCustomers(customersData);
        setVehicles(vehiclesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
    return (
      !searchTerm ||
      fullName.includes(searchLower) ||
      customer.phone?.includes(searchLower)
    );
  });
  
  const customerVehicles = selectedCustomer 
    ? vehicles.filter(v => v.customer_id === selectedCustomer.id) 
    : [];

  const handleVehicleClick = (vehicle) => {
    setSelectedVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVehicle(null);
  };
  
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(`${customer.first_name} ${customer.last_name}`);
  }

  return (
    <>
      <div className="p-6 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Vehicle History</h1>
            <p className="text-slate-600 mt-1">Search for a customer to view their vehicles and service history.</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Find a Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search for a customer by name or phone..."
                  value={searchTerm}
                  onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedCustomer(null);
                  }}
                  className="pl-10"
                />
              </div>
              {searchTerm && !selectedCustomer && (
                <div className="mt-2 border rounded-md max-h-60 overflow-y-auto bg-white">
                  {loading ? <p className="p-3 text-sm text-slate-500">Loading...</p> : 
                    filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => handleCustomerSelect(c)} className="p-3 hover:bg-slate-100 cursor-pointer text-sm">
                        {c.first_name} {c.last_name} ({c.phone})
                      </div>
                    ))
                  }
                </div>
              )}
            </CardContent>
          </Card>
          
          {selectedCustomer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Step 2: Select a Vehicle for {selectedCustomer.first_name} {selectedCustomer.last_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {customerVehicles.length > 0 ? (
                    customerVehicles.map(vehicle => (
                      <div 
                        key={vehicle.id} 
                        className="p-4 border rounded-lg hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-4"
                        onClick={() => handleVehicleClick(vehicle)}
                      >
                         <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Car className="w-6 h-6 text-blue-600" />
                         </div>
                         <div>
                            <p className="font-bold text-slate-900">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                            <p className="text-sm text-slate-600">Plate: {vehicle.license_plate || 'N/A'} • VIN: {vehicle.vin || 'N/A'}</p>
                         </div>
                      </div>
                    ))
                ) : (
                   <p className="text-center text-slate-500 py-8">This customer has no vehicles on record.</p>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      
      {selectedVehicle && (
        <VehicleHistoryModal
          open={isModalOpen}
          onClose={handleCloseModal}
          vehicle={selectedVehicle}
        />
      )}
    </>
  );
}