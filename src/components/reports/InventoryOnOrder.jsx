import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { createPageUrl } from '../../utils';
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
        // Use backend function for real-time calculation from Work Orders
        const response = await supabase.functions.invoke('autopro-getRealTimeInventoryOnOrder');

        if (response.error) throw response.error;

        if (response.data && response.data.success) {
           setInventoryData(response.data.data);
        } else {
           throw new Error(response.data?.error || 'Failed to fetch real-time data');
        }

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

  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const supplier = item.supplier_name || 'No Supplier';
      if (!acc[supplier]) {
        acc[supplier] = [];
      }
      acc[supplier].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const sortedSuppliers = useMemo(() => {
    return Object.keys(groupedItems).sort();
  }, [groupedItems]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the report.');
      return;
    }

    const reportContent = sortedSuppliers.map(supplier => {
      const items = groupedItems[supplier];
      const tableRows = items.map(item => `
        <tr>
          <td>${item.part_number || '-'}</td>
          <td>${item.description || '-'}</td>
          <td style="text-align: center;">${item.quantity_on_order || 0}</td>
          <td style="text-align: center;">${item.last_ordered_date ? format(new Date(item.last_ordered_date), 'MMM d, yyyy') : '-'}</td>
          <td style="text-align: center;">${item.last_ordered_ro || '-'}</td>
        </tr>
      `).join('');

      return `
        <div style="margin-bottom: 20px; page-break-inside: avoid;">
          <h3 style="margin-bottom: 10px; border-bottom: 2px solid #ddd; padding-bottom: 5px; color: #333;">${supplier}</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 20%">Part #</th>
                <th style="width: 40%">Description</th>
                <th style="width: 10%">Qty on Order</th>
                <th style="width: 15%">Date Ordered</th>
                <th style="width: 15%">WO#</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Inventory On Order Report</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            h1, h2 { text-align: center; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            @page { size: landscape; }
          </style>
        </head>
        <body>
          <h1>Inventory On Order Report</h1>
          <h2>${format(new Date(), 'MMMM d, yyyy')}</h2>
          ${reportContent}
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

      <div className="space-y-6 pr-2">
        {sortedSuppliers.map(supplier => (
          <div key={supplier} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
             <div className="bg-slate-50 px-4 py-2 font-semibold text-slate-800 border-b border-slate-200 flex justify-between items-center">
               <span>{supplier}</span>
               <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                 {groupedItems[supplier].length} items
               </span>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-white text-slate-500 font-medium border-b border-slate-100">
                   <tr>
                     <th className="px-4 py-2">Part #</th>
                     <th className="px-4 py-2">Description</th>
                     <th className="px-4 py-2 text-center">Qty on Order</th>
                     <th className="px-4 py-2 text-center">Date Ordered</th>
                     <th className="px-4 py-2 text-center">WO#</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {groupedItems[supplier].map(item => (
                     <tr key={item.id} className="hover:bg-slate-50">
                       <td className="px-4 py-2 font-medium text-slate-700">{item.part_number}</td>
                       <td className="px-4 py-2 text-slate-600">{item.description}</td>
                       <td className="px-4 py-2 text-center text-slate-700 font-medium">{item.quantity_on_order}</td>
                       <td className="px-4 py-2 text-center text-slate-500">
                         {item.last_ordered_date ? format(new Date(item.last_ordered_date), 'MMM d, yyyy') : '-'}
                       </td>
                       <td className="px-4 py-2 text-center text-slate-500">
                         {item.last_ordered_ro ? (
                           <span 
                             className="text-blue-600 hover:underline cursor-pointer"
                             onClick={() => window.open(createPageUrl('WorkOrderEdit') + '?id=' + item.last_ordered_ro, '_blank')}
                           >
                             {item.last_ordered_ro}
                           </span>
                         ) : '-'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        ))}
        
        {filteredItems.length === 0 && (
           <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
             <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
             <p>No items found matching your search.</p>
           </div>
        )}
      </div>
    </div>
  );
}