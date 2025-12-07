import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SupplierInvoiceLine, Supplier, InventoryTxs } from '@/entities/all';
import { Loader2, Edit, Trash2, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import EditInventoryTransactionModal from './EditInventoryTransactionModal';

export default function InventoryTransactionsModal({ isOpen, onClose, inventoryItemId }) {
  const [transactions, setTransactions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  useEffect(() => {
    if (isOpen && inventoryItemId) {
      loadData();
    }
  }, [isOpen, inventoryItemId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [invoiceLines, suppliersData, inventoryTxsData] = await Promise.all([
        SupplierInvoiceLine.filter({ inventory_item_id: inventoryItemId }, '-invoice_date'),
        Supplier.list(),
        InventoryTxs.filter({ inventory_item_id: inventoryItemId, tx_type: 'Received' })
      ]);

      // Create a map of InventoryTxs by source_record_id for quick lookup
      const txsMap = {};
      inventoryTxsData.forEach(tx => {
        if (tx.source_record_id) {
          txsMap[tx.source_record_id] = tx;
        }
      });

      // Augment invoice lines with quantity data from InventoryTxs
      const augmentedTransactions = invoiceLines.map(line => {
        const correspondingTx = txsMap[line.id];
        let quantity = 1; // Default fallback
        
        if (correspondingTx) {
          quantity = Math.abs(correspondingTx.quantity_change || 0);
        } else if (line.description) {
          // Try to parse quantity from description pattern: "AddPart/x[qty]/[part_number]"
          const qtyMatch = line.description.match(/x(\d+(?:\.\d+)?)\//);
          if (qtyMatch) {
            quantity = parseFloat(qtyMatch[1]);
          }
        }

        const charge = parseFloat(line.purchase_amount) || 0;
        const amountPerUnit = quantity > 0 ? charge / quantity : charge;

        return {
          ...line,
          quantity,
          amountPerUnit,
          charge
        };
      });

      setTransactions(augmentedTransactions);
      setSuppliers(suppliersData);
    } catch (err) {
      console.error('Error loading transaction data:', err);
      setError('Failed to load transaction data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'Unknown Supplier';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '$0.00';
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  const formatQuantity = (qty) => {
    if (qty == null) return '0';
    // Remove trailing zeros after decimal point
    return parseFloat(qty).toString();
  };

  // Helper to check if a description indicates a core line
  const isCoreLine = (description) => {
    return description && description.startsWith('AddCore/');
  };

  // Helper to check if a description indicates a reversal line
  const isReversalLine = (description) => {
    return description && description.startsWith('REVERSAL:');
  };

  // Handler to open edit modal
  const handleEdit = (transaction) => {
    setSelectedTransaction(transaction);
    setShowEditModal(true);
  };

  // Handler for edit modal close with refresh
  const handleEditModalClose = () => {
    setShowEditModal(false);
    setSelectedTransaction(null);
  };

  // Handler for successful edit - refresh data
  const handleEditSuccess = () => {
    loadData(); // Refresh the transactions list
  };

  // Handler to initiate delete - shows confirmation dialog
  const handleDeleteClick = (transaction) => {
    setTransactionToDelete(transaction);
    setDeleteConfirmOpen(true);
  };

  // Handler for confirmed delete - calls backend
  const handleDeleteConfirm = async () => {
    if (!transactionToDelete) return;

    setDeleting(true);
    setError(null);
    setDeleteConfirmOpen(false);

    try {
      const response = await base44.functions.invoke('processInventoryReceipt', {
        action: 'reverse',
        supplier_invoice_line_id: transactionToDelete.id
      });

      if (response.data && response.data.success) {
        // Success - refresh the data
        await loadData();
        
        // Show success message briefly
        const successMsg = response.data.message || 'Transaction reversed successfully';
        setError(null);
        
        // Optional: Show a temporary success indicator
        console.log('✅ Transaction reversed:', successMsg);
      } else {
        // Backend returned error
        const errorMessage = response.data?.message || response.data?.error || 'Failed to reverse transaction';
        setError(errorMessage);
        console.error('Reverse failed:', response.data);
      }
    } catch (err) {
      console.error('Error reversing transaction:', err);
      setError(err.message || 'An unexpected error occurred while reversing the transaction');
    } finally {
      setDeleting(false);
      setTransactionToDelete(null);
    }
  };

  // Handler for cancel delete
  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setTransactionToDelete(null);
  };

  // Check if transaction is locked (has been paid)
  const isTransactionLocked = (transaction) => {
    return (transaction.paid_amount || 0) > 0;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={deleting ? undefined : onClose}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Supplier Invoice Transactions</DialogTitle>
            <DialogDescription>
              View all supplier invoice lines associated with this inventory item. Right-click for actions.
            </DialogDescription>
          </DialogHeader>

          {/* Global Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-700"
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Deleting Overlay */}
          {deleting && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Reversing Transaction</p>
                <p className="text-sm text-blue-700 mt-0.5">Please wait while we process the reversal...</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-slate-600">Loading transactions...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
              <p className="text-slate-600">No transactions found for this inventory item.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount Per Unit</TableHead>
                    <TableHead className="text-right">Charge</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="w-20">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => {
                    const isReversal = isReversalLine(transaction.description);
                    const isCore = isCoreLine(transaction.description);
                    const isLocked = isTransactionLocked(transaction);
                    
                    return (
                      <ContextMenu key={transaction.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow 
                            className={`hover:bg-gray-50 cursor-context-menu ${isReversal ? 'bg-red-50' : ''}`}
                          >
                            <TableCell className="font-medium">
                              {transaction.invoice_number}
                              {isReversal && (
                                <Badge variant="destructive" className="ml-2 text-xs">
                                  REVERSED
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(transaction.invoice_date)}</TableCell>
                            <TableCell className="text-right">{formatQuantity(transaction.quantity)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(transaction.amountPerUnit)}</TableCell>
                            <TableCell className={`text-right font-semibold ${isReversal ? 'text-red-600' : ''}`}>
                              {formatCurrency(transaction.charge)}
                            </TableCell>
                            <TableCell>{getSupplierName(transaction.supplier_id)}</TableCell>
                            <TableCell>
                              {isCore && (
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                                  Core
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => handleEdit(transaction)}
                            disabled={isLocked || isReversal || deleting}
                            className={isLocked || isReversal ? 'opacity-50 cursor-not-allowed' : ''}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            <span>Edit</span>
                            {isLocked && (
                              <span className="ml-2 text-xs text-slate-500">(Paid)</span>
                            )}
                            {isReversal && (
                              <span className="ml-2 text-xs text-slate-500">(Reversed)</span>
                            )}
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleDeleteClick(transaction)}
                            disabled={isLocked || isReversal || deleting}
                            className={
                              isLocked || isReversal || deleting
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'text-red-600 focus:bg-red-50 focus:text-red-700'
                            }
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            <span>Delete</span>
                            {isLocked && (
                              <span className="ml-2 text-xs text-slate-500">(Paid)</span>
                            )}
                            {isReversal && (
                              <span className="ml-2 text-xs text-slate-500">(Reversed)</span>
                            )}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && transactions.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Total Transactions:</span>
                <span className="text-lg font-bold text-slate-900">{transactions.length}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <EditInventoryTransactionModal
        isOpen={showEditModal}
        onClose={handleEditModalClose}
        transaction={selectedTransaction}
        onUpdate={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Confirm Transaction Reversal
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete this transaction? This will reverse the inventory and accounting entries.
              </p>
              {transactionToDelete && (
                <div className="bg-slate-50 border border-slate-200 rounded p-3 mt-3 text-sm">
                  <div className="font-medium text-slate-900 mb-1">Transaction Details:</div>
                  <div className="text-slate-700 space-y-1">
                    <div>Invoice: <span className="font-medium">{transactionToDelete.invoice_number}</span></div>
                    <div>Date: <span className="font-medium">{formatDate(transactionToDelete.invoice_date)}</span></div>
                    <div>Quantity: <span className="font-medium">{formatQuantity(transactionToDelete.quantity)}</span></div>
                    <div>Amount: <span className="font-medium">{formatCurrency(transactionToDelete.charge)}</span></div>
                  </div>
                </div>
              )}
              <p className="text-red-600 font-medium mt-2">
                This action will create offsetting entries to reverse the transaction. The original transaction will remain in the system for audit purposes.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Yes, Reverse Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}