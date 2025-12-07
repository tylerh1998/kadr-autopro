import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, InventoryTxs, Supplier } from '@/entities/all';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Search, Package, AlertCircle, Printer } from 'lucide-react';
import { format } from 'date-fns';

export default function InventoryOnOrder() {
  const [inventoryData, setInventoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [allInventory, allSuppliers, recentTxs] = await Promise.all([
          InventoryItem.list(),
          Supplier.list(),
          InventoryTxs.filter({ tx_type: 'Ordered' }, '-tx_date', 1000)
        ]);

        const supplierMap = Object.fromEntries(allSuppliers.map(s => [s.id, s]));

        const itemsOnOrder = allInventory
          .filter(item => (item.quantity_on_order || 0) > 0)
          .map(item => {
            const supplier = supplierMap[item.supplier_id] || null;
            const recentOrderTx = recentTxs
              .filter(tx => tx.inventory_item_id === item.id)
              .sort((a, b) => new Date(b.tx_date) - new Date(a.tx_date))[0];

            return {
              ...item,
              supplier_name: supplier ? supplier.name : 'No Supplier',
              total_value: (item.quantity_on_order || 0) * (item.cost || 0),
              last_ordered_date: recentOrderTx ? recentOrderTx.tx_date : null,
              last_ordered_ro: recentOrderTx ? recentOrderTx.ro_number : null,
            };
          });

        setInventoryData(itemsOnOrder);

      } catch (err) {
        console.error('Error fetching inventory on order data:', err);
        setError('Failed to load inventory data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredItems = useMemo(() => {
    return inventoryData.filter(item => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return [
        item.part_number,
        item.description,
        item.supplier_name,
        item.last_ordered_ro,
        item.manufacturer
      ].some(field => (field || '').toLowerCase().includes(searchLower));
    });
  }, [inventoryData, searchTerm]);

  const totalItemsOnOrder = filteredItems.length;
  const totalQuantityOnOrder = filteredItems.reduce((sum, item) => sum + (item.quantity_on_order || 0), 0);
  const totalValueOnOrder = filteredItems.reduce((sum, item) => sum + item.total_value, 0);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the report.');
      return;
    }

    const tableRows = filteredItems.map(item => `
      <tr>
        <td>${item.part_number || '-'}</td>
        <td>${item.description || '-'}</td>
        <td>${item.manufacturer || '-'}</td>
        <td style="text-align: center;">${item.quantity_on_order || 0}</td>
        <td style="text-align: right;">$${(item.cost || 0).toFixed(2)}</td>
        <td style="text-align: right;">$${item.total_value.toFixed(2)}</td>
        <td>${item.supplier_name}</td>
        <td>${item.last_ordered_date ? format(new Date(item.last_ordered_date), 'MMM d, yyyy') : '-'}</td>
        <td>${item.last_ordered_ro || '-'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Inventory On Order Report</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            h1, h2 { text-align: center; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            @page { size: landscape; }
          </style>
        </head>
        <body>
          <h1>Inventory On Order Report</h1>
          <h2>${format(new Date(), 'MMMM d, yyyy')}</h2>
          <p>
            <strong>Total Items on Order:</strong> ${totalItemsOnOrder} | 
            <strong>Total Quantity on Order:</strong> ${totalQuantityOnOrder} | 
            <strong>Total Value on Order:</strong> $${totalValueOnOrder.toFixed(2)}
          </p>
          <table>
            <thead>
              <tr>
                <th>Part Number</th>
                <th>Description</th>
                <th>Manufacturer</th>
                <th>Qty on Order</th>
                <th>Cost Each</th>
                <th>Total Value</th>
                <th>Supplier</th>
                <th>Last Ordered</th>
                <th>RO Number</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center"><Skeleton className="h-8 w-64" /><Skeleton className="h-10 w-80" /></div>
        <div className="grid grid-cols-3 gap-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" /><p className="text-lg font-semibold mb-2">Error Loading Data</p><p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Inventory On Order</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search report..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700" disabled={filteredItems.length === 0}>
            <Printer className="w-4 h-4 mr-2" />
            Print Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-blue-600 font-semibold">Items on Order</div>
          <div className="text-2xl font-bold text-blue-800">{totalItemsOnOrder}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-amber-600 font-semibold">Total Quantity</div>
          <div className="text-2xl font-bold text-amber-800">{totalQuantityOnOrder}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-green-600 font-semibold">Total Value</div>
          <div className="text-2xl font-bold text-green-800">${totalValueOnOrder.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-8 text-center">
        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">Full Report Ready for Printing</h3>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          The summary above reflects the items found based on your search. Click the "Print Report" button to view the full, detailed list in a new, printer-friendly window.
        </p>
      </div>
    </div>
  );
}