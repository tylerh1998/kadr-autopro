import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import { searchInventory } from "@/lib/inventorySearch";
import { supabase } from "@/lib/supabase";

export default function MergeInventoryModal({ open, onClose, onMergeComplete, preselectedMaster }) {
  const [step, setStep] = useState(preselectedMaster ? 2 : 1); // 1: Select Master, 2: Select Duplicate, 3: Confirm
  const [masterItem, setMasterItem] = useState(preselectedMaster || null);
  const [duplicateItem, setDuplicateItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      if (preselectedMaster) {
        setMasterItem(preselectedMaster);
        setStep(2);
      } else {
        setMasterItem(null);
        setStep(1);
      }
      setDuplicateItem(null);
      setSearchTerm("");
      setSearchResults([]);
    }
  }, [open, preselectedMaster]);

  // Search inventory
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await searchInventory({
          searchTerm: searchTerm,
          filter: 'all',
          sortBy: 'part_number',
          sortDirection: 'asc',
          limit: 10,
          offset: 0
        });
        
        if (response?.data?.records) {
          // Filter out already selected item from results
          const currentSelectedId = step === 2 ? masterItem?.id : null;
          setSearchResults(response.data.records.filter(i => i.id !== currentSelectedId && i.is_active));
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
  }, [searchTerm, step, masterItem]);

  const handleSelect = (item) => {
    if (step === 1) {
      setMasterItem(item);
      setStep(2);
      setSearchTerm("");
      setSearchResults([]);
    } else if (step === 2) {
      setDuplicateItem(item);
      setStep(3);
    }
  };

  const handleMerge = async () => {
    if (!masterItem || !duplicateItem) return;

    setMerging(true);
    try {
      const { data, error } = await supabase.functions.invoke('autopro-mergeInventoryItems', {
        body: {
          masterId: masterItem.id,
          duplicateId: duplicateItem.id
        }
      });

      if (error) {
        console.error('Edge Function Error:', error);
        let errorMessage = error.message;
        if (error.context && typeof error.context.json === 'function') {
           try {
             const errData = await error.context.json();
             if (errData.error) errorMessage = errData.error;
           } catch (e) {}
        }
        throw new Error(errorMessage || 'Edge function invocation failed');
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      alert("Merge completed successfully!");
      if (onMergeComplete) onMergeComplete();
      onClose();
    } catch (error) {
      console.error("Merge failed:", error);
      alert(`Merge failed: ${error.message}`);
    } finally {
      setMerging(false);
    }
  };

  const renderItemCard = (item, type) => (
    <div className={`p-4 rounded-lg border ${type === 'master' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${type === 'master' ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300'}`}>
          {type === 'master' ? 'MASTER (Keep)' : 'DUPLICATE (Merge & Hide)'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-bold text-lg dark:text-slate-100">{item.part_number}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{item.description}</div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">QOH:</span> <span className="font-medium dark:text-slate-200">{item.quantity_on_hand}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Cost:</span> <span className="font-medium dark:text-slate-200">${item.cost}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Inventory Items</DialogTitle>
        </DialogHeader>

        {step < 3 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>1</div>
              <span className={step === 1 ? 'font-bold dark:text-slate-100' : 'text-gray-500 dark:text-gray-400'}>Select Master Item</span>
              <div className="w-8 h-px bg-gray-300 dark:bg-gray-700 mx-2"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>2</div>
              <span className={step === 2 ? 'font-bold dark:text-slate-100' : 'text-gray-500 dark:text-gray-400'}>Select Duplicate Item</span>
            </div>

            {masterItem && step === 2 && (
              <div className="mb-4">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Selected Master Item:</div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex justify-between items-center">
                  <div>
                    <span className="font-bold mr-2 dark:text-slate-100">{masterItem.part_number}</span>
                    <span className="dark:text-slate-300">{masterItem.description}</span>
                  </div>
                  {!preselectedMaster && (
                    <Button variant="ghost" size="sm" onClick={() => { setStep(1); setMasterItem(null); setSearchTerm(""); }}>Change</Button>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <Input
                placeholder={`Search for ${step === 1 ? 'Master' : 'Duplicate'} Item...`}
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
                  {searchResults.map(item => (
                    <div
                      key={item.id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 cursor-pointer flex justify-between items-center"
                      onClick={() => handleSelect(item)}
                    >
                      <div>
                        <div className="font-medium dark:text-slate-100">{item.part_number}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{item.description}</div>
                      </div>
                      <div className="text-right text-sm dark:text-slate-200">
                        <div>QOH: {item.quantity_on_hand}</div>
                        <div className="text-gray-500 dark:text-gray-400">${item.cost}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">No items found</div>
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
                    Merging will move all history, work order links, and quantities from the Duplicate to the Master item. The Duplicate item will be deactivated.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
              {renderItemCard(duplicateItem, 'duplicate')}
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              {renderItemCard(masterItem, 'master')}
            </div>

            <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg space-y-2 text-sm">
              <h4 className="font-bold text-gray-700 dark:text-gray-300">Merge Result Preview:</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                <div className="text-gray-500 dark:text-gray-400">New QOH:</div>
                <div className="font-medium dark:text-slate-200">{(masterItem.quantity_on_hand || 0) + (duplicateItem.quantity_on_hand || 0)}</div>

                <div className="text-gray-500 dark:text-gray-400">New Cost:</div>
                <div className="font-medium dark:text-slate-200">${Math.max(masterItem.cost || 0, duplicateItem.cost || 0).toFixed(2)}</div>

                <div className="text-gray-500 dark:text-gray-400">Master ID:</div>
                <div className="font-mono text-xs dark:text-slate-400">{masterItem.id}</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 3 ? (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
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