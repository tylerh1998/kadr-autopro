import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, FileText, DollarSign, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function OpenROModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState("est_wo");
  const [searchNumber, setSearchNumber] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef(null);

  // Reset when modal opens/closes
  useEffect(() => {
    if (open) {
      setSearchNumber("");
      setActiveTab("est_wo");
      // Use a short timeout to ensure the modal is fully rendered before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Focus input when tab changes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, open]);

  const handleSearch = async () => {
    if (!searchNumber.trim()) {
      alert("Please enter a number to search for.");
      return;
    }

    setIsSearching(true);
    
    try {
      // Helper function to strip known prefixes
      const cleanStr = searchNumber.toUpperCase().replace(/^(EST|WO-?|INV|CRINV|RO)/, '').trim();
      const parsedNumber = Number(cleanStr);
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';

      if (!Number.isFinite(parsedNumber) || !cleanStr) {
        alert("Invalid number format.");
        setIsSearching(false);
        return;
      }

      if (activeTab === "est_wo" && parsedNumber < 50000) {
        window.open(`/LankarWOView?woid=${parsedNumber}`, '_blank', windowFeatures);
        onClose();
        setSearchNumber("");
        return;
      }

      if (activeTab === "lankar_invoice") {
        window.open(`/LankarWOView?invoiceid=${parsedNumber}`, '_blank', windowFeatures);
        onClose();
        setSearchNumber("");
        return;
      }

      let searchAttempts = [];

      // Determine search attempts based on tab
      switch (activeTab) {
        case "est_wo":
          searchAttempts = [
            { field: "ro_number", value: `RO${parsedNumber}` },
            { field: "wo_number", value: `WO-${parsedNumber}` },
            { field: "wo_number", value: `WO${parsedNumber}` },
            { field: "est_number", value: `EST${parsedNumber}` }
          ];
          break;
        case "invoice":
          searchAttempts = [
            { field: "inv_number", value: `INV${parsedNumber}` },
            { field: "inv_number", value: `INV0${parsedNumber}` }
          ];
          break;
        case "credit_invoice":
          searchAttempts = [
            { field: "crinv_number", value: `CRINV${parsedNumber}` },
            { field: "crinv_number", value: `CRINV0${parsedNumber}` }
          ];
          break;
        default:
          searchAttempts = [
            { field: "ro_number", value: `RO${parsedNumber}` },
            { field: "wo_number", value: `WO-${parsedNumber}` },
            { field: "wo_number", value: `WO${parsedNumber}` }
          ];
      }

      console.log(`Searching for ${activeTab}:`, searchAttempts.map(attempt => attempt.value));

      let workOrder = null;

      // Try each search attempt until we find a match
      for (const attempt of searchAttempts) {
        const { data: workOrders, error } = await supabase.rpc('search_work_orders', {
          p_match: { [attempt.field]: attempt.value },
          p_limit: 1
        });
        if (error) console.error('Error searching work orders:', error);
        if (workOrders && workOrders.length > 0) {
          workOrder = workOrders[0];
          console.log(`Found match with ${attempt.field}: ${attempt.value}`);
          break;
        }
      }

      if (!workOrder) {
        alert(`No ${activeTab.replace('_', ' ')} found with number: ${cleanStr}`);
        return;
      }

      // Open in new window using RO number for consistency
      const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
      window.open(url, '_blank', windowFeatures);
      
      // Close modal and clear search
      onClose();
      setSearchNumber("");

    } catch (error) {
      console.error("Error searching for work order:", error);
      alert("An error occurred while searching. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const getTabInfo = (tab) => {
    switch (tab) {
      case "est_wo":
        return {
          icon: FileText,
          label: "Estimate / Work Order",
          prefix: "",
          placeholder: "Enter number (e.g., WO-51234 or 51234)"
        };
      case "invoice":
        return {
          icon: DollarSign,
          label: "Invoice",
          prefix: "",
          placeholder: "Enter invoice number..."
        };
      case "credit_invoice":
        return {
          icon: CreditCard,
          label: "Credit Invoice",
          prefix: "",
          placeholder: "Enter credit invoice number..."
        };
      case "lankar_invoice":
        return {
          icon: DollarSign,
          label: "Lankar Invoice",
          prefix: "",
          placeholder: "Enter legacy invoice number..."
        };
      default:
        return {
          icon: FileText,
          label: "Estimate / Work Order",
          prefix: "",
          placeholder: "Enter number..."
        };
    }
  };

  const currentTabInfo = getTabInfo(activeTab);
  const Icon = currentTabInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Open RO
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger 
                value="est_wo"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-slate-200 data-[state=active]:hover:bg-blue-700 transition-colors"
              >
                Est / Work Order
              </TabsTrigger>
              <TabsTrigger 
                value="invoice"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-slate-200 data-[state=active]:hover:bg-blue-700 transition-colors"
              >
                Invoice
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger 
                value="credit_invoice"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-slate-200 data-[state=active]:hover:bg-blue-700 transition-colors"
              >
                Credit Invoice
              </TabsTrigger>
              <TabsTrigger 
                value="lankar_invoice"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-slate-200 data-[state=active]:hover:bg-blue-700 transition-colors"
              >
                Lankar Invoice
              </TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-slate-600" />
                <Label className="text-sm font-medium">
                  {currentTabInfo.label} Number
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                {currentTabInfo.prefix && (
                  <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    {currentTabInfo.prefix}
                  </span>
                )}
                <Input
                  ref={inputRef}
                  type="text"
                  value={searchNumber}
                  onChange={(e) => setSearchNumber(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={currentTabInfo.placeholder}
                  className="flex-1"
                  autoFocus
                />
              </div>
              
              <div className="text-xs text-slate-500">
                Enter the full number or just the digits. Press Enter to search.
              </div>
            </div>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSearch} disabled={isSearching || !searchNumber.trim()}>
            {isSearching ? "Searching..." : "Open"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}