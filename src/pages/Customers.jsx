import React, { useState, useEffect } from "react";
import { Customer } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, User, Phone, Mail, DollarSign, History, Copy, Pencil, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import CustomerForm from "../components/customers/CustomerForm";
import CustomerHistoryModal from "../components/customers/CustomerHistoryModal";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const customersData = await Customer.list('-created_date');
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (customerData) => {
    try {
      if (editingCustomer) {
        await Customer.update(editingCustomer.id, customerData);
      } else {
        await Customer.create(customerData);
      }
      setShowForm(false);
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleARClick = (customer, e) => {
    e.stopPropagation();
    navigate(`${createPageUrl('CustomerARTransactions')}?customerId=${customer.id}&from=customers`);
  };

  const handleHistoryClick = (customer, e) => {
    e.stopPropagation();
    setSelectedCustomerForHistory(customer);
    setShowHistoryModal(true);
  };

  const handleCopy = async (text, e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      // Optional: Add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Format phone number as XXX XXX XXXX for display
  const formatPhoneDisplay = (phone) => {
    if (!phone) return '';
    
    // Strip all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as XXX XXX XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    } else if (digits.length <= 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    
    // If more than 10 digits, just show all of them
    return digits;
  };

  const getCustomerName = (customer) => {
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    return fullName || 'No Name';
  };
  
  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
    const orgName = (customer.org_name || '').toLowerCase();
    
    return !searchTerm || 
      fullName.includes(searchLower) ||
      orgName.includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower);
  });

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-600 mt-1">Manage your client information</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              onClick={() => navigate(createPageUrl('CustomerARSummary'))}
              className="bg-white"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              AR Summary
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate(createPageUrl('EmailLog'))}
              className="bg-white"
            >
              <Mail className="w-4 h-4 mr-2" />
              Email Log
            </Button>
            <Button 
              onClick={() => {
                setEditingCustomer(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search customers by name, organization, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {showForm ? (
          <CustomerForm
            customer={editingCustomer}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingCustomer(null);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))
            ) : filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <Card 
                  key={customer.id} 
                  className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                  onClick={() => handleEdit(customer)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-lg font-bold text-slate-900">{getCustomerName(customer)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(customer);
                        }}
                      >
                        <Pencil className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm text-slate-600">
                      {customer.org_name && (
                        <p className="text-slate-500 text-xs">
                          Contact: {customer.first_name} {customer.last_name}
                        </p>
                      )}
                      {customer.phone && (
                        <div className="flex items-center justify-between gap-2 text-slate-700">
                          <div className="flex items-center gap-2 flex-1">
                            <Phone className="w-4 h-4 text-slate-400"/>
                            <span>{formatPhoneDisplay(customer.phone)}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => handleCopy(customer.phone, e)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {customer.secondary_phone && (
                        <div className="flex items-center justify-between gap-2 text-slate-700">
                          <div className="flex items-center gap-2 flex-1">
                            <Phone className="w-4 h-4 text-slate-400"/>
                            <span>{formatPhoneDisplay(customer.secondary_phone)}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => handleCopy(customer.secondary_phone, e)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center justify-between gap-2 text-slate-700">
                          <div className="flex items-center gap-2 flex-1">
                            <Mail className="w-4 h-4 text-slate-400"/>
                            <span className="truncate">{customer.email}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => handleCopy(customer.email, e)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {(customer.address || customer.city || customer.state) && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span>
                            {customer.address}
                            {customer.address && customer.city && ', '}
                            {customer.city}
                            {(customer.address || customer.city) && customer.state && ', '}
                            {customer.state}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleARClick(customer, e)}
                        className="flex-1 gap-1"
                      >
                        <DollarSign className="w-3 h-3" />
                        AR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleHistoryClick(customer, e)}
                        className="flex-1 gap-1"
                      >
                        <History className="w-3 h-3" />
                        History
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full">
                <Card className="text-center py-12">
                  <CardContent>
                    <User className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Customers Found</h3>
                    <p className="text-slate-600 mb-4">
                      {searchTerm ? 'No customers match your search.' : 'Add your first customer to get started.'}
                    </p>
                    <Button onClick={() => setShowForm(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Customer
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer History Modal */}
      {selectedCustomerForHistory && (
        <CustomerHistoryModal
          open={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedCustomerForHistory(null);
          }}
          customer={selectedCustomerForHistory}
        />
      )}
    </div>
  );
}