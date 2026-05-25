import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, FileText, DollarSign, CreditCard } from "lucide-react";
import { getworkorderlist } from "@/functions/getworkorderlist";

export default function OpenROModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState("work_order");
  const [searchNumber, setSearchNumber] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (open) {
      setSearchNumber("");
      setActiveTab("work_order");
    }
  }, [open]);

  const handleSearch = async () => {
    if (!searchNumber.trim()) {
      alert("Please enter a number to search for.");
      return;
    }

    setIsSearching(true);
    
    try {
      const cleanNumber = searchNumber.trim();
      const parsedNumber = Number(cleanNumber);
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';

      if (activeTab === "work_order" && Number.isFinite(parsedNumber) && parsedNumber < 50000) {
        window.open(`/LankarWOView?woid=${cleanNumber}`, '_blank', windowFeatures);
        onClose();
        setSearchNumber("");
        return;
      }

      let searchAttempts = [];

      // Determine search attempts based on tab
      switch (activeTab) {
        case "estimate":
          searchAttempts = [
            { field: "est_number", value: `EST${cleanNumber}` }
          ];
          break;
        case "work_order":
          searchAttempts = [
            { field: "ro_number", value: `RO${cleanNumber}` },
            { field: "wo_number", value: `WO-${cleanNumber}` },
            { field: "wo_number", value: `WO${cleanNumber}` }
          ];
          break;
        case "invoice":
          searchAttempts = cleanNumber.length <= 5
            ? [
                { field: "inv_number", value: `INV0${cleanNumber}` },
                { field: "inv_number", value: `INV${cleanNumber}` }
              ]
            : [
                { field: "inv_number", value: `INV${cleanNumber}` },
                { field: "inv_number", value: `INV0${cleanNumber}` }
              ];
          break;
        case "credit_invoice":
          searchAttempts = cleanNumber.length <= 5
            ? [
                { field: "crinv_number", value: `CRINV0${cleanNumber}` },
                { field: "crinv_number", value: `CRINV${cleanNumber}` },
                { field: "inv_number", value: `INV0${cleanNumber}` },
                { field: "inv_number", value: `INV${cleanNumber}` }
              ]
            : [
                { field: "crinv_number", value: `CRINV${cleanNumber}` },
                { field: "crinv_number", value: `CRINV0${cleanNumber}` },
                { field: "inv_number", value: `INV${cleanNumber}` },
                { field: "inv_number", value: `INV0${cleanNumber}` }
              ];
          break;
        default:
          searchAttempts = [
            { field: "ro_number", value: `RO${cleanNumber}` },
            { field: "wo_number", value: `WO-${cleanNumber}` },
            { field: "wo_number", value: `WO${cleanNumber}` }
          ];
      }

      console.log(`Searching for ${activeTab}:`, searchAttempts.map(attempt => attempt.value));

      let workOrder = null;

      // Try each search attempt until we find a match
      for (const attempt of searchAttempts) {
        const response = await getworkorderlist({ match: { [attempt.field]: attempt.value }, limit: 1 });
        const workOrders = response?.data?.data || [];
        if (workOrders.length > 0) {
          workOrder = workOrders[0];
          console.log(`Found match with ${attempt.field}: ${attempt.value}`);
          break;
        }
      }

      if (!workOrder) {
        alert(`No ${activeTab.replace('_', ' ')} found with number: ${cleanNumber}`);
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
      case "estimate":
        return {
          icon: FileText,
          label: "Estimate",
          prefix: "EST",
          placeholder: "Enter estimate number..."
        };
      case "work_order":
        return {
          icon: FileText,
          label: "Work Order", 
          prefix: "WO-",
          placeholder: "Enter work order number..."
        };
      case "invoice":
        return {
          icon: DollarSign,
          label: "Invoice",
          prefix: "INV",
          placeholder: "Enter invoice number..."
        };
      case "credit_invoice":
        return {
          icon: CreditCard,
          label: "Credit Invoice",
          prefix: "INV",
          placeholder: "Enter credit invoice number..."
        };
      default:
        return {
          icon: FileText,
          label: "Work Order",
          prefix: "WO-",
          placeholder: "Enter work order number..."
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
              <TabsTrigger value="estimate">Estimate</TabsTrigger>
              <TabsTrigger value="work_order">Work Order</TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="invoice">Invoice</TabsTrigger>
              <TabsTrigger value="credit_invoice">Credit Invoice</TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-slate-600" />
                <Label className="text-sm font-medium">
                  {currentTabInfo.label} Number
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {currentTabInfo.prefix}
                </span>
                <Input
                  type="text"
                  value={searchNumber}
                  onChange={(e) => setSearchNumber(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="944989"
                  className="flex-1"
                  autoFocus
                />
              </div>
              
              <div className="text-xs text-slate-500">
                Enter the number without the prefix. Press Enter to search.
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