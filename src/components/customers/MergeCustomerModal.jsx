import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function MergeCustomerModal({ open, onClose, onMergeComplete, masterCustomer }) {
  const [step, setStep] = useState(1); // 1: Select Duplicate, 2: Confirm
  const [duplicateCustomer, setDuplicateCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setStep(1);
      setDuplicateCustomer(null);
      setSearchTerm("");
      setSearchResults([]);
    }
  }, [open, masterCustomer]);

  // Search customers
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await base44.functions.invoke('searchCustomers', {
          searchTerm: searchTerm,
          limit: 10,
          page: 1,
          includeInactive: true // Allow merging inactive into active? Yes, probably useful.
        });
        
        if (response?.data?.customers) {
          // Filter out the master customer from results
          setSearchResults(response.data.customers.filter(c => c.id !== masterCustomer?.id));
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, masterCustomer]);

  const handleSelect = (customer) => {
    setDuplicateCustomer(customer);
    setStep(2);
  };

  const handleMerge = async () => {
    if (!masterCustomer || !duplicateCustomer) return;

    setMerging(true);
    try {
      const response = await base44.functions.invoke('mergeCustomers', {
        masterId: masterCustomer.id,
        duplicateId: duplicateCustomer.id
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      alert("Merge completed successfully!");
      if (onMergeComplete) onMergeComplete();
      onClose();
    } catch (error) {
      console.error("Merge failed:", error);
      const serverError = error.response?.data?.error || error.message;
      alert(`Merge failed: ${serverError}`);
    } finally {
      setMerging(false);
    }
  };

  const getCustomerName = (c) => {
    if (!c) return '';
    if (c.org_name) return c.org_name;
    return `${c.first_name} ${c.last_name}`;
  };

  const renderCustomerCard = (customer, type) => (
    <div className={`p-4 rounded-lg border ${type === 'master' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${type === 'master' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
          {type === 'master' ? 'MASTER (Keep & Update)' : 'DUPLICATE (Merge & Deactivate)'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-bold text-lg">{getCustomerName(customer)}</div>
        <div className="text-sm text-gray-600">{customer.phone || 'No Phone'}</div>
        <div className="text-sm text-gray-600">{customer.email || 'No Email'}</div>
        <div className="text-xs text-gray-400 mt-2">ID: {customer.id}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge Customers</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-md border border-blue-200 text-sm mb-4">
              <span className="font-bold">Master Customer:</span> {getCustomerName(masterCustomer)}
              <div className="text-xs text-gray-500 mt-1">Search for the customer you want to merge INTO this master customer.</div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search for Duplicate Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-60 overflow-y-auto border rounded-md">
              {searching ? (
                <div className="p-4 text-center text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="divide-y">
                  {searchResults.map(customer => (
                    <div 
                      key={customer.id} 
                      className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      onClick={() => handleSelect(customer)}
                    >
                      <div>
                        <div className="font-medium">{getCustomerName(customer)}</div>
                        <div className="text-sm text-gray-500">
                          {customer.phone} {customer.email ? `• ${customer.email}` : ''}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-400">
                        {customer.city}, {customer.state}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="p-4 text-center text-gray-500">No customers found</div>
              ) : (
                <div className="p-4 text-center text-gray-400">Type at least 2 characters to search</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                <div>
                  <p className="font-bold text-yellow-700">Warning: This action cannot be undone</p>
                  <p className="text-sm text-yellow-600 mt-1">
                    Merging will move all Vehicles, Work Orders, Payments, and Adjustments from the Duplicate to the Master customer.
                    <br />
                    The Duplicate customer will be marked inactive.
                    <br />
                    Any empty fields on the Master will be filled with data from the Duplicate.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
              {renderCustomerCard(duplicateCustomer, 'duplicate')}
              <ArrowRight className="w-6 h-6 text-gray-400" />
              {renderCustomerCard(masterCustomer, 'master')}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button 
                onClick={handleMerge} 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={merging}
              >
                {merging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirm Merge
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}