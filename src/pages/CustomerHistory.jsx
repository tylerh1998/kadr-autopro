import React, { useState, useEffect } from 'react';
import { Customer } from '@/entities/all';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, User, Phone, Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import CustomerHistoryModal from '../components/customers/CustomerHistoryModal';

export default function CustomerHistoryPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      setLoading(true);
      try {
        const data = await Customer.list('-created_date');
        setCustomers(data);
      } catch (error) {
        console.error("Failed to load customers:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCustomers();
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      customer.phone?.includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower)
    );
  });

  const handleCustomerClick = (customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
  };

  return (
    <>
      <div className="p-6 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Customer History</h1>
            <p className="text-slate-600 mt-1">Search for a customer to view their work order history.</p>
          </div>

          <Card>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search for a customer by name, phone, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>
          
          <div className="space-y-3">
            {loading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : filteredCustomers.length > 0 ? (
              filteredCustomers.map(customer => (
                <Card 
                  key={customer.id} 
                  className="hover:bg-slate-100 transition-colors cursor-pointer"
                  onClick={() => handleCustomerClick(customer)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-slate-900">{customer.first_name} {customer.last_name}</p>
                      <div className="flex gap-4 text-sm text-slate-600 mt-1">
                        {customer.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400"/>{customer.phone}</p>}
                        {customer.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400"/>{customer.email}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                 <CardContent className="p-12 text-center text-slate-500">
                    <p>{searchTerm ? "No customers match your search." : "No customers found."}</p>
                 </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {selectedCustomer && (
        <CustomerHistoryModal
          open={isModalOpen}
          onClose={handleCloseModal}
          customer={selectedCustomer}
        />
      )}
    </>
  );
}