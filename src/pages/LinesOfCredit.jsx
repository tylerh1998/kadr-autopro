import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
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
  ArrowDown,
  RotateCcw,
  FileCheck
} from 'lucide-react';
import { format, subDays, startOfMonth, subMonths } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LinesOfCreditEditModal from '../components/lines-of-credit/LinesOfCreditEditModal';
import LineOfCreditPaymentModal from '../components/lines-of-credit/LineOfCreditPaymentModal';
import LineOfCreditTransactionModal from '../components/lines-of-credit/LineOfCreditTransactionModal';
import PaymentTransactionItem from '../components/lines-of-credit/PaymentTransactionItem';
import LOCReconciliationModal from '../components/lines-of-credit/LOCReconciliationModal';

// Helper function to parse YYYY-MM-DD date strings
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  try {
    // Handle ISO strings or other formats by taking the first part if it contains T
    const cleanDateString = dateString.includes('T') ? dateString.split('T')[0] : dateString;
    const parts = cleanDateString.split('-');
    
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const date = new Date(year, month - 1, day);
        // Validate the date object
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    // Fallback to standard constructor
    const fallbackDate = new Date(dateString);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  } catch (e) {
    console.error("Date parsing error:", e);
    return null;
  }
};

const SafeDateFormat = ({ dateString }) => {
  const date = parseLocalDate(dateString);
  if (!date) return <span>-</span>;
  try {
    return <span>{format(date, 'MMM d, yyyy')}</span>;
  } catch (e) {
    return <span>-</span>;
  }
};

export default function LinesOfCreditPage() {
  const { employee } = useAuth();
  const [linesOfCredit, setLinesOfCredit] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]); // Store all transactions for lookup
  const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appliedFromDate, setAppliedFromDate] = useState(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
  const [appliedToDate, setAppliedToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [daysBack, setDaysBack] = useState('');
  const [filterMode, setFilterMode] = useState('all_unpaid'); // 'all_unpaid' or 'custom_date'
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('transactions'); // 'transactions' or 'payments'
  const [currentUser, setCurrentUser] = useState(null);
  const [showFlushConfirm, setShowFlushConfirm] = useState(false);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);

  // New function to load all initial data, including balance recalculation
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load all lines of credit to find active ones
      const { data: allAccountsData, error: loadError } = await supabase.from('LinesOfCredit').select('*');
      if (loadError) throw loadError;
      const activeAccounts = (allAccountsData || []).filter(acc => acc.is_active !== false);

      // 2. Removed backend recalculation logic as we no longer track balances here
      
      setLinesOfCredit(activeAccounts);

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
      const { data: accountsData, error: loadError } = await supabase
        .from('LinesOfCredit')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (loadError) throw loadError;
      setLinesOfCredit(accountsData || []);
      
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
      
      const { data: allTransactionsData, error: txError } = await supabase
        .from('LinesOfCreditTransaction')
        .select('*')
        .eq('line_of_credit_id', selectedAccountId)
        .order('transaction_date');
      if (txError) throw txError;
      const visibleTransactionsData = (allTransactionsData || []).filter(tx => tx.is_reversed !== true);
      
      // Sort all transactions by date (earliest first)
      visibleTransactionsData.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateA - dateB;
      });

      allTransactionsData.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateA - dateB;
      });

      let filteredTransactions = [];
      let startingBalance = 0;

      if (filterMode === 'all_unpaid') {
        const hundredDaysAgo = format(subDays(new Date(), 100), 'yyyy-MM-dd');
        
        filteredTransactions = visibleTransactionsData.filter(tx => {
            if (tx.source_type === 'payment_made') {
                return tx.transaction_date >= hundredDaysAgo;
            }
            if ((tx.charge_amount || 0) > 0) {
                return (tx.charge_amount || 0) - (tx.payment_amount || 0) > 0.005;
            }
            if ((tx.credit_amount || 0) > 0) {
                return (tx.credit_amount || 0) + (tx.payment_amount || 0) > 0.005;
            }
            return false;
        });
        
        startingBalance = 0;

      } else {
        // Custom Date mode (Original Logic)
        
        // Calculate starting balance from transactions before the date range
        const transactionsBeforeRange = visibleTransactionsData.filter(tx => tx.transaction_date < appliedFromDate);
        for (const tx of transactionsBeforeRange) {
            startingBalance += (tx.charge_amount || 0);
            startingBalance -= (tx.credit_amount || 0);
            
            if (tx.source_type === 'payment_made') {
            startingBalance -= (tx.payment_amount || 0);
            }
        }
        
        // Filter transactions within the date range for display
        filteredTransactions = visibleTransactionsData.filter(tx => {
            const txDate = tx.transaction_date;
            return txDate >= appliedFromDate && txDate <= appliedToDate;
        });
      }
      
      // Attach starting balance to be used in the display calculation
      setTransactions({ data: filteredTransactions, startingBalance });
      setAllTransactions(visibleTransactionsData); // Save visible list for PaymentTransactionItem lookups
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
      // Process all transactions for the running balance calculation
      // even if they are filtered out of the display later
      cumulativeBalance += (tx.charge_amount || 0);
      cumulativeBalance -= (tx.credit_amount || 0);
      
      if (tx.source_type === 'payment_made') {
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
    } else if (viewMode === 'all') {
      return transactionsWithBalance; // Show all transactions and payments chronologically
    } else {
      // Show only non-payment transactions in default view (charges/credits)
      // Payments are shown in the payments column of charges
      return transactionsWithBalance.filter(tx => tx.source_type !== 'payment_made');
    }
  }, [transactionsWithBalance, viewMode]);


  const handleApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    // When applying a date range, force filter mode to custom_date if it isn't already, 
    // BUT the dropdown controls it. If the user clicks Apply, they probably want to see the date range.
    // However, the requirement says "Custom Date for any date filter applied."
    // So if they change the date and click apply, we should switch to custom_date.
    if (filterMode !== 'custom_date') {
        setFilterMode('custom_date');
    }
  };

  const handleDaysBackChange = (days) => {
    const numDays = parseInt(days) || 0;
    setDaysBack(numDays);
    const newFromDate = format(subDays(new Date(), numDays), 'yyyy-MM-dd');
    const newToDate = format(new Date(), 'yyyy-MM-dd');
    setFromDate(newFromDate);
    setToDate(newToDate);
  };

  // Effect to reload when filterMode changes
  useEffect(() => {
    if (selectedAccountId) {
        loadTransactions();
    }
  }, [filterMode, loadTransactions]);

  const handleEditAccount = (account = null) => {
    setEditingAccount(account || selectedAccount);
    setShowEditModal(true);
  };

  const handleSaveAccount = async (accountData) => {
    try {
      const now = new Date().toISOString();
      if (editingAccount && editingAccount.id) {
        await supabase.from('LinesOfCredit').update({ ...accountData, updated_date: now }).eq('id', editingAccount.id);
      } else {
        const id = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await supabase.from('LinesOfCredit').insert([{ id, ...accountData, created_date: now, updated_date: now }]);
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

  const handlePaymentCancelled = async () => {
    await loadData();
    await loadTransactions();
  };

  const handleAddTransaction = () => {
    if (!selectedAccount) {
      alert('Please select a line of credit account first.');
      return;
    }
    setEditingTransaction(null);
    setShowTransactionModal(true);
  };

  const handleEditTransaction = (tx) => {
    setEditingTransaction(tx);
    setShowTransactionModal(true);
  };

  const handleTransactionMade = async () => {
    setShowTransactionModal(false);
    setEditingTransaction(null);
    
    // Reload data and transactions
    loadData();
    loadTransactions();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleFlushLocks = async () => {
    setFlushing(true);
    try {
      const { data: allAccounts, error: loadError } = await supabase.from('LinesOfCredit').select('*');
      if (loadError) throw loadError;
      const lockedAccounts = (allAccounts || []).filter(acc => acc.locked_by_user);

      if (lockedAccounts.length === 0) {
        alert('No locked accounts found.');
        setShowFlushConfirm(false);
        setFlushing(false);
        return;
      }

      const updatePromises = lockedAccounts.map(account =>
        supabase.from('LinesOfCredit').update({
          locked_by_user: null,
          locked_timestamp: null
        }).eq('id', account.id)
      );

      await Promise.all(updatePromises);
      
      alert(`Successfully unlocked ${lockedAccounts.length} account(s).`);
      loadData();
    } catch (error) {
      console.error('Error flushing locks:', error);
      alert('Failed to flush locks. Please try again.');
    } finally {
      setShowFlushConfirm(false);
      setFlushing(false);
    }
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
              {!selectedAccountId && (
                <Button onClick={() => handleEditAccount()} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Account
                </Button>
              )}
              {selectedAccountId && (
                <Button onClick={() => handleEditAccount(selectedAccount)} variant="outline">
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Account
                </Button>
              )}
              {selectedAccountId && (
                <Button onClick={() => setShowReconcileModal(true)} className="bg-purple-600 hover:bg-purple-700">
                  <FileCheck className="w-4 h-4 mr-2" />
                  Reconcile
                </Button>
              )}
              <Button onClick={handleMakePayment} className="bg-green-600 hover:bg-green-700" disabled={!selectedAccount}>
                <DollarSign className="w-4 h-4 mr-2" />
                Make Payment
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowFlushConfirm(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Flush Locks
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

                <div className="space-y-2 flex-[3] min-w-[600px]">
                  <Label>Date Range</Label>
                  <div className="flex items-center gap-2">
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
                      className="w-[140px]"
                    />
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-[140px]"
                    />
                    <Button
                      onClick={handleApply}
                      size="sm"
                      disabled={!selectedAccountId}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Apply
                    </Button>
                    
                    <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-full px-3 text-slate-600 hover:text-slate-900" onClick={() => {
                          const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
                          const end = format(new Date(), 'yyyy-MM-dd');
                          setFromDate(start); setToDate(end); setAppliedFromDate(start); setAppliedToDate(end); setFilterMode('custom_date');
                      }}>This Month</Button>
                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-full px-3 text-slate-600 hover:text-slate-900" onClick={() => {
                          const prevMonth = subMonths(new Date(), 1);
                          const start = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
                          const end = format(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0), 'yyyy-MM-dd');
                          setFromDate(start); setToDate(end); setAppliedFromDate(start); setAppliedToDate(end); setFilterMode('custom_date');
                      }}>Last Month</Button>
                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-full px-3 text-slate-600 hover:text-slate-900" onClick={() => handleDaysBackChange(90)}>Last 90 Days</Button>
                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-full px-3 text-slate-600 hover:text-slate-900" onClick={() => {
                          const start = format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd');
                          const end = format(new Date(), 'yyyy-MM-dd');
                          setFromDate(start); setToDate(end); setAppliedFromDate(start); setAppliedToDate(end); setFilterMode('custom_date');
                      }}>YTD</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>



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
                        onClick={() => setViewMode('all')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          viewMode === 'all'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All
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
                  
                  <div className="flex items-center gap-2">
                    <Select value={filterMode} onValueChange={setFilterMode} disabled={!selectedAccount}>
                        <SelectTrigger className="w-[140px] h-9">
                            <SelectValue placeholder="Filter" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all_unpaid">All Unpaid</SelectItem>
                            <SelectItem value="custom_date">Custom Date</SelectItem>
                        </SelectContent>
                    </Select>

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
                </div>
              </CardHeader>
              <CardContent className={viewMode === 'payments' ? "p-4" : "p-0"}>
                {viewMode === 'payments' ? (
                  <div className="space-y-0">
                    {loading ? (
                      Array(3).fill(0).map((_, i) => (
                        <Card key={i} className="mb-2 border">
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex gap-6 w-full">
                              <div className="h-4 bg-slate-200 rounded w-32 animate-pulse"></div>
                              <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                            </div>
                          </div>
                        </Card>
                      ))
                    ) : displayedTransactions.length > 0 ? (
                      displayedTransactions.map((tx) => (
                        <PaymentTransactionItem 
                          key={tx.id} 
                          payment={tx} 
                          allTransactions={allTransactions}
                          onPaymentCancelled={handlePaymentCancelled}
                        />
                      ))
                    ) : (
                       <div className="p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <div className="text-slate-400 mb-4">
                          <DollarSign className="w-12 h-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Payments</h3>
                        <p className="text-slate-600">
                          {selectedAccount ? 'No payments found for the selected date range.' : 'Select a line of credit account to view payments.'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Charges</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Credits</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Payments</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Status</th>
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
                            </tr>
                          ))
                        ) : displayedTransactions.length > 0 ? (
                          displayedTransactions.map((tx) => (
                            <tr key={tx.id} className="border-b hover:bg-slate-50">
                              <td className="p-3"><SafeDateFormat dateString={tx.transaction_date} /></td>
                              <td className="p-3">
                                <div>
                                  {['manual', 'fee', 'cashback', 'interest'].includes(tx.source_type) && (!tx.payment_amount || tx.payment_amount === 0) ? (
                                    <span 
                                      className="font-medium text-blue-600 hover:underline cursor-pointer"
                                      onClick={() => handleEditTransaction(tx)}
                                    >
                                      {tx.description}
                                    </span>
                                  ) : (
                                    <span className="font-medium text-slate-900">{tx.description}</span>
                                  )}
                                </div>
                              </td>
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
                                {(tx.payment_amount || 0) !== 0 && (
                                  <span className="font-medium text-green-600">${(tx.payment_amount || 0).toFixed(2)}</span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                {tx.source_type !== 'payment_made' && (tx.charge_amount > 0 || tx.credit_amount > 0) && (
                                  (tx.payment_amount || 0) === 0 ? (
                                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">Unpaid</Badge>
                                  ) : ((tx.charge_amount || tx.credit_amount || 0) - (tx.payment_amount || 0) <= 0.005) ? (
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Paid</Badge>
                                  ) : (
                                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200">
                                      ${((tx.charge_amount || tx.credit_amount || 0) - tx.payment_amount).toFixed(2)}
                                    </Badge>
                                  )
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="p-12 text-center">
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
                )}
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
        currentUser={currentUser}
      />

      <LineOfCreditPaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        lineOfCredit={selectedAccount}
        onPaymentMade={handlePaymentMade}
        currentUser={currentUser}
      />

      <LineOfCreditTransactionModal
        open={showTransactionModal}
        onClose={() => {
          setShowTransactionModal(false);
          setEditingTransaction(null);
        }}
        lineOfCredit={selectedAccount}
        onTransactionMade={handleTransactionMade}
        currentUser={currentUser}
        transaction={editingTransaction}
      />

      <LOCReconciliationModal
        open={showReconcileModal}
        onClose={() => setShowReconcileModal(false)}
        lineOfCreditId={selectedAccountId}
      />

      <Dialog open={showFlushConfirm} onOpenChange={setShowFlushConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Flush All Account Locks</DialogTitle>
            <DialogDescription>
              This will unlock all line of credit accounts. Progress of any unsaved changes by other users may be lost. 
              Verify that all open edit forms are saved and closed across the platform before executing this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFlushConfirm(false)}
              disabled={flushing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFlushLocks}
              disabled={flushing}
            >
              {flushing ? 'Flushing...' : 'Confirm Flush'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}