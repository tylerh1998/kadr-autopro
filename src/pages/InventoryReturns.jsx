import React, { useState, useEffect } from 'react';
import { InventoryReturn } from '@/entities/all';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getMountainTimeNow, toMountainTime } from '@/components/utils/mountainTimeUtils';
import {
  RotateCcw,
  Search,
  Printer,
  Package,
  Shield,
  Truck,
  CreditCard,
  ArchiveRestore,
  Pencil,
  List,
  FileWarning,
  ArrowUpDown,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl, getWorkOrderEditUrl } from '@/utils';
import ChangeSupplierModal from '../components/inventory/ChangeSupplierModal';
import ReceiveCreditModal from '../components/inventory/ReceiveCreditModal';
import EditReturnInfoModal from '../components/inventory/EditReturnInfoModal';
import LegacyWarrantyReturnModal from '../components/inventory/LegacyWarrantyReturnModal';
import { base44 } from '@/api/base44Client';
import { inventoryUpdate } from '@/functions/inventoryUpdate';
import { searchInventory } from '@/functions/searchInventory';

export default function InventoryReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState('all');
  const [showChangeSupplierModal, setShowChangeSupplierModal] = useState(false);
  const [showReceiveCreditModal, setShowReceiveCreditModal] = useState(false);
  const [showEditReturnInfoModal, setShowEditReturnInfoModal] = useState(false);
  const [showLegacyWarrantyModal, setShowLegacyWarrantyModal] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'part_number', direction: 'asc' });
  const [stagedReturns, setStagedReturns] = useState(new Set());
  const [bulkReturnDate, setBulkReturnDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }));

  useEffect(() => {
    loadReturns();
    loadSuppliers();
  }, []);

  const loadReturns = async () => {
    setLoading(true);
    try {
      const returnsData = await InventoryReturn.list('-created_date');
      setReturns(returnsData);
    } catch (error) {
      console.error('Error loading returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const response = await base44.functions.invoke('SupabaseProxy', {
        action: 'read',
        table: 'Supplier'
      });
      setSuppliers(response.data.data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'Unknown Supplier';
  };

  const handleStatusClick = async (returnItem) => {
    if (returnItem.status === 'Returned') {
        // Immediate revert to On-site
        const updateData = {
          status: 'On-site',
          date_returned: null,
          sent_back: 'N/A',
        };
        try {
          await InventoryReturn.update(returnItem.id, updateData);
          loadReturns();
        } catch (error) {
          console.error('Error reverting status:', error);
          alert('Failed to revert status.');
        }
    } else {
        // Toggle staging for return
        setStagedReturns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(returnItem.id)) {
                newSet.delete(returnItem.id);
            } else {
                newSet.add(returnItem.id);
            }
            return newSet;
        });
    }
  };

  const handleRowClick = (returnItem) => {
    if (returnItem.status === 'Returned') {
      openModal(setShowReceiveCreditModal, returnItem);
      return;
    }

    handleStatusClick(returnItem);
  };

  const handleOpenWorkOrder = async (workOrderId) => {
    try {
      const response = await base44.functions.invoke('SupabaseProxy', {
        action: 'filter',
        table: 'WorkOrder',
        params: { id: workOrderId }
      });
      const wo = response.data?.data?.[0];
      if (wo && wo.ro_number) {
        window.open(getWorkOrderEditUrl(wo.ro_number), '_blank');
      } else {
        alert('Could not find RO number for this Work Order.');
      }
    } catch (error) {
      console.error('Error fetching Work Order:', error);
      alert('Failed to open Work Order.');
    }
  };

  const handleBulkReturn = async () => {
    if (stagedReturns.size === 0) return;

    try {
        const promises = Array.from(stagedReturns).map(id => 
            InventoryReturn.update(id, {
                status: 'Returned',
                date_returned: new Date().toISOString(),
                sent_back: bulkReturnDate
            })
        );
        
        await Promise.all(promises);
        setStagedReturns(new Set());
        loadReturns();
    } catch (error) {
        console.error('Error performing bulk return:', error);
        alert('Failed to process bulk return.');
    }
  };

  const handleReturnToInventory = async (returnItem) => {
    if (!returnItem.inventory_item_id) {
      alert("Cannot return to inventory: Original item link is missing.");
      return;
    }
    if (window.confirm(`Are you sure you want to return ${returnItem.quantity_returned} of ${returnItem.part_number} to inventory? This will delete the return record.`)) {
      try {
        const response = await searchInventory({
          searchTerm: returnItem.part_number,
          limit: 20,
          offset: 0,
        });
        const matchingItems = response.data?.records || [];
        const originalItem = matchingItems.find(item => item.id === returnItem.inventory_item_id);

        if (!originalItem) {
          alert('Cannot return to inventory: matching Supabase inventory item was not found.');
          return;
        }

        const quantityReturned = Number(returnItem.quantity_returned || 0);
        const newQOH = Number(originalItem.quantity_on_hand || 0) + quantityReturned;
        const { error: updateError } = await supabase.from('InventoryItem').update({ quantity_on_hand: newQOH }).eq('id', originalItem.id);
        if (updateError) throw new Error('Failed to update inventory quantity');

        const { error: auditError } = await supabase.from('InventoryAuditLog').insert([{
          inventory_item_id: originalItem.id,
          transaction_type: 'QOH Adjusted',
          quantity_change: quantityReturned,
          description: 'Part removed from inventory, back to inventory.'
        }]);
        if (auditError) console.error('Error creating InventoryAuditLog:', auditError);
        await InventoryReturn.delete(returnItem.id);
        alert('Item returned to inventory successfully.');
        loadReturns();
      } catch (error) {
        console.error('Error returning item to inventory:', error);
        alert('Failed to return item to inventory.');
      }
    }
  };

  const openModal = (setter, item) => {
    setSelectedReturnItem(item);
    setter(true);
  };
  
  const handleUpdate = () => {
    setShowChangeSupplierModal(false);
    setShowReceiveCreditModal(false);
    setShowEditReturnInfoModal(false);
    setShowLegacyWarrantyModal(false);
    setSelectedReturnItem(null);
    loadReturns();
  };

  const filteredReturns = returns.filter(returnItem => {
    const searchLower = searchTerm.toLowerCase();
    const supplierName = getSupplierName(returnItem.supplier);
    const matchesSearch = !searchTerm ||
      returnItem.part_number?.toLowerCase().includes(searchLower) ||
      returnItem.description?.toLowerCase().includes(searchLower) ||
      supplierName.toLowerCase().includes(searchLower) ||
      returnItem.return_reason?.toLowerCase().includes(searchLower);
    const matchesType = typeFilter === 'all' || returnItem.return_type === typeFilter;

    return matchesSearch && matchesType;
  });

  const returnsBySupplier = filteredReturns.reduce((acc, returnItem) => {
    const supplierName = getSupplierName(returnItem.supplier);
    if (!acc[supplierName]) {
      acc[supplierName] = [];
    }
    acc[supplierName].push(returnItem);
    return acc;
  }, {});

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort suppliers alphabetically
  const sortedSupplierNames = Object.keys(returnsBySupplier).sort((a, b) => a.localeCompare(b));
  
  // Sort items within each supplier based on sortConfig
  sortedSupplierNames.forEach(supplierName => {
    returnsBySupplier[supplierName].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle null/undefined
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      // Numeric sort for cost and qty
      if (sortConfig.key === 'total_cost' || sortConfig.key === 'quantity_returned') {
        return sortConfig.direction === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
      }
      
      // String sort for others
      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();
      
      if (aString < bString) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aString > bString) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    let htmlContent = `
      <html>
        <head>
          <title>Inventory Returns Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #111; }
            h1 { text-align: center; margin-bottom: 5px; font-size: 24px; }
            .date { text-align: center; margin-bottom: 30px; color: #666; font-size: 14px; }
            .supplier-section { margin-bottom: 30px; page-break-inside: avoid; }
            .supplier-header { 
              background-color: #f3f4f6; 
              padding: 10px 15px; 
              font-weight: bold; 
              font-size: 16px;
              border: 1px solid #e5e7eb;
              border-bottom: none;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
            th { background-color: #f9fafb; font-weight: 600; color: #374151; }
            .text-right { text-align: right; }
            .badge { 
              padding: 2px 8px; 
              border-radius: 9999px; 
              font-size: 10px; 
              font-weight: 600;
              display: inline-block;
              text-transform: uppercase;
            }
            .badge-core { background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
            .badge-warranty { background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .badge-return { background-color: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
            .status-returned { color: #15803d; font-weight: 600; }
            .status-onsite { color: #a16207; font-weight: 600; }
            tr:nth-child(even) { background-color: #f9fafb; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .supplier-section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>Inventory Returns Report</h1>
          <div class="date">Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
    `;

    if (sortedSupplierNames.length === 0) {
      htmlContent += `<div style="text-align:center; color: #666; margin-top: 50px; font-style: italic;">No returns found matching your criteria.</div>`;
    } else {
      sortedSupplierNames.forEach(supplierName => {
        const supplierReturns = returnsBySupplier[supplierName];
        const totalValue = supplierReturns.reduce((sum, item) => sum + (item.total_cost || 0), 0);
        
        htmlContent += `
          <div class="supplier-section">
            <div class="supplier-header">
              <span>${supplierName} <span style="font-weight:normal; font-size: 0.9em; color: #555;">(${supplierReturns.length} items)</span></span>
              <span>Total: $${totalValue.toFixed(2)}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 15%">Part #</th>
                  <th style="width: 25%">Description</th>
                  <th style="width: 8%">Type</th>
                  <th style="width: 5%">Qty</th>
                  <th style="width: 15%">Reason</th>
                  <th style="width: 10%" class="text-right">Cost</th>
                  <th style="width: 10%">Return Date</th>
                  <th style="width: 10%">Sent Back</th>
                  <th style="width: 8%">Status</th>
                </tr>
              </thead>
              <tbody>
        `;

        supplierReturns.forEach(item => {
          const typeClass = item.return_type ? `badge-${item.return_type.toLowerCase()}` : '';
          const statusClass = item.status === 'Returned' ? 'status-returned' : 'status-onsite';
          
          // Format dates using simple logic to match the main view
          const returnDate = item.return_date ? new Date(item.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
          
          let sentBackDate = 'N/A';
          if (item.sent_back && item.sent_back !== 'N/A') {
             // Try to parse YYYY-MM-DD
             const parts = item.sent_back.split('-');
             if (parts.length === 3) {
                const d = new Date(parts[0], parts[1]-1, parts[2]);
                sentBackDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
             } else {
                sentBackDate = item.sent_back;
             }
          }

          htmlContent += `
            <tr>
              <td><strong>${item.part_number || ''}</strong></td>
              <td>${item.description || ''}</td>
              <td><span class="badge ${typeClass}">${(item.return_type || '').toUpperCase()}</span></td>
              <td style="text-align: center">${item.quantity_returned}</td>
              <td>${item.return_reason || ''}${item.notes ? `<div style="font-size:10px; color:#666; font-style:italic; margin-top:2px;">${item.notes}</div>` : ''}</td>
              <td class="text-right">$${(item.total_cost || 0).toFixed(2)}</td>
              <td>${returnDate}</td>
              <td>${sentBackDate}</td>
              <td class="${statusClass}">${item.status || ''}</td>
            </tr>
          `;
        });

        htmlContent += `
              </tbody>
            </table>
          </div>
        `;
      });
    }

    htmlContent += `
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load before printing
    printWindow.onload = function() {
      printWindow.focus();
      printWindow.print();
    };
  };

  const getReturnTypeIcon = (type) => {
    switch (type) {
      case 'core': return <Package className="w-4 h-4" />;
      case 'warranty': return <Shield className="w-4 h-4" />;
      default: return <RotateCcw className="w-4 h-4" />;
    }
  };

  const getReturnTypeBadge = (type) => {
    const colors = {
      core: "bg-blue-100 text-blue-800 border-blue-200",
      warranty: "bg-green-100 text-green-800 border-green-200",
      return: "bg-orange-100 text-orange-800 border-orange-200"
    };

    return (
      <Badge className={`${colors[type]} border font-medium flex items-center gap-1`}>
        {getReturnTypeIcon(type)}
        {type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .print-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; }
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Inventory Returns</h1>
              <p className="text-slate-600 mt-1">Track parts returned to suppliers</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => window.location.href = createPageUrl('InventoryList')} variant="outline">
                <List className="w-4 h-4 mr-2" />
                Inventory List
              </Button>
              <Button onClick={() => setShowLegacyWarrantyModal(true)} variant="outline" className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-800">
                <FileWarning className="w-4 h-4 mr-2" />
                LANKAR Warranty
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          <Card className="no-print">
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search returns by part number, description, supplier, or reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <div className="print-title" style={{ display: 'none' }}>
            Inventory Returns Report - {new Date().toLocaleDateString()}
          </div>

          <div className="print-area space-y-8">
            {loading ? (
              <Card><CardContent className="p-8"><div className="animate-pulse space-y-4">{Array(5).fill(0).map((_, i) => (<div key={i} className="h-4 bg-slate-200 rounded w-full"></div>))}</div></CardContent></Card>
            ) : sortedSupplierNames.length > 0 ? (
              sortedSupplierNames.map((supplierName) => {
                const supplierReturns = returnsBySupplier[supplierName];
                return (
                <Card key={supplierName}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Truck className="w-5 h-5" />{supplierName} ({supplierReturns.length} items)</div>
                      <div className="text-sm font-normal text-slate-600">Total Value: ${supplierReturns.reduce((sum, item) => sum + (item.total_cost || 0), 0).toFixed(2)}</div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('part_number')}>
                              <div className="flex items-center gap-1">Part # <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('description')}>
                              <div className="flex items-center gap-1">Description <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('return_type')}>
                              <div className="flex items-center gap-1">Type <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('quantity_returned')}>
                              <div className="flex items-center gap-1">Qty <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('return_reason')}>
                              <div className="flex items-center gap-1">Reason <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('total_cost')}>
                              <div className="flex items-center gap-1">Cost <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('return_date')}>
                              <div className="flex items-center gap-1">Return Date <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('sent_back')}>
                              <div className="flex items-center gap-1">Sent Back <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                            <th className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>
                              <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierReturns.map((returnItem) => (
                            <ContextMenu key={returnItem.id}>
                              <ContextMenuTrigger asChild>
                                <tr
                                  className="border-b hover:bg-slate-50 transition-colors cursor-pointer"
                                  onClick={() => handleRowClick(returnItem)}
                                >
                                  <td className="p-3"><span className="font-mono text-sm font-medium text-slate-900">{returnItem.part_number}</span></td>
                                  <td className="p-3"><p className="font-medium text-slate-900">{returnItem.description}</p></td>
                                  <td className="p-3">{getReturnTypeBadge(returnItem.return_type)}</td>
                                  <td className="p-3"><span className="font-medium">{returnItem.quantity_returned}</span></td>
                                  <td className="p-3">
                                    <TooltipProvider><Tooltip>
                                      <TooltipTrigger asChild><span className="text-slate-600 cursor-help underline decoration-dotted">{returnItem.return_reason}</span></TooltipTrigger>
                                      {returnItem.notes && (<TooltipContent><p className="max-w-xs">{returnItem.notes}</p></TooltipContent>)}
                                    </Tooltip></TooltipProvider>
                                  </td>
                                  <td className="p-3"><span className="font-semibold text-slate-900">${(returnItem.total_cost || 0).toFixed(2)}</span></td>
                                  <td className="p-3"><span className="text-slate-600">{returnItem.return_date ? (() => {
                                    const d = new Date(returnItem.return_date + 'T12:00:00');
                                    return !isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : returnItem.return_date;
                                  })() : 'N/A'}</span></td>
                                  <td className="p-3"><span className="text-slate-600">{returnItem.sent_back && returnItem.sent_back !== 'N/A' ? (() => {
                                    const parts = returnItem.sent_back.split('-');
                                    if (parts.length === 3) {
                                      const [year, month, day] = parts.map(Number);
                                      const d = new Date(year, month - 1, day);
                                      if (!isNaN(d.getTime())) return format(d, 'MMM d, yyyy');
                                    }
                                    return returnItem.sent_back;
                                  })() : 'N/A'}</span></td>
                                  <td className="p-3">
                                    <TooltipProvider><Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStatusClick(returnItem);
                                          }}
                                          variant={returnItem.status === 'Returned' || stagedReturns.has(returnItem.id) ? 'default' : 'outline'}
                                          className={`cursor-pointer ${
                                            returnItem.status === 'Returned' 
                                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                                : stagedReturns.has(returnItem.id)
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    : 'text-yellow-800 bg-yellow-100 border-yellow-200'
                                          }`}
                                        >
                                          {stagedReturns.has(returnItem.id) ? 'RETURN' : returnItem.status}
                                        </Badge>
                                      </TooltipTrigger>
                                      {returnItem.status === 'Returned' && returnItem.date_returned && (<TooltipContent>Returned on: {(() => {
                                        try {
                                          const d = toMountainTime(returnItem.date_returned);
                                          return !isNaN(d.getTime()) ? format(d, "MMM d, yyyy, h:mm a") : '';
                                        } catch (e) { return ''; }
                                      })()}</TooltipContent>)}
                                    </Tooltip></TooltipProvider>
                                  </td>
                                </tr>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => openModal(setShowReceiveCreditModal, returnItem)}>
                                  <CreditCard className="w-4 h-4 mr-2" /> Receive Credit/Refund
                                </ContextMenuItem>
                                <ContextMenuItem disabled={returnItem.status === 'Returned' || returnItem.return_type === 'warranty' || returnItem.return_type === 'core'} onClick={() => handleReturnToInventory(returnItem)}>
                                  <ArchiveRestore className="w-4 h-4 mr-2" /> Return to Inventory
                                </ContextMenuItem>
                                <ContextMenuItem disabled={returnItem.status === 'Returned'} onClick={() => openModal(setShowChangeSupplierModal, returnItem)}>
                                  <Truck className="w-4 h-4 mr-2" /> Change Supplier
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => openModal(setShowEditReturnInfoModal, returnItem)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit Return Info
                                </ContextMenuItem>
                                {returnItem.work_order_id && (
                                  <ContextMenuItem onClick={() => handleOpenWorkOrder(returnItem.work_order_id)}>
                                    <ExternalLink className="w-4 h-4 mr-2" /> Open Work Order
                                  </ContextMenuItem>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );})
            ) : (
              <Card className="text-center py-12"><CardContent>
                <div className="text-slate-400 mb-4"><RotateCcw className="w-12 h-12 mx-auto" /></div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Returns Found</h3>
                <p className="text-slate-600">{searchTerm ? 'No returns match your search.' : 'No parts have been returned yet.'}</p>
              </CardContent></Card>
            )}
          </div>
        </div>
      </div>
      
      {stagedReturns.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white shadow-xl border rounded-lg p-4 z-50 flex gap-4 items-center animate-in slide-in-from-bottom-5">
            <div className="flex items-center gap-2">
                <span className="font-semibold text-sm whitespace-nowrap">{stagedReturns.size} item{stagedReturns.size !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Sent Back Date:</label>
                <Input 
                    type="date" 
                    value={bulkReturnDate} 
                    onChange={(e) => setBulkReturnDate(e.target.value)}
                    className="w-40"
                />
            </div>
            <Button onClick={handleBulkReturn} className="bg-blue-600 hover:bg-blue-700 text-white">
                Mark Returned
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setStagedReturns(new Set())} className="h-8 w-8 ml-2">
                <ArrowUpDown className="w-4 h-4 rotate-45" />
            </Button>
        </div>
      )}

      <ChangeSupplierModal open={showChangeSupplierModal} onClose={() => setShowChangeSupplierModal(false)} returnItem={selectedReturnItem} onSupplierChange={handleUpdate} />
      <ReceiveCreditModal open={showReceiveCreditModal} onClose={() => setShowReceiveCreditModal(false)} returnItem={selectedReturnItem} onUpdate={handleUpdate} />
      <EditReturnInfoModal open={showEditReturnInfoModal} onClose={() => setShowEditReturnInfoModal(false)} returnItem={selectedReturnItem} onUpdate={handleUpdate} />
      <LegacyWarrantyReturnModal open={showLegacyWarrantyModal} onClose={() => setShowLegacyWarrantyModal(false)} onUpdate={handleUpdate} />
    </>
  );
}