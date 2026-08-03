import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Package, Search, DollarSign, Printer, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function InventoryValuationPage() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState('all'); // 'all', 'category', 'supplier'
  const [sortColumn, setSortColumn] = useState('part_number');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.InventoryItem.filter({ is_active: true });
      setInventory(items);
    } catch (error) {
      console.error('Error loading inventory:', error);
      alert('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const search = searchTerm.toLowerCase();
    return (
      item.part_number?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search)
    );
  });

  const calculateTotalValue = (items) => {
    return items.reduce((sum, item) => {
      const qty = item.quantity_on_hand || 0;
      const cost = item.cost || 0;
      return sum + (qty * cost);
    }, 0);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortItems = (items) => {
    return [...items].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortColumn) {
        case 'part_number':
          aVal = a.part_number || '';
          bVal = b.part_number || '';
          break;
        case 'description':
          aVal = a.description || '';
          bVal = b.description || '';
          break;
        case 'qoh':
          aVal = a.quantity_on_hand || 0;
          bVal = b.quantity_on_hand || 0;
          break;
        case 'cost':
          aVal = a.cost || 0;
          bVal = b.cost || 0;
          break;
        case 'total_value':
          aVal = (a.quantity_on_hand || 0) * (a.cost || 0);
          bVal = (b.quantity_on_hand || 0) * (b.cost || 0);
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortDirection === 'asc' 
          ? aVal - bVal
          : bVal - aVal;
      }
    });
  };

  const groupedInventory = () => {
    if (groupBy === 'all') {
      return [{ name: 'All Items', items: sortItems(filteredInventory) }];
    } else if (groupBy === 'category') {
      const grouped = {};
      filteredInventory.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });
      return Object.entries(grouped).map(([name, items]) => ({ name, items: sortItems(items) }));
    } else if (groupBy === 'supplier') {
      const grouped = {};
      filteredInventory.forEach(item => {
        const sup = item.vendor || 'No Supplier';
        if (!grouped[sup]) grouped[sup] = [];
        grouped[sup].push(item);
      });
      return Object.entries(grouped).map(([name, items]) => ({ name, items: sortItems(items) }));
    }
  };

  const totalInventoryValue = calculateTotalValue(filteredInventory);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            background: white !important;
          }
          
          body > div > div > header,
          body > div > header,
          body header,
          header {
            display: none !important;
          }
          
          @page {
            margin: 15mm;
            size: portrait;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Inventory Valuation</h1>
            <p className="text-slate-600 mt-1 dark:text-slate-400">Current stock levels and values</p>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/40">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Inventory Value</p>
                <h3 className="text-4xl font-bold text-blue-900 dark:text-blue-300">
                  ${totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  {filteredInventory.length} items • {filteredInventory.reduce((sum, item) => sum + (item.quantity_on_hand || 0), 0)} total units
                </p>
              </div>
              <div className="h-20 w-20 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                <DollarSign className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Group Controls */}
        <div className="flex flex-wrap gap-4 items-end no-print">
          <div className="flex-1 min-w-[200px]">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search by part number, description, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Label>Group By</Label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
            >
              <option value="all">All Items</option>
              <option value="category">Category</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
        </div>

        {/* Inventory Groups */}
        <div className="space-y-6">
          {groupedInventory().map((group) => (
            <Card key={group.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    {group.name}
                  </CardTitle>
                  <Badge variant="outline" className="text-sm">
                    Value: ${calculateTotalValue(group.items).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                      <tr>
                        <th 
                          className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 no-print"
                          onClick={() => handleSort('part_number')}
                        >
                          <div className="flex items-center gap-2">
                            Part Number
                            {sortColumn === 'part_number' ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 no-print"
                          onClick={() => handleSort('description')}
                        >
                          <div className="flex items-center gap-2">
                            Description
                            {sortColumn === 'description' ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 no-print"
                          onClick={() => handleSort('qoh')}
                        >
                          <div className="flex items-center justify-center gap-2">
                            QOH
                            {sortColumn === 'qoh' ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 no-print"
                          onClick={() => handleSort('cost')}
                        >
                          <div className="flex items-center justify-end gap-2">
                            Cost
                            {sortColumn === 'cost' ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 no-print"
                          onClick={() => handleSort('total_value')}
                        >
                          <div className="flex items-center justify-end gap-2">
                            Total Value
                            {sortColumn === 'total_value' ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-slate-500 dark:text-slate-400">
                            No items found
                          </td>
                        </tr>
                      ) : (
                        group.items.map((item) => {
                          const qty = item.quantity_on_hand || 0;
                          const cost = item.cost || 0;
                          const totalValue = qty * cost;

                          return (
                            <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{item.part_number}</td>
                              <td className="p-3 text-slate-700 dark:text-slate-300">{item.description}</td>
                              <td className="p-3 text-center">{qty}</td>
                              <td className="p-3 text-right">${cost.toFixed(2)}</td>
                              <td className="p-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                                ${totalValue.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                      {group.items.length > 0 && (
                        <tr className="bg-slate-100 dark:bg-slate-800 font-bold">
                          <td colSpan="4" className="p-3 text-right">Subtotal:</td>
                          <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                            ${calculateTotalValue(group.items).toFixed(2)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}