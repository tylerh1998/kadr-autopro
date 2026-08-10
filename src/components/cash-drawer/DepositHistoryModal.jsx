import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FiscalPeriod } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { History, RefreshCw, Undo2, Ban, Printer, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { checkBankAccountLock } from '../utils/mountainTimeUtils';
import DepositDetailsModal from './DepositDetailsModal';

const ITEMS_PER_PAGE = 5;

export default function DepositHistoryModal({ open, onClose, onDepositReversed, onReprintSlip }) {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const loadDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const [bankTransactionsResponse, fiscalPeriods] = await Promise.all([
        base44.functions.invoke('getBankTransactions', {
          sourceType: 'deposit',
          fromDate: '1900-01-01',
          sortField: 'transaction_date',
          sortDirection: 'desc'
        }),
        FiscalPeriod.list()
      ]);

      const recentDeposits = bankTransactionsResponse?.data?.transactions || [];

      const depositsWithStatus = recentDeposits.map((dep) => {
        let canReverse = true;
        let reversalReason = '';

        if (dep.cleared) {
          canReverse = false;
          reversalReason = 'Cleared';
        } else if (dep.reconciled) {
          canReverse = false;
          reversalReason = 'Reconciled';
        } else {
          try {
            const datePart = dep.transaction_date.split('T')[0];
            const checkDate = new Date(datePart + 'T00:00:00Z');
            
            const period = fiscalPeriods.find(p => {
              const start = new Date(p.start_date + 'T00:00:00Z');
              const end = new Date(p.end_date + 'T00:00:00Z');
              return checkDate >= start && checkDate <= end;
            });

            if (!period) {
              canReverse = false;
              reversalReason = 'No Fiscal Period';
            } else if (period.is_closed) {
              canReverse = false;
              reversalReason = 'Fiscal Period Closed';
            }
          } catch (error) {
            console.error('Error checking fiscal period status for deposit:', dep.id, error);
            canReverse = false;
            reversalReason = 'Fiscal Period Check Error';
          }
        }

        return { ...dep, canReverse, reversalReason };
      });
      
      setDeposits(depositsWithStatus);
    } catch (error) {
      console.error('Error loading deposit history:', error);
      alert('Failed to load deposit history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDeposits();
      setCurrentPage(1);
    }
  }, [open, loadDeposits]);

  const handleReverseDeposit = useCallback(async (depositId, bankAccountId) => {
    // Check if bank account is locked before confirming
    try {
      const accountResponse = await base44.functions.invoke('SupabaseProxy', {
        action: 'filter',
        table: 'BankAccount',
        params: { id: bankAccountId }
      });
      const account = accountResponse.data?.data?.[0];
      
      // Check if any lock exists that is not expired
      if (account?.locked_by_user && account?.locked_timestamp) {
        const lockStatus = checkBankAccountLock(account, '');
        
        // If lock is not expired, show error
        if (!lockStatus.isExpired) {
          alert(`This bank account is currently locked by ${account.locked_by_user}. Please wait until the lock is released before reversing this deposit.`);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking bank account lock:', error);
      alert('Failed to verify bank account status. Please try again.');
      return;
    }

    if (!confirm('Are you sure you want to reverse this deposit? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('reverseDeposit', { bankTransactionId: depositId });
      if (response.data.success) {
        alert('Deposit reversed successfully!');
        onDepositReversed();
        loadDeposits();
      } else {
        alert(`Failed to reverse deposit: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error reversing deposit:', error);
      alert(`Failed to reverse deposit: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [loadDeposits, onDepositReversed]);

  // Pagination calculations
  const totalPages = Math.ceil(deposits.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedDeposits = deposits.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Deposit History
          </DialogTitle>
        </DialogHeader>
        <Card className="shadow-none border-none">
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading deposits...</p>
              </div>
            ) : deposits.length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                <p>No deposit history found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Bank Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center w-[120px]">Status</TableHead>
                      <TableHead className="text-right w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDeposits.map((deposit) => (
                      <TableRow key={deposit.id}>
                        <TableCell className="font-medium">
                          {format(new Date(deposit.transaction_date + 'T00:00:00'), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>{deposit.description}</TableCell>
                        <TableCell>{deposit.bank_account_name || deposit.bank_name || 'N/A'}</TableCell>
                        <TableCell className="text-right">${deposit.credit_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {deposit.reconciled && <span className="text-green-600">Reconciled</span>}
                          {!deposit.reconciled && deposit.cleared && <span className="text-blue-600">Cleared</span>}
                          {!deposit.reconciled && !deposit.cleared && <span className="text-orange-600">Pending</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => {
                                setSelectedDeposit(deposit);
                                setShowDetailsModal(true);
                              }}
                              disabled={loading}
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => onReprintSlip(deposit)}
                              disabled={loading}
                              title="Reprint Deposit Slip"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            {deposit.canReverse ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleReverseDeposit(deposit.id, deposit.bank_account_id)}
                                disabled={loading}
                              >
                                <Undo2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                title={`Cannot reverse: ${deposit.reversalReason}`}
                                disabled
                              >
                                <Ban className="w-4 h-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <p className="text-sm text-slate-600">
              Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, deposits.length)} of {deposits.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        </Card>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={loadDeposits} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </DialogFooter>
      </DialogContent>

      <DepositDetailsModal
        open={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedDeposit(null);
        }}
        deposit={selectedDeposit}
        onReverseSuccess={() => {
          setShowDetailsModal(false);
          setSelectedDeposit(null);
          loadDeposits();
          if (onDepositReversed) onDepositReversed();
        }}
      />
    </Dialog>
  );
}