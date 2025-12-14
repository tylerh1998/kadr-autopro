import React, { useState, useEffect } from "react";
import { Customer } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, User, Phone, Mail, DollarSign, Edit, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import CustomerForm from "../components/customers/CustomerForm";
import CustomerHistoryModal from "../components/customers/CustomerHistoryModal";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState(null);
  const searchInputRef = React.useRef(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    loadCustomers();
  }, [searchTerm]);

  useEffect(() => {
    if (!loading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [loading]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('searchCustomers', { searchTerm });
      if (response.data.success) {
        setCustomers(response.data.customers);
      } else {
        console.error('Search failed:', response.data.error);
      }
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
      setShowEditDialog(false);
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
    }
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

  const formatPhoneDisplay = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    else if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    else if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    return digits;
  };

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
                setShowEditDialog(true);
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
                ref={searchInputRef}
                placeholder="Search customers by name, organization, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-slate-200 rounded w-1/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : customers.length > 0 ? (
            customers.map((customer) => (
              <Card key={customer.id} className="hover:bg-slate-50 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg text-slate-900">
                      {customer.org_name || `${customer.first_name} ${customer.last_name}`}
                    </p>
                    {customer.org_name && (
                      <p className="text-sm text-slate-600">
                        {customer.first_name} {customer.last_name}
                      </p>
                    )}
                    <div className="flex gap-4 text-sm text-slate-600 mt-1">
                      {customer.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400"/>
                          {formatPhoneDisplay(customer.phone)}
                        </p>
                      )}
                      {customer.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-slate-400"/>
                          {customer.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCustomer(customer);
                        setShowEditDialog(true);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleARClick(customer, e)}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      AR
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleHistoryClick(customer, e)}
                    >
                      <History className="w-4 h-4 mr-2" />
                      History
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <User className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Customers Found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? 'No customers match your search.' : 'Add your first customer to get started.'}
                </p>
                <Button onClick={() => setShowEditDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          </DialogHeader>
          <CustomerForm
            customer={editingCustomer}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowEditDialog(false);
              setEditingCustomer(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}