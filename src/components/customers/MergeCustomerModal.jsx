import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
        const { data, error } = await supabase.rpc('search_customers_ranked', {
          p_search_term: searchTerm.trim(),
          p_include_inactive: true, // Allow merging inactive into active? Yes, probably useful.
          p_limit: 10,
          p_offset: 0
        });
        if (error) throw error;
        const customers = (data || []).map(({ total_count, match_rank, ...item }) => item);

        // Filter out the master customer from results
        setSearchResults(customers.filter(c => c.id !== masterCustomer?.id));
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
      const { data: response, error: mergeError } = await supabase.functions.invoke('autopro-mergeCustomers', {
        body: {
          masterId: masterCustomer.id,
          duplicateId: duplicateCustomer.id
        }
      });

      if (mergeError) {
        throw new Error(mergeError.message);
      }
      if (response?.error) {
        throw new Error(response.error);
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
    <div className={`p-4 rounded-lg border ${type === 'master' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${type === 'master' ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300'}`}>
          {type === 'master' ? 'MASTER (Keep & Update)' : 'DUPLICATE (Merge & Deactivate)'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-bold text-lg dark:text-slate-100">{getCustomerName(customer)}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{customer.phone || 'No Phone'}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{customer.email || 'No Email'}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">ID: {customer.id}</div>
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
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200 dark:border-blue-800 text-sm mb-4">
              <span className="font-bold">Master Customer:</span> {getCustomerName(masterCustomer)}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Search for the customer you want to merge INTO this master customer.</div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
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
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="divide-y dark:divide-slate-800">
                  {searchResults.map(customer => (
                    <div
                      key={customer.id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 cursor-pointer flex justify-between items-center"
                      onClick={() => handleSelect(customer)}
                    >
                      <div>
                        <div className="font-medium dark:text-slate-100">{getCustomerName(customer)}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.phone} {customer.email ? `• ${customer.email}` : ''}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-400 dark:text-gray-500">
                        {customer.city}, {customer.state}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">No customers found</div>
              ) : (
                <div className="p-4 text-center text-gray-400 dark:text-gray-500">Type at least 2 characters to search</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-700 p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-400 dark:text-yellow-500 mr-2" />
                <div>
                  <p className="font-bold text-yellow-700 dark:text-yellow-400">Warning: This action cannot be undone</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
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
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-gray-500" />
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