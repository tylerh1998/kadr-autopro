import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, User, Phone, Mail, DollarSign, Edit, History, Trash2, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import CustomerForm from "../components/customers/CustomerForm";
import CustomerHistoryModal from "../components/customers/CustomerHistoryModal";
import CustomerWorkOrderHistoryModal from "../components/customers/CustomerWorkOrderHistoryModal";

export default function CustomersPage() {
  const { employee } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
    total: 0
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCustomerWorkOrderHistoryModal, setShowCustomerWorkOrderHistoryModal] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState(null);
  const [user, setUser] = useState(null);
  const searchInputRef = React.useRef(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    setUser(employee);
  }, [employee]);

  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 on search
    loadCustomers(1);
  }, [activeSearchTerm, includeInactive]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setActiveSearchTerm(searchTerm);
    }
  };

  useEffect(() => {
    loadCustomers(pagination.page);
  }, [pagination.page]);

  useEffect(() => {
    if (!loading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [loading]);

  const loadCustomers = async (pageToLoad = 1) => {
    setLoading(true);
    try {
      const limit = 50;
      const skip = Math.max(0, (pageToLoad - 1) * limit);
      let loadedCustomers, totalCount;

      if (activeSearchTerm.trim()) {
        const { data, error } = await supabase.rpc('search_customers_ranked', {
          p_search_term: activeSearchTerm.trim(),
          p_include_inactive: includeInactive,
          p_limit: limit,
          p_offset: skip
        });
        if (error) throw error;
        totalCount = data?.length > 0 ? Number(data[0].total_count || 0) : 0;
        loadedCustomers = (data || []).map(({ total_count, match_rank, ...item }) => item);
      } else {
        let query = supabase.from('Customer').select('*', { count: 'exact' });
        if (!includeInactive) query = query.or('is_active.eq.true,is_active.is.null');
        query = query.order('org_name', { ascending: true, nullsLast: true })
                     .order('first_name', { ascending: true, nullsLast: true })
                     .order('last_name', { ascending: true, nullsLast: true })
                     .range(skip, skip + limit - 1);
        const { data, error, count } = await query;
        if (error) throw error;
        loadedCustomers = data || [];
        totalCount = count || 0;
      }

      setCustomers(loadedCustomers);
      setPagination({
        total: totalCount,
        page: pageToLoad,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      });
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (customerData) => {
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('Customer')
          .update({ ...customerData, updated_date: new Date().toISOString() })
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const payload = {
          ...customerData,
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: employee?.email || '',
          created_by_id: employee?.autopro_user_id,
        };
        const { error } = await supabase.from('Customer').insert(payload);
        if (error) throw error;
      }
      setShowEditDialog(false);
      setEditingCustomer(null);
      loadCustomers(pagination.page);
    } catch (error) {
      console.error('Error saving customer:', error);
    }
  };

  const handleARClick = (customer, e) => {
    e.stopPropagation();
    navigate(`${createPageUrl('CustomerARTransactions')}?customerId=${customer.id}&from=customers`);
  };

  const handleVehicleHistoryClick = (customer, e) => {
    e.stopPropagation();
    setSelectedCustomerForHistory(customer);
    setShowHistoryModal(true);
  };

  const handleCustomerHistoryClick = (customer, e) => {
    e.stopPropagation();
    setSelectedCustomerForHistory(customer);
    setShowCustomerWorkOrderHistoryModal(true);
  };

  const handleDelete = async (customer, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete ${customer.org_name || customer.first_name + ' ' + customer.last_name}? This cannot be undone.`)) {
      try {
        const { error } = await supabase.from('Customer').delete().eq('id', customer.id);
        if (error) throw error;
        loadCustomers(pagination.page);
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Failed to delete customer. They may have related records.');
      }
    }
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
    <div className="p-6 min-h-screen dark:bg-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Customers</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your client information</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              onClick={() => navigate(createPageUrl('CustomerARSummary'))}
              className="bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              AR Summary
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate(createPageUrl('EmailLog'))}
              className="bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
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

        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
              ref={searchInputRef}
              placeholder="Search customers by name, organization, phone, or email (Press Enter)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-10 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="checkbox"
                id="includeInactive"
                className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              <label htmlFor="includeInactive" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-700 dark:text-slate-300">
                Include Inactive Customers
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse dark:bg-slate-900 dark:border-slate-800">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : customers.length > 0 ? (
            customers.map((customer) => (
              <Card key={customer.id} className="hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                      {customer.org_name || `${customer.first_name} ${customer.last_name}`}
                    </p>
                    {customer.org_name && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {customer.first_name} {customer.last_name}
                      </p>
                    )}
                    <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-400 mt-1">
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
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
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
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
                      onClick={(e) => handleARClick(customer, e)}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      AR
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
                      onClick={(e) => handleCustomerHistoryClick(customer, e)}
                    >
                      <History className="w-4 h-4 mr-2" />
                      History
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
                      onClick={(e) => handleVehicleHistoryClick(customer, e)}
                    >
                      <Car className="w-4 h-4 mr-2" />
                      Vehicles
                    </Button>
                    {user?.role === 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleDelete(customer, e)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 border-red-200 dark:border-red-900/50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="text-center py-12 dark:bg-slate-900 dark:border-slate-800">
              <CardContent>
                <User className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Customers Found</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
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

        {/* Pagination Controls */}
        <div className="flex justify-between items-center text-sm text-slate-500 dark:text-slate-400 px-1 pt-4">
          <div>
            Showing {customers.length > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} customers
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {selectedCustomerForHistory && (
        <>
          <CustomerHistoryModal
            open={showHistoryModal}
            onClose={() => {
              setShowHistoryModal(false);
              if (!showCustomerWorkOrderHistoryModal) {
                setSelectedCustomerForHistory(null);
              }
            }}
            onOpenCustomerHistory={() => {
              setShowHistoryModal(false);
              setShowCustomerWorkOrderHistoryModal(true);
            }}
            customer={selectedCustomerForHistory}
          />

          <CustomerWorkOrderHistoryModal
            open={showCustomerWorkOrderHistoryModal}
            onClose={() => {
              setShowCustomerWorkOrderHistoryModal(false);
              if (!showHistoryModal) {
                setSelectedCustomerForHistory(null);
              }
            }}
            customer={selectedCustomerForHistory}
            onOpenVehicleHistory={() => {
              setShowCustomerWorkOrderHistoryModal(false);
              setShowHistoryModal(true);
            }}
          />
        </>
      )}

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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