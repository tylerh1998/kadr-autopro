import React, { useState, useEffect } from 'react';
import { Supplier } from '@/entities/Supplier';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Phone, Mail, Truck, Lock, FileText, RotateCcw, RefreshCw } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import SupplierForm from '../components/suppliers/SupplierForm';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showFlushConfirm, setShowFlushConfirm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const navigate = useNavigate();
  const searchInputRef = React.useRef(null);

  useEffect(() => {
    loadCurrentUser();
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (!loading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [loading]);

  const loadCurrentUser = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await Supplier.list();
      // Sort suppliers: pinned first (A-Z), then unpinned (A-Z)
      const sortedData = data.sort((a, b) => {
        // First, sort by pin_to_top (true comes before false)
        if (a.pin_to_top && !b.pin_to_top) return -1;
        if (!a.pin_to_top && b.pin_to_top) return 1;
        
        // Then sort by name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
      setSuppliers(sortedData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    try {
      if (editingSupplier) {
        await Supplier.update(editingSupplier.id, formData);
      } else {
        await Supplier.create(formData);
      }
      setShowForm(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Failed to save supplier.');
    }
  };

  const handleFlushLocks = async () => {
    setLoading(true);
    try {
      const allSuppliers = await Supplier.list();
      const lockedSuppliers = allSuppliers.filter(s => s.LockedByUser);
      
      if (lockedSuppliers.length === 0) {
        alert('No locked suppliers found.');
        setShowFlushConfirm(false);
        setLoading(false);
        return;
      }

      const updatePromises = lockedSuppliers.map(supplier => 
        Supplier.update(supplier.id, { LockedByUser: null })
      );

      await Promise.all(updatePromises);
      
      alert(`Successfully unlocked ${lockedSuppliers.length} supplier(s).`);
      loadSuppliers();
    } catch (error) {
      console.error('Error flushing supplier locks:', error);
      alert('Failed to flush supplier locks. Please try again.');
    } finally {
      setShowFlushConfirm(false);
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLockedByOtherUser = (supplier) => {
    if (!supplier.LockedByUser || !currentUser) return false;
    return supplier.LockedByUser !== currentUser.email;
  };

  return (
    <TooltipProvider>
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Suppliers</h1>
              <p className="text-slate-600 mt-1">Manage your parts and service suppliers</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={loadSuppliers}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button
                onClick={() => navigate(createPageUrl('APSummary'))}
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                AP Summary
              </Button>
              <Button
                onClick={() => {
                  setEditingSupplier(null);
                  setShowForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Supplier
              </Button>
              {(currentUser?.access_level === 'lvl2_user' || currentUser?.access_level === 'lvl3_user') && (
                <Button
                  variant="destructive"
                  onClick={() => setShowFlushConfirm(true)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Flush Locks
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search suppliers by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))
            ) : filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((supplier) => (
                <Link key={supplier.id} to={createPageUrl(`SupplierTx?id=${supplier.id}`)}>
                  <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Truck className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900 hover:underline">
                            {supplier.name}
                          </h3>
                          {isLockedByOtherUser(supplier) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center">
                                  <Lock className="w-4 h-4 text-yellow-600" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Locked by: {supplier.LockedByUser}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        </div>
                        </div>
                        <div className="space-y-2 text-sm">
                        {supplier.phone && <p className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400" /> {supplier.phone}</p>}
                        {supplier.email && <p className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {supplier.email}</p>}
                        <div className="flex gap-2 flex-wrap">
                          {supplier.inventory_supplier && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                              Inventory Supplier
                            </span>
                          )}
                          {supplier.pin_to_top && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                              Pinned
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ) : (
              <div className="col-span-full">
                <Card className="text-center py-12">
                  <CardContent>
                    <Truck className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Suppliers Found</h3>
                    <p className="text-slate-600 mb-4">
                      {searchTerm ? 'No suppliers match your search.' : 'Add your first supplier to get started.'}
                    </p>
                    <Button onClick={() => {
                      setEditingSupplier(null);
                      setShowForm(true);
                    }}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Supplier
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Supplier Form Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
          </DialogHeader>
          <SupplierForm
            supplier={editingSupplier}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingSupplier(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Flush Locks Confirmation Dialog */}
      <Dialog open={showFlushConfirm} onOpenChange={setShowFlushConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Flush All Supplier Locks</DialogTitle>
            <DialogDescription>
              This will unlock all supplier records. Progress of any unsaved changes may be lost. 
              Verify that all open supplier forms are saved and closed across the platform before executing this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFlushConfirm(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFlushLocks}
              disabled={loading}
            >
              {loading ? 'Flushing...' : 'Confirm Flush'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}