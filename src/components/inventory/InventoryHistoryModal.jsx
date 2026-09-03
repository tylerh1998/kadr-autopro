import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createPageUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ModalCloseButton from '@/components/ui/modal-close-button';
import { History, PackageX, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { formatAuditUserDisplay } from '@/utils/userDisplayUtils';

export default function InventoryHistoryModal({ open, onClose, partNumber, inventoryItemId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPartNumber, setCurrentPartNumber] = useState(partNumber);
  const [suppliers, setSuppliers] = useState([]);

  const loadSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('Supplier').select('*');
      if (error) throw error;
      setSuppliers(data || []);
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
      'Received': 'text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30',
      'Ordered': 'text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/30',
      'Issued to WO': 'text-red-700 dark:text-red-300 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30',
      'Returned from WO': 'text-green-700 dark:text-green-300 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/30',
      'QOH Adjusted': 'text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30',
      'Returned to Supplier': 'text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30'
    };

    return (
      <Badge variant="outline" className={`${typeStyles[txType] || 'text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'} font-medium`}>
        {txType}
      </Badge>
    );
  };

  const renderQuantityChanges = (tx) => {
    const qohChange = tx.quantity_change || 0;
    const orderedChange = tx.quantity_ordered_change || 0;
    
    if (qohChange === 0 && orderedChange === 0) {
      return <span className="text-slate-400 dark:text-slate-500 flex items-center"><Minus className="w-3 h-3" /></span>;
    }

    return (
      <div className="space-y-2 text-sm">
        {qohChange !== 0 && (
          <div className={qohChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            <div className="flex items-center gap-1">
              {qohChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span className="font-medium">{qohChange > 0 ? '+' : ''}{qohChange} QOH</span>
            </div>
            <div className="pl-4 text-xs text-slate-500 dark:text-slate-400">
              {tx.old_quantity ?? 0} &rarr; {tx.new_quantity ?? 0}
            </div>
          </div>
        )}
        {orderedChange !== 0 && (
          <div className={orderedChange > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}>
            <div className="flex items-center gap-1">
              {orderedChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span className="font-medium">{orderedChange > 0 ? '+' : ''}{orderedChange} QOO</span>
            </div>
            <div className="pl-4 text-xs text-slate-500 dark:text-slate-400">
              {tx.old_quantity_on_order ?? 0} &rarr; {tx.new_quantity_on_order ?? 0}
            </div>
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
        <div key="ro" className="text-xs font-mono text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => handleOpenRO(tx.ro_number)}>
          RO: {tx.ro_number}
        </div>
      );
    }
    
    if (tx.supplier_inv) {
      refs.push(
        <div key="inv" className="text-xs font-mono text-green-600 dark:text-green-400">
          Inv: {tx.supplier_inv}
        </div>
      );
    }

    return refs.length > 0 ? <div className="space-y-1">{refs}</div> : <span className="text-slate-400 dark:text-slate-500">-</span>;
  };

  const renderSupplier = (tx) => {
    const supplierName = getSupplierName(tx.supplier_name);
    return (
      <span className="text-sm text-slate-600 dark:text-slate-400">
        {supplierName}
      </span>
    );
  };

  return (
    <TooltipProvider>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col [&>button:last-child]:hidden">
        <ModalCloseButton onClick={onClose} />
        <DialogHeader className="pr-16">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-6 h-6" />
            Inventory History: {currentPartNumber}
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
              <div className="text-center py-10 text-red-500 dark:text-red-400">{error}</div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                <PackageX className="w-10 h-10" />
                <p>No transaction history found for this part.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
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
                    <TableRow key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <TableCell className="text-sm">
                        {tx.tx_date ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-default w-fit">
                                <div>{format(new Date(tx.tx_date), 'MMM d, yyyy')}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(tx.tx_date), 'h:mm a')}</div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatAuditUserDisplay(tx.created_by)}
                            </TooltipContent>
                          </Tooltip>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell>{getTxTypeBadge(tx.tx_type)}</TableCell>
                      <TableCell>{renderReference(tx)}</TableCell>
                      <TableCell>{renderQuantityChanges(tx)}</TableCell>
                      <TableCell>{renderSupplier(tx)}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">
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
    </TooltipProvider>
  );
}