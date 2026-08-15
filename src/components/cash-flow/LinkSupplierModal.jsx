import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Truck, Mail, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LinkSupplierModal({ open, onClose, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  useEffect(() => {
    if (open) {
      loadSuppliers();
    }
  }, [open]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Supplier')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error("Failed to load suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const searchLower = searchTerm.toLowerCase();
    const name = (supplier.name || '').toLowerCase();
    const contact = (supplier.contact_person || '').toLowerCase();
    
    return !searchTerm || 
      name.includes(searchLower) ||
      contact.includes(searchLower) ||
      supplier.phone?.toLowerCase().includes(searchLower) ||
      supplier.email?.toLowerCase().includes(searchLower);
  });

  const handleSubmit = () => {
    if (selectedSupplier) {
      onSelect(selectedSupplier);
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedSupplier(null);
    setSearchTerm('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Link Supplier to Cash Flow Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search suppliers by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Supplier List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto p-1">
            {loading ? (
                <div className="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">Loading suppliers...</div>
            ) : filteredSuppliers.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">No suppliers found.</div>
            ) : (
                filteredSuppliers.map((supplier) => (
                    <Card 
                    key={supplier.id} 
                    className={`cursor-pointer transition-all border-2 ${
                        selectedSupplier?.id === supplier.id
                        ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                        : 'hover:border-blue-200 dark:hover:border-blue-800'
                    }`}
                    onClick={() => setSelectedSupplier(supplier)}
                    >
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <h4 className="font-semibold text-slate-900 dark:text-slate-100">{supplier.name}</h4>
                            <Truck className="w-4 h-4 text-slate-400" />
                        </div>
                        {supplier.contact_person && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Contact: {supplier.contact_person}</p>
                        )}
                        {supplier.phone && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-2">
                            <Phone className="w-3 h-3"/>
                            {supplier.phone}
                        </p>
                        )}
                        {supplier.email && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-1">
                            <Mail className="w-3 h-3"/>
                            {supplier.email}
                        </p>
                        )}
                    </CardContent>
                    </Card>
                ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedSupplier}>
            Select Supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}