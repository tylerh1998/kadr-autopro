import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Phone, Mail } from 'lucide-react';

export default function SelectCustomerModal({ open, onClose, customers, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const getCustomerContact = (customer) => {
    if (!customer || !customer.org_name) return null;
    if (!customer.first_name && !customer.last_name) return null;
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const filteredCustomers = (customers || []).filter(customer => {
    const searchLower = activeSearchTerm.toLowerCase();
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
    const orgName = (customer.org_name || '').toLowerCase();
    
    return !activeSearchTerm || 
      fullName.includes(searchLower) ||
      orgName.includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower);
  });

  const handleSubmit = () => {
    if (selectedCustomer) {
      onSelect(selectedCustomer);
      setSelectedCustomer(null);
      setSearchTerm('');
      setActiveSearchTerm('');
    }
  };

  const handleClose = () => {
    setSelectedCustomer(null);
    setSearchTerm('');
    setActiveSearchTerm('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Customer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search customers by name, phone, or email (Press Enter)..."
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

          {/* Customer List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto p-1">
            {filteredCustomers.map((customer) => {
              const displayName = getCustomerDisplayName(customer);
              const contact = getCustomerContact(customer);
              
              return (
                <Card 
                  key={customer.id} 
                  className={`cursor-pointer transition-all border-2 ${
                    selectedCustomer?.id === customer.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'hover:border-blue-200'
                  }`}
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-slate-900">{displayName}</h4>
                    {contact && (
                      <p className="text-xs text-slate-500 mt-1">Contact: {contact}</p>
                    )}
                    {customer.phone && (
                      <p className="text-sm text-slate-600 flex items-center gap-1 mt-2">
                        <Phone className="w-3 h-3"/>
                        {customer.phone}
                      </p>
                    )}
                    {customer.email && (
                      <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                        <Mail className="w-3 h-3"/>
                        {customer.email}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedCustomer}>
            Select Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}