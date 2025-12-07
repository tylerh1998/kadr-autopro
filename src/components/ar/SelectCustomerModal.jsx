import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Phone, Mail } from 'lucide-react';

export default function SelectCustomerModal({ open, onClose, customers, onSelect }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
    
    return !searchTerm || 
      fullName.includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower);
  });

  const handleSelect = (customer) => {
    onSelect(customer);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select a Customer</DialogTitle>
        </DialogHeader>
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input 
            placeholder="Search customers..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="pl-10" 
          />
        </div>
        <div className="flex-grow overflow-y-auto pr-2 space-y-3">
          {filteredCustomers.map(customer => (
            <Card key={customer.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleSelect(customer)}>
              <CardContent className="p-4">
                <h4 className="font-semibold">{customer.first_name} {customer.last_name}</h4>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3"/>{customer.phone}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3"/>{customer.email}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}