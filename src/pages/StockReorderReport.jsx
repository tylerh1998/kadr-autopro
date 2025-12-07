import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Printer, Loader2, AlertTriangle } from 'lucide-react';

export default function StockReorderReport() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    setLoading(true);
    try {
      // Fetch all active inventory items
      const inventoryItems = await base44.entities.InventoryItem.filter({ is_active: true });
      
      // Filter items that need reordering (QOH < Min Qty)
      const itemsNeedingReorder = inventoryItems.filter(item => 
        (item.quantity_on_hand || 0) < (item.minimum_quantity || 0)
      );

      // Fetch all suppliers
      const suppliersData = await base44.entities.Supplier.list();
      setSuppliers(suppliersData);

      // Group items by supplier
      const groupedBySupplier = itemsNeedingReorder.reduce((acc, item) => {
        const supplierId = item.supplier_id || 'no_supplier';
        if (!acc[supplierId]) {
          acc[supplierId] = [];
        }
        
        // Calculate reorder quantity
        const reorderQty = Math.max(0, (item.maximum_quantity || 0) - (item.quantity_on_hand || 0));
        
        acc[supplierId].push({
          ...item,
          reorder_qty: reorderQty
        });
        return acc;
      }, {});

      // Convert to array format for rendering
      const reportArray = Object.entries(groupedBySupplier).map(([supplierId, items]) => {
        const supplier = suppliersData.find(s => s.id === supplierId);
        return {
          supplierId,
          supplierName: supplier ? supplier.name : 'No Supplier Assigned',
          items: items.sort((a, b) => a.part_number.localeCompare(b.part_number))
        };
      }).sort((a, b) => a.supplierName.localeCompare(b.supplierName));

      setReportData(reportArray);
    } catch (error) {
      console.error('Error loading stock reorder report:', error);
      alert('Failed to load report data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    window.close();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading stock reorder report...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print-area {
            padding: 20px;
          }
          .page-break {
            page-break-after: always;
          }
        }
      `}</style>

      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header - No Print */}
          <div className="flex items-center justify-between mb-6 no-print">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <h1 className="text-3xl font-bold text-slate-900">Stock Reorder Report</h1>
            </div>
            <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>

          {/* Print Area */}
          <div className="print-area">
            {/* Print Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold mb-2">Stock Reorder Report</h1>
              <p className="text-slate-600">Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
            </div>

            {reportData.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <AlertTriangle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">All Stock Levels Good</h2>
                  <p className="text-slate-600">No items are currently below their minimum quantity threshold.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {reportData.map((supplierGroup, index) => (
                  <Card key={supplierGroup.supplierId} className={index < reportData.length - 1 ? 'page-break' : ''}>
                    <CardHeader className="bg-slate-100">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        {supplierGroup.supplierName}
                        <span className="text-sm font-normal text-slate-600 ml-2">
                          ({supplierGroup.items.length} {supplierGroup.items.length === 1 ? 'item' : 'items'})
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="font-semibold">Part Number</TableHead>
                            <TableHead className="font-semibold">Description</TableHead>
                            <TableHead className="text-center font-semibold">QOH</TableHead>
                            <TableHead className="text-center font-semibold">Min</TableHead>
                            <TableHead className="text-center font-semibold">Max</TableHead>
                            <TableHead className="text-center font-semibold text-orange-700">Reorder Qty</TableHead>
                            <TableHead className="text-right font-semibold">Cost</TableHead>
                            <TableHead className="text-right font-semibold">Total Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {supplierGroup.items.map((item) => (
                            <TableRow key={item.id} className="hover:bg-slate-50">
                              <TableCell className="font-medium">{item.part_number}</TableCell>
                              <TableCell>{item.description || '-'}</TableCell>
                              <TableCell className="text-center text-red-600 font-semibold">
                                {item.quantity_on_hand || 0}
                              </TableCell>
                              <TableCell className="text-center">{item.minimum_quantity || 0}</TableCell>
                              <TableCell className="text-center">{item.maximum_quantity || 0}</TableCell>
                              <TableCell className="text-center font-bold text-orange-700">
                                {item.reorder_qty}
                              </TableCell>
                              <TableCell className="text-right">
                                ${(item.cost || 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                ${((item.cost || 0) * item.reorder_qty).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-slate-100 font-bold">
                            <TableCell colSpan={7} className="text-right">
                              Supplier Total:
                            </TableCell>
                            <TableCell className="text-right">
                              ${supplierGroup.items.reduce((sum, item) => 
                                sum + ((item.cost || 0) * item.reorder_qty), 0
                              ).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}

                {/* Grand Total */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-slate-600">Total Items Needing Reorder</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {reportData.reduce((sum, group) => sum + group.items.length, 0)} items
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">Estimated Total Reorder Cost</p>
                        <p className="text-2xl font-bold text-blue-700">
                          ${reportData.reduce((sum, group) => 
                            sum + group.items.reduce((itemSum, item) => 
                              itemSum + ((item.cost || 0) * item.reorder_qty), 0
                            ), 0
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}