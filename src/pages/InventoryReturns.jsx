import React, { useState, useEffect } from 'react';
import { InventoryReturn, InventoryItem, Supplier } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  FileWarning
} from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import ChangeSupplierModal from '../components/inventory/ChangeSupplierModal';
import ReceiveCreditModal from '../components/inventory/ReceiveCreditModal';
import EditReturnInfoModal from '../components/inventory/EditReturnInfoModal';
import LegacyWarrantyReturnModal from '../components/inventory/LegacyWarrantyReturnModal';

export default function InventoryReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showChangeSupplierModal, setShowChangeSupplierModal] = useState(false);
  const [showReceiveCreditModal, setShowReceiveCreditModal] = useState(false);
  const [showEditReturnInfoModal, setShowEditReturnInfoModal] = useState(false);
  const [showLegacyWarrantyModal, setShowLegacyWarrantyModal] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState(null);

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
      const suppliersData = await Supplier.list();
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'Unknown Supplier';
  };

  const handleStatusToggle = async (returnItem) => {
    const newStatus = returnItem.status === 'On-site' ? 'Returned' : 'On-site';
    const updateData = {
      status: newStatus,
      date_returned: newStatus === 'Returned' ? new Date().toISOString() : null,
      sent_back: newStatus === 'Returned' ? format(new Date(), 'yyyy-MM-dd') : 'N/A',
    };
    try {
      await InventoryReturn.update(returnItem.id, updateData);
      loadReturns();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status.');
    }
  };

  const handleReturnToInventory = async (returnItem) => {
    if (!returnItem.inventory_item_id) {
      alert("Cannot return to inventory: Original item link is missing.");
      return;
    }
    if (window.confirm(`Are you sure you want to return ${returnItem.quantity_returned} of ${returnItem.part_number} to inventory? This will delete the return record.`)) {
      try {
        const originalItem = await InventoryItem.get(returnItem.inventory_item_id);
        const newQOH = (originalItem.quantity_on_hand || 0) + returnItem.quantity_returned;
        await InventoryItem.update(originalItem.id, { quantity_on_hand: newQOH });
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
    return !searchTerm ||
      returnItem.part_number?.toLowerCase().includes(searchLower) ||
      returnItem.description?.toLowerCase().includes(searchLower) ||
      supplierName.toLowerCase().includes(searchLower) ||
      returnItem.return_reason?.toLowerCase().includes(searchLower);
  });

  const returnsBySupplier = filteredReturns.reduce((acc, returnItem) => {
    const supplierName = getSupplierName(returnItem.supplier);
    if (!acc[supplierName]) {
      acc[supplierName] = [];
    }
    acc[supplierName].push(returnItem);
    return acc;
  }, {});

  // Sort suppliers alphabetically and parts within each supplier by part number
  const sortedSupplierNames = Object.keys(returnsBySupplier).sort((a, b) => a.localeCompare(b));
  
  sortedSupplierNames.forEach(supplierName => {
    returnsBySupplier[supplierName].sort((a, b) => 
      (a.part_number || '').localeCompare(b.part_number || '')
    );
  });

  const handlePrint = () => {
    window.print();
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
            <div className="flex gap-3">
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
                            <th className="text-left p-3 font-semibold text-slate-700">Part #</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Qty</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Cost</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Return Date</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Sent Back</th>
                            <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierReturns.map((returnItem) => (
                            <ContextMenu key={returnItem.id}>
                              <ContextMenuTrigger asChild>
                                <tr className="border-b hover:bg-slate-50 transition-colors">
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
                                  <td className="p-3"><span className="text-slate-600">{returnItem.return_date ? format(new Date(returnItem.return_date), 'MMM d, yyyy') : 'N/A'}</span></td>
                                  <td className="p-3"><span className="text-slate-600">{returnItem.sent_back && returnItem.sent_back !== 'N/A' ? format(new Date(returnItem.sent_back), 'MMM d, yyyy') : 'N/A'}</span></td>
                                  <td className="p-3">
                                    <TooltipProvider><Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          onClick={() => handleStatusToggle(returnItem)}
                                          variant={returnItem.status === 'Returned' ? 'default' : 'outline'}
                                          className={`cursor-pointer ${returnItem.status === 'Returned' ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-yellow-800 bg-yellow-100 border-yellow-200'}`}
                                        >{returnItem.status}</Badge>
                                      </TooltipTrigger>
                                      {returnItem.status === 'Returned' && returnItem.date_returned && (<TooltipContent>Returned on: {format(new Date(returnItem.date_returned), "MMM d, yyyy, h:mm a")}</TooltipContent>)}
                                    </Tooltip></TooltipProvider>
                                  </td>
                                </tr>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem disabled={returnItem.status === 'On-site'} onClick={() => openModal(setShowReceiveCreditModal, returnItem)}>
                                  <CreditCard className="w-4 h-4 mr-2" /> Receive Credit/Refund
                                </ContextMenuItem>
                                <ContextMenuItem disabled={returnItem.status === 'Returned'} onClick={() => handleReturnToInventory(returnItem)}>
                                  <ArchiveRestore className="w-4 h-4 mr-2" /> Return to Inventory
                                </ContextMenuItem>
                                <ContextMenuItem disabled={returnItem.status === 'Returned'} onClick={() => openModal(setShowChangeSupplierModal, returnItem)}>
                                  <Truck className="w-4 h-4 mr-2" /> Change Supplier
                                </ContextMenuItem>
                                <ContextMenuItem disabled={returnItem.status === 'Returned'} onClick={() => openModal(setShowEditReturnInfoModal, returnItem)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit Return Info
                                </ContextMenuItem>
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
      
      <ChangeSupplierModal open={showChangeSupplierModal} onClose={() => setShowChangeSupplierModal(false)} returnItem={selectedReturnItem} onSupplierChange={handleUpdate} />
      <ReceiveCreditModal open={showReceiveCreditModal} onClose={() => setShowReceiveCreditModal(false)} returnItem={selectedReturnItem} onUpdate={handleUpdate} />
      <EditReturnInfoModal open={showEditReturnInfoModal} onClose={() => setShowEditReturnInfoModal(false)} returnItem={selectedReturnItem} onUpdate={handleUpdate} />
      <LegacyWarrantyReturnModal open={showLegacyWarrantyModal} onClose={() => setShowLegacyWarrantyModal(false)} onUpdate={handleUpdate} />
    </>
  );
}