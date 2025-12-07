import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LinesOfCredit, LinesOfCreditTransaction } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Edit3, 
  DollarSign, 
  Calendar, 
  Printer,
  History,
  Plus,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import LinesOfCreditEditModal from '../components/lines-of-credit/LinesOfCreditEditModal';
import LineOfCreditPaymentModal from '../components/lines-of-credit/LineOfCreditPaymentModal';
import LineOfCreditTransactionModal from '../components/lines-of-credit/LineOfCreditTransactionModal';

// Helper function to parse YYYY-MM-DD date strings
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function LinesOfCreditPage() {
  const [linesOfCredit, setLinesOfCredit] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appliedFromDate, setAppliedFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [appliedToDate, setAppliedToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [daysBack, setDaysBack] = useState(30);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('transactions'); // 'transactions' or 'payments'

  // New function to load all initial data, including balance recalculation
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load all lines of credit to find active ones
      const allAccountsData = await LinesOfCredit.list();
      const activeAccounts = allAccountsData.filter(acc => acc.is_active !== false);

      // 2. Recalculate balances for each active line of credit account
      console.log('Recalculating balances for all lines of credit...');
      const recalculationPromises = activeAccounts.map(account =>
        base44.functions.invoke('calculateLOCBalances', {
          lineOfCreditId: account.id
        }).catch(error => {
          console.error(`Failed to recalculate balances for account ${account.name}:`, error);
          return null; // Continue even if one fails
        })
      );
      await Promise.all(recalculationPromises);
      console.log('Balance recalculation complete');

      // 3. Reload accounts to get updated current_balance values
      const updatedAccountsData = await LinesOfCredit.list();
      const updatedActiveAccounts = updatedAccountsData.filter(acc => acc.is_active !== false);
      setLinesOfCredit(updatedActiveAccounts);

      // Do NOT auto-select first account - let user choose

      // Transactions will be loaded by the useEffect watching selectedAccountId
      // once selectedAccountId is set by user selection.

    } catch (error) {
      console.error('Error loading lines of credit data:', error);
      alert('Failed to load lines of credit accounts or other initial data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // This useEffect will now call `loadData` once on component mount
  useEffect(() => {
    loadData();
  }, [loadData]); // `loadData` is a useCallback, so it's stable.

  // Existing `loadLinesOfCredit` for refreshing after account edits/saves
  const loadLinesOfCredit = useCallback(async () => {
    try {
      const accountsData = await LinesOfCredit.filter({ is_active: true }, 'name');
      setLinesOfCredit(accountsData);
      
      // Do NOT auto-select first account - let user choose
    } catch (error) {
      console.error('Error loading lines of credit:', error);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      if (!selectedAccountId) {
        setTransactions([]);
        setLoading(false);
        return;
      }
      
      const allTransactionsData = await LinesOfCreditTransaction.filter(
        { line_of_credit_id: selectedAccountId },
        'transaction_date'
      );
      
      // Sort all transactions by date (earliest first)
      allTransactionsData.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateA - dateB;
      });

      // Calculate starting balance from transactions before the date range
      let startingBalance = 0;
      const transactionsBeforeRange = allTransactionsData.filter(tx => tx.transaction_date < appliedFromDate);
      for (const tx of transactionsBeforeRange) {
        if (tx.source_type !== 'payment_made') {
          startingBalance += (tx.charge_amount || 0);
          startingBalance -= (tx.credit_amount || 0);
          startingBalance -= (tx.payment_amount || 0);
        }
      }
      
      // Filter transactions within the date range for display
      const filteredTransactions = allTransactionsData.filter(tx => {
        const txDate = tx.transaction_date;
        return txDate >= appliedFromDate && txDate <= appliedToDate;
      });
      
      // Attach starting balance to be used in the display calculation
      setTransactions({ data: filteredTransactions, startingBalance });
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, appliedFromDate, appliedToDate]);

  // This useEffect will still run when selectedAccountId changes (which can happen from loadData)
  useEffect(() => {
    if (selectedAccountId) {
      loadTransactions();
    }
  }, [loadTransactions, selectedAccountId]);

  const selectedAccount = linesOfCredit.find(acc => acc.id === selectedAccountId);

  // Calculate running balances on the frontend for display
  const transactionsWithBalance = useMemo(() => {
    // Handle both old array format and new object format with startingBalance
    const txData = Array.isArray(transactions) ? transactions : (transactions?.data || []);
    const startingBalance = Array.isArray(transactions) ? 0 : (transactions?.startingBalance || 0);
    
    let cumulativeBalance = startingBalance;
    const finalTransactions = txData.map(tx => {
      // Only process transactions that are not payment_made
      if (tx.source_type !== 'payment_made') {
        cumulativeBalance += (tx.charge_amount || 0);
        cumulativeBalance -= (tx.credit_amount || 0);
        cumulativeBalance -= (tx.payment_amount || 0);
      }
      return {
        ...tx,
        calculatedBalance: cumulativeBalance
      };
    });
    return finalTransactions;
  }, [transactions, selectedAccount]);

  // Filter transactions based on view mode
  const displayedTransactions = useMemo(() => {
    if (viewMode === 'payments') {
      return transactionsWithBalance.filter(tx => tx.source_type === 'payment_made');
    } else {
      return transactionsWithBalance.filter(tx => tx.source_type !== 'payment_made');
    }
  }, [transactionsWithBalance, viewMode]);


  const handleApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
  };

  const handleDaysBackChange = (days) => {
    const numDays = parseInt(days) || 0;
    setDaysBack(numDays);
    const newFromDate = format(subDays(new Date(), numDays), 'yyyy-MM-dd');
    const newToDate = format(new Date(), 'yyyy-MM-dd');
    setFromDate(newFromDate);
    setToDate(newToDate);
  };

  const handleEditAccount = (account = null) => {
    setEditingAccount(account || selectedAccount);
    setShowEditModal(true);
  };

  const handleSaveAccount = async (accountData) => {
    try {
      if (editingAccount && editingAccount.id) {
        await LinesOfCredit.update(editingAccount.id, accountData);
      } else {
        await LinesOfCredit.create(accountData);
      }
      setShowEditModal(false);
      setEditingAccount(null);
      loadLinesOfCredit(); // Reload only accounts to get the new/updated account in the dropdown
      // No need to call loadData, as loadLinesOfCredit handles updating the list of accounts.
      // If the newly added account is active, it will appear in the dropdown.
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account.');
    }
  };

  const handleRefreshBalances = async () => {
    if (!selectedAccountId) return;
    
    setRefreshing(true);
    try {
      await base44.functions.invoke('calculateLOCBalances', {
        lineOfCreditId: selectedAccountId
      });
      
      // Reload accounts to get updated current_balance and last_recalculated_date
      const updatedAccountsData = await LinesOfCredit.list();
      const updatedActiveAccounts = updatedAccountsData.filter(acc => acc.is_active !== false);
      setLinesOfCredit(updatedActiveAccounts);
      
      alert('Balance refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing balances:', error);
      alert('Failed to refresh balance. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleMakePayment = () => {
    if (!selectedAccount) {
      alert('Please select a line of credit account first.');
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePaymentMade = () => {
    setShowPaymentModal(false);
    loadData(); // Reload to refresh balances and accounts (as balances might have changed)
    loadTransactions(); // Reload transactions for the current account/date range
  };

  const handleAddTransaction = () => {
    if (!selectedAccount) {
      alert('Please select a line of credit account first.');
      return;
    }
    setShowTransactionModal(true);
  };

  const handleTransactionMade = async () => {
    setShowTransactionModal(false);
    
    // Recalculate balance
    if (selectedAccountId) {
      try {
        await base44.functions.invoke('calculateLOCBalances', {
          lineOfCreditId: selectedAccountId
        });
      } catch (error) {
        console.error('Error recalculating balance after transaction:', error);
      }
    }
    
    // Reload data and transactions
    loadData();
    loadTransactions();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
          }
          .no-print { display: none !important; }
          .print-title { 
            visibility: visible !important;
            display: block !important;
            font-size: 16px; 
            font-weight: bold; 
            margin-bottom: 15px;
            text-align: center;
          }
          .print-subtitle {
            visibility: visible !important;
            display: block !important;
            font-size: 12px;
            text-align: center;
            margin-bottom: 20px;
          }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Lines of Credit</h1>
              <p className="text-slate-600 mt-1">Manage credit card and line of credit accounts</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => handleEditAccount()} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add New Account
              </Button>
              <Button onClick={() => handleEditAccount(selectedAccount)} variant="outline" disabled={!selectedAccount}>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Account
              </Button>
              <Button onClick={handleMakePayment} className="bg-green-600 hover:bg-green-700" disabled={!selectedAccount}>
                <DollarSign className="w-4 h-4 mr-2" />
                Make Payment
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Controls */}
          <Card className="no-print">
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label>Line of Credit Account</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {linesOfCredit.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex-[2] min-w-[300px]">
                  <Label>Date Range</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={daysBack}
                      onChange={(e) => handleDaysBackChange(e.target.value)}
                      min="0"
                      placeholder="Days"
                      className="w-20"
                    />
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleApply}
                      size="sm"
                      disabled={!selectedAccountId}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Apply
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 flex-1 min-w-[160px]">
                  <Label className="invisible">Refresh</Label>
                  <Button
                    onClick={handleRefreshBalances}
                    variant="outline"
                    className="w-full"
                    disabled={!selectedAccountId || refreshing}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    {refreshing ? 'Refreshing...' : 'Refresh Balance'}
                  </Button>
                </div>
                
                <div className="space-y-2 text-right min-w-[140px]">
                  <Label className="text-slate-600">Current Balance</Label>
                  <div>
                    <p className="text-xl font-bold text-red-600">
                      ${(selectedAccount?.current_balance || 0).toFixed(2)}
                    </p>
                    {selectedAccount?.last_recalculated_date && (
                      <p className="text-xs text-slate-500">
                        Updated: {format(new Date(selectedAccount.last_recalculated_date), 'MMM d, h:mm a')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Summary */}
          {selectedAccount && (
            <Card className="no-print">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">{selectedAccount.name}</h3>
                    <p className="text-slate-600">{selectedAccount.institution_name}</p>
                    {selectedAccount.account_number && (
                      <p className="text-slate-600 text-sm">***{selectedAccount.account_number.slice(-4)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Credit Limit</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${(selectedAccount.credit_limit || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Current Balance</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${(selectedAccount.current_balance || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Available Credit</p>
                    <p className="text-xl font-bold text-green-600">
                      ${(selectedAccount.available_credit || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Print Title */}
          <div className="print-area">
            <div className="print-title" style={{ display: 'none' }}>
              Line of Credit Statement - {selectedAccount?.name || 'All Accounts'}
            </div>
            <div className="print-subtitle" style={{ display: 'none' }}>
              {format(new Date(appliedFromDate), 'MMMM d, yyyy')} - {format(new Date(appliedToDate), 'MMMM d, yyyy')}
            </div>

            {/* Transactions Table */}
            <Card>
              <CardHeader className="no-print">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Toggle Bar */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                      <button
                        onClick={() => setViewMode('transactions')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'transactions'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Transactions
                      </button>
                      <button
                        onClick={() => setViewMode('payments')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'payments'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Payments
                      </button>
                    </div>
                    <span className="text-slate-600 text-sm">
                      ({displayedTransactions.length} {viewMode === 'payments' ? 'payments' : 'transactions'})
                    </span>
                  </div>
                  <Button 
                    onClick={handleAddTransaction}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={!selectedAccount}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Manual Transaction
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Reference</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Charges</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Credits</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Payments</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array(5).fill(0).map((_, i) => (
                          <tr key={i} className="border-b animate-pulse">
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                          </tr>
                        ))
                      ) : displayedTransactions.length > 0 ? (
                        displayedTransactions.map((tx) => (
                          <tr key={tx.id} className="border-b hover:bg-slate-50">
                            <td className="p-3">{format(parseLocalDate(tx.transaction_date), 'MMM d, yyyy')}</td>
                            <td className="p-3">
                              <div>
                                <span className="font-medium text-slate-900">{tx.description}</span>
                                <div className="text-xs text-slate-500">
                                  {tx.source_type && (
                                    <Badge variant="outline" className="text-xs">
                                      {tx.source_type.replace('_', ' ')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-slate-600">{tx.reference || '-'}</td>
                            <td className="p-3 text-right">
                              {tx.charge_amount > 0 && (
                                <span className="font-medium text-red-600">${tx.charge_amount.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {tx.credit_amount > 0 && (
                                <span className="font-medium text-blue-600">${tx.credit_amount.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {tx.payment_amount > 0 && (
                                <span className="font-medium text-green-600">${tx.payment_amount.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-semibold text-slate-900">
                              ${tx.calculatedBalance.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="p-12 text-center">
                            <div className="text-slate-400 mb-4">
                              <CreditCard className="w-12 h-12 mx-auto" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Transactions</h3>
                            <p className="text-slate-600">
                              {selectedAccount ? 'No transactions found for the selected date range.' : 'Select a line of credit account to view transactions.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Floating scroll buttons */}
      <div className="fixed right-8 bottom-8 flex flex-col gap-2 z-50 no-print">
        <Button
          onClick={handleScrollToTop}
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
          title="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
        <Button
          onClick={handleScrollToBottom}
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
          title="Scroll to bottom"
        >
          <ArrowDown className="w-5 h-5" />
        </Button>
      </div>

      <LinesOfCreditEditModal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAccount(null);
        }}
        lineOfCredit={editingAccount}
        onSubmit={handleSaveAccount}
      />

      <LineOfCreditPaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        lineOfCredit={selectedAccount}
        onPaymentMade={handlePaymentMade}
      />

      <LineOfCreditTransactionModal
        open={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        lineOfCredit={selectedAccount}
        onTransactionMade={handleTransactionMade}
      />
    </>
  );
}