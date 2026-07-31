import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { History, Search, PackageX, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';

export default function InventoryHistoryModal({ open, onClose, partNumber, inventoryItemId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPartNumber, setCurrentPartNumber] = useState(partNumber);
  const [suppliers, setSuppliers] = useState([]);

  const loadSuppliers = useCallback(async () => {
    try {
      const response = await base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Supplier' });
      setSuppliers(response.data?.data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadSuppliers();
    }
  }, [open, loadSuppliers]); // Add loadSuppliers to dependencies because it's defined in the component scope.

  const getSupplierName = (supplierNameOrId) => {
    if (!supplierNameOrId) return '-';
    
    // First, try to find by ID
    const supplierById = suppliers.find(s => s.id === supplierNameOrId);
    if (supplierById) return supplierById.name;
    
    // If not found by ID, assume it's already a name and return it
    // (This handles cases where supplier_name was already populated as a string)
    return supplierNameOrId;
  };

  const fetchHistory = useCallback(async (pn) => {
    if (!pn) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      let data = [];
      if (inventoryItemId) {
        const { data: logData, error } = await supabase
          .from('InventoryAuditLog')
          .select('*')
          .eq('inventory_item_id', inventoryItemId)
          .order('tx_date', { ascending: false });
        if (error) throw error;
        data = logData;
      } else {
        // Fallback to searching by part number and then finding inventory_item_id
        const { data: inventoryItems, error: itemError } = await supabase
          .from('InventoryItem')
          .select('id')
          .eq('part_number', pn);
          
        if (itemError) throw itemError;
        
        if (inventoryItems && inventoryItems.length > 0) {
          const itemIds = inventoryItems.map(i => i.id);
          const { data: logData, error } = await supabase
            .from('InventoryAuditLog')
            .select('*')
            .in('inventory_item_id', itemIds)
            .order('tx_date', { ascending: false });
          if (error) throw error;
          data = logData;
        } else {
          // Last fallback to old part_num field for backward compatibility
          const { data: logData, error } = await supabase
            .from('InventoryAuditLog')
            .select('*')
            .eq('part_num', pn)
            .order('tx_date', { ascending: false });
          if (error) throw error;
          data = logData;
        }
      }
      
      // Ensure data is sorted with newest at the top
      const sortedData = (data || []).sort((a, b) => new Date(b.tx_date || b.created_at) - new Date(a.tx_date || a.created_at));
      setTransactions(sortedData);
    } catch (err) {
      console.error('Error fetching inventory history:', err);
      setError('Failed to fetch transaction history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [inventoryItemId]);

  useEffect(() => {
    if (open) {
      setCurrentPartNumber(partNumber);
      fetchHistory(partNumber);
    }
  }, [open, partNumber, fetchHistory]);

  const getTxTypeBadge = (txType) => {
    const typeStyles = {
      'Received': 'text-blue-700 border-blue-300 bg-blue-50',
      'Ordered': 'text-yellow-700 border-yellow-300 bg-yellow-50',
      'Issued to WO': 'text-red-700 border-red-300 bg-red-50',
      'Returned from WO': 'text-green-700 border-green-300 bg-green-50',
      'QOH Adjusted': 'text-purple-700 border-purple-300 bg-purple-50',
      'Returned to Supplier': 'text-orange-700 border-orange-300 bg-orange-50'
    };

    return (
      <Badge variant="outline" className={`${typeStyles[txType] || 'text-gray-700 border-gray-300 bg-gray-50'} font-medium`}>
        {txType}
      </Badge>
    );
  };

  const renderQuantityChanges = (tx) => {
    const qohChange = tx.quantity_change || 0;
    const orderedChange = tx.quantity_ordered_change || 0;
    
    if (qohChange === 0 && orderedChange === 0) {
      return <span className="text-slate-400 flex items-center"><Minus className="w-3 h-3" /></span>;
    }

    return (
      <div className="space-y-1 text-sm">
        {qohChange !== 0 && (
          <div className={`flex items-center gap-1 ${qohChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {qohChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span className="font-medium">QOH: {qohChange > 0 ? '+' : ''}{qohChange}</span>
          </div>
        )}
        {orderedChange !== 0 && (
          <div className={`flex items-center gap-1 ${orderedChange > 0 ? 'text-blue-600' : 'text-gray-600'}`}>
            {orderedChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span className="font-medium">Ordered: {orderedChange > 0 ? '+' : ''}{orderedChange}</span>
          </div>
        )}
      </div>
    );
  };

  const handleOpenRO = (roNumber) => {
    const url = createPageUrl(`WorkOrderEdit?id=${roNumber}`);
    window.open(url, '_blank', 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
  };

  const renderReference = (tx) => {
    const refs = [];
    
    if (tx.ro_number) {
      refs.push(
        <div key="ro" className="text-xs font-mono text-blue-600 cursor-pointer hover:underline" onClick={() => handleOpenRO(tx.ro_number)}>
          RO: {tx.ro_number}
        </div>
      );
    }
    
    if (tx.supplier_inv) {
      refs.push(
        <div key="inv" className="text-xs font-mono text-green-600">
          Inv: {tx.supplier_inv}
        </div>
      );
    }
    
    return refs.length > 0 ? <div className="space-y-1">{refs}</div> : <span className="text-slate-400">-</span>;
  };

  const renderSupplier = (tx) => {
    const supplierName = getSupplierName(tx.supplier_name);
    return (
      <span className="text-sm text-slate-600">
        {supplierName}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-6 h-6" />
              Inventory History: {currentPartNumber}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            View the complete transaction history for this inventory item.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {loading ? (
              <div className="space-y-2">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : error ? (
              <div className="text-center py-10 text-red-500">{error}</div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
                <PackageX className="w-10 h-10" />
                <p>No transaction history found for this part.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead className="w-40">Transaction Type</TableHead>
                    <TableHead className="w-32">Reference</TableHead>
                    <TableHead className="w-40">Quantity Changes</TableHead>
                    <TableHead className="w-32">Supplier</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm">
                        {tx.tx_date ? format(new Date(tx.tx_date), 'MMM d, yyyy\nh:mm a') : 'N/A'}
                      </TableCell>
                      <TableCell>{getTxTypeBadge(tx.tx_type)}</TableCell>
                      <TableCell>{renderReference(tx)}</TableCell>
                      <TableCell>{renderQuantityChanges(tx)}</TableCell>
                      <TableCell>{renderSupplier(tx)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {tx.description || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}