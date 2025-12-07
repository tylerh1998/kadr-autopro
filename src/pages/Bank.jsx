import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BankAccount, BankTransaction, ChartOfAccount, GLTransaction } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Landmark,
  Edit3,
  DollarSign,
  Calendar,
  Printer,
  History,
  CheckCircle2,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight // Added ArrowLeftRight icon
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import BankAccountEditModal from '../components/bank/BankAccountEditModal';
import BankTransactionModal from '../components/bank/BankTransactionModal';
import DepositDetailsModal from '../components/bank/DepositDetailsModal';
import ReconciliationHistoryModal from '../components/bank/ReconciliationHistoryModal';
import BankTransferModal from '../components/bank/BankTransferModal'; // Added BankTransferModal import
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

// Helper function to parse YYYY-MM-DD date strings
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function BankPage() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appliedFromDate, setAppliedFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [appliedToDate, setAppliedToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [daysBack, setDaysBack] = useState(30);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false); // Added showTransferModal state

  const navigate = useNavigate();

  // New function to load all initial data, including balance recalculation
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load all bank accounts to find active ones
      const allAccountsData = await BankAccount.list();
      const activeAccounts = allAccountsData.filter(acc => acc.is_active !== false);

      // 2. Recalculate balances for each active bank account
      console.log('Recalculating balances for all bank accounts...');
      const recalculationPromises = activeAccounts.map(account =>
        base44.functions.invoke('calculateBankBalances', {
          bankAccountId: account.id
        }).catch(error => {
          console.error(`Failed to recalculate balances for account ${account.name}:`, error);
          return null; // Continue even if one fails
        })
      );
      await Promise.all(recalculationPromises);
      console.log('Balance recalculation complete');

      // 3. Reload accounts to get updated current_balance values
      const updatedAccountsData = await BankAccount.list();
      const updatedActiveAccounts = updatedAccountsData.filter(acc => acc.is_active !== false);
      setBankAccounts(updatedActiveAccounts);

      // Do NOT auto-select first account - let user choose
      
      // 4. Load chart of accounts
      const chartData = await ChartOfAccount.list();
      setChartOfAccounts(chartData);

      // Transactions will be loaded by the useEffect watching selectedAccountId
      // once selectedAccountId is set by user selection.

    } catch (error) {
      console.error('Error loading bank data:', error);
      alert('Failed to load bank accounts or other initial data.');
    } finally {
      setLoading(false);
    }
  }, []); // `loadData` is a useCallback, so it's stable.

  // This useEffect will now call `loadData` once on component mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Existing `loadBankAccounts` for refreshing after account edits/saves
  const loadBankAccounts = useCallback(async () => {
    try {
      const accountsData = await BankAccount.filter({ is_active: true }, 'name');
      setBankAccounts(accountsData);

      // Do NOT auto-select first account - let user choose
    } catch (error) {
      console.error('Error loading bank accounts:', error);
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

      const transactionsData = await BankTransaction.filter(
        { bank_account_id: selectedAccountId },
        'transaction_date'
      );

      // Filter by date range using string comparison to avoid timezone issues
      const filteredTransactions = transactionsData.filter(tx => {
        const txDate = tx.transaction_date; // Keep as string 'yyyy-MM-dd'
        return txDate >= appliedFromDate && txDate <= appliedToDate;
      });

      // Sort by date (earliest first)
      filteredTransactions.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateA - dateB;
      });

      setTransactions(filteredTransactions);
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

  const selectedAccount = bankAccounts.find(acc => acc.id === selectedAccountId);

  // Calculate running balances on the frontend for display
  const transactionsWithBalance = useMemo(() => {
    // We need the starting balance of the account for accurate running balance calculation.
    // However, the `transactions` array itself doesn't contain it.
    // If we assume `transactions` are always from the beginning of time for this display,
    // or if the `balance` field on each transaction is the running balance *after* that transaction,
    // then the original logic might be intended differently.
    // Given the previous `tx.balance || 0`, it seems the `balance` property was expected on the transaction itself.
    // Let's assume for now that if we start from a filtered set, we can't reliably get an accurate historical running balance.
    // If the backend `calculateBankBalances` is correct, `selectedAccount?.current_balance` is the true current balance.
    // The `transactionsWithBalance` will calculate a running balance *within the displayed date range*.
    // For a true running balance, we'd need all transactions up to the start date.
    // For now, I will calculate running balance based on the transactions *currently loaded and displayed*.
    // The previous implementation for `balance` column also used `tx.balance || 0`.
    // To match the original intent of a "running balance" within the visible transactions:
    let runningBalance = 0; // This will start from 0 or an initial balance if provided.
    // If we need the actual historical running balance, we'd need to fetch transactions
    // from the account's inception up to `toDate` and then filter for display.
    // For this change, I will calculate running balance for the *displayed* transactions.
    return transactions.map(tx => {
      runningBalance += (tx.credit_amount || 0) - (tx.debit_amount || 0);
      return {
        ...tx,
        calculatedBalance: runningBalance
      };
    });
  }, [transactions]);


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

  const handleQuickFilter = (filterType) => {
    const today = new Date();
    let newFromDate, newToDate;

    switch (filterType) {
      case 'thisMonth':
        newFromDate = format(startOfMonth(today), 'yyyy-MM-dd');
        newToDate = format(endOfMonth(today), 'yyyy-MM-dd');
        break;
      case 'lastMonth':
        const lastMonth = subMonths(today, 1);
        newFromDate = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
        newToDate = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
        break;
      case 'last3Months':
        newFromDate = format(subMonths(today, 3), 'yyyy-MM-dd');
        newToDate = format(today, 'yyyy-MM-dd');
        break;
      default:
        return;
    }

    setFromDate(newFromDate);
    setToDate(newToDate);
    setAppliedFromDate(newFromDate);
    setAppliedToDate(newToDate);
  };

  const handleEditAccount = (account = null) => {
    setEditingAccount(account || selectedAccount);
    setShowEditModal(true);
  };

  const handleSaveAccount = async (accountData) => {
    try {
      if (editingAccount && editingAccount.id) {
        await BankAccount.update(editingAccount.id, accountData);
      } else {
        await BankAccount.create(accountData);
      }
      setShowEditModal(false);
      setEditingAccount(null);
      loadBankAccounts(); // Reload accounts after save
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account.');
    }
  };

  const handleRefreshBalances = async () => {
    if (!selectedAccountId) return;
    
    setRefreshing(true);
    try {
      await base44.functions.invoke('calculateBankBalances', {
        bankAccountId: selectedAccountId
      });
      
      // Reload accounts to get updated current_balance and last_recalculated_date
      const updatedAccountsData = await BankAccount.list();
      const updatedActiveAccounts = updatedAccountsData.filter(acc => acc.is_active !== false);
      setBankAccounts(updatedActiveAccounts);
      
      alert('Balance refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing balances:', error);
      alert('Failed to refresh balance. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleNewTransaction = () => {
    setEditingTransaction(null);
    setShowTransactionModal(true);
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setShowTransactionModal(true);
  };

  const handleSaveTransaction = async (transactionData) => {
    try {
      let savedTransaction;
      let oldTransactionData = null;
      
      if (editingTransaction) {
        // Store old transaction data for GL reversal
        oldTransactionData = { ...editingTransaction };
        
        // Update existing transaction
        await BankTransaction.update(editingTransaction.id, transactionData);
        savedTransaction = { ...transactionData, id: editingTransaction.id };
      } else {
        // Create new transaction with banktx flag
        savedTransaction = await BankTransaction.create({ 
          ...transactionData, 
          bank_account_id: selectedAccountId,
          banktx: true 
        });
      }

      // Get bank account details for GL posting
      const bankAccount = await BankAccount.get(selectedAccountId);
      
      if (!bankAccount.gl_account) {
        alert('Warning: Bank account does not have a GL account assigned. GL transactions were not posted.');
        setShowTransactionModal(false);
        setEditingTransaction(null);
        
        // Trigger balance recalculation even without GL posting for the bank account balance
        await base44.functions.invoke('calculateBankBalances', {
          bankAccountId: selectedAccountId
        });
        
        loadTransactions();
        return;
      }

      // If editing, reverse old GL entries if data changed
      if (oldTransactionData) {
        const dataChanged = 
          oldTransactionData.credit_amount !== transactionData.credit_amount ||
          oldTransactionData.debit_amount !== transactionData.debit_amount ||
          oldTransactionData.gl_account !== transactionData.gl_account ||
          oldTransactionData.transaction_date !== transactionData.transaction_date ||
          oldTransactionData.description !== transactionData.description;

        if (dataChanged) {
          console.log('Transaction data changed, reversing old GL entries');
          
          // Reverse old GL entries (swap debit/credit)
          if (oldTransactionData.credit_amount > 0) {
            // Old was a credit (deposit), reverse it
            await GLTransaction.create({
              account_number: bankAccount.gl_account,
              transaction_date: oldTransactionData.transaction_date,
              description: `REVERSAL: ${oldTransactionData.description}`,
              reference: `Bank TX Reversal - ${oldTransactionData.reference || ''}`,
              debit_amount: 0,
              credit_amount: oldTransactionData.credit_amount,
              source_type: 'manual',
              source_id: selectedAccountId
            });

            await GLTransaction.create({
              account_number: oldTransactionData.gl_account,
              transaction_date: oldTransactionData.transaction_date,
              description: `REVERSAL: ${oldTransactionData.description}`,
              reference: `Bank TX Reversal - ${oldTransactionData.reference || ''}`,
              debit_amount: oldTransactionData.credit_amount,
              credit_amount: 0,
              source_type: 'manual',
              source_id: selectedAccountId
            });
          } else if (oldTransactionData.debit_amount > 0) {
            // Old was a debit (withdrawal), reverse it
            await GLTransaction.create({
              account_number: bankAccount.gl_account,
              transaction_date: oldTransactionData.transaction_date,
              description: `REVERSAL: ${oldTransactionData.description}`,
              reference: `Bank TX Reversal - ${oldTransactionData.reference || ''}`,
              debit_amount: oldTransactionData.debit_amount,
              credit_amount: 0,
              source_type: 'manual',
              source_id: selectedAccountId
            });

            await GLTransaction.create({
              account_number: oldTransactionData.gl_account,
              transaction_date: oldTransactionData.transaction_date,
              description: `REVERSAL: ${oldTransactionData.description}`,
              reference: `Bank TX Reversal - ${oldTransactionData.reference || ''}`,
              debit_amount: 0,
              credit_amount: oldTransactionData.debit_amount,
              source_type: 'manual',
              source_id: selectedAccountId
            });
          }
        }
      }

      // Determine GL source type based on transaction source_type
      let glSourceType = 'manual';
      if (transactionData.source_type === 'deposit') {
        glSourceType = 'deposit';
      } else if (transactionData.source_type === 'payment') {
        glSourceType = 'payment';
      }

      // Create new GL entries
      if (transactionData.credit_amount > 0) {
        // Credit transaction (deposit)
        // Debit the bank account (increases asset)
        await GLTransaction.create({
          account_number: bankAccount.gl_account,
          transaction_date: transactionData.transaction_date,
          description: transactionData.description,
          reference: transactionData.reference || '',
          debit_amount: transactionData.credit_amount,
          credit_amount: 0,
          source_type: glSourceType,
          source_id: selectedAccountId
        });

        // Credit the selected GL account
        await GLTransaction.create({
          account_number: transactionData.gl_account,
          transaction_date: transactionData.transaction_date,
          description: transactionData.description,
          reference: transactionData.reference || '',
          debit_amount: 0,
          credit_amount: transactionData.credit_amount,
          source_type: glSourceType,
          source_id: selectedAccountId
        });
      } else if (transactionData.debit_amount > 0) {
        // Debit transaction (withdrawal/payment)
        // Credit the bank account (decreases asset)
        await GLTransaction.create({
          account_number: bankAccount.gl_account,
          transaction_date: transactionData.transaction_date,
          description: transactionData.description,
          reference: transactionData.reference || '',
          debit_amount: 0,
          credit_amount: transactionData.debit_amount,
          source_type: glSourceType,
          source_id: selectedAccountId
        });

        // Debit the selected GL account
        await GLTransaction.create({
          account_number: transactionData.gl_account,
          transaction_date: transactionData.transaction_date,
          description: transactionData.description,
          reference: transactionData.reference || '',
          debit_amount: transactionData.debit_amount,
          credit_amount: 0,
          source_type: glSourceType,
          source_id: selectedAccountId
        });
      }

      // Trigger balance recalculation after transaction save
      await base44.functions.invoke('calculateBankBalances', {
        bankAccountId: selectedAccountId
      });

      setShowTransactionModal(false);
      setEditingTransaction(null);
      loadTransactions();
      loadBankAccounts(); // Refresh to get updated current_balance
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Failed to save transaction.');
    }
  };

  const handleDepositClick = (transaction) => {
    setSelectedDeposit(transaction);
    setShowDepositModal(true);
  };

  const handleReconcile = () => {
    if (selectedAccountId) {
      navigate(`${createPageUrl('Reconcile')}?bank_account_id=${selectedAccountId}`);
    } else {
      alert('Please select a bank account to reconcile.');
    }
  };

  const handleTransfer = async (transferData) => {
    try {
      const response = await base44.functions.invoke('transferFunds', transferData);
      
      // Handle both possible response structures
      const result = response.data || response;
      
      console.log('Transfer response:', result);
      
      if (result.success) {
        alert(`Transfer completed successfully!\nReference: ${result.transfer.reference}`);
        setShowTransferModal(false);
        
        // Reload data to reflect the transfer
        await loadData();
        await loadTransactions();
      } else {
        alert(`Transfer failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error processing transfer:', error);
      
      // Extract the actual error message from the response
      let errorMessage = 'Failed to process transfer';
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  const totalBalance = useMemo(() => {
    return transactions.reduce((sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 0);
  }, [transactions]);

  const clearedBalance = useMemo(() => {
    return transactions.filter(tx => tx.cleared).reduce((sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 0);
  }, [transactions]);

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
              <h1 className="text-3xl font-bold text-slate-900">Bank Accounts</h1>
              <p className="text-slate-600 mt-1">Manage bank transactions and reconciliation</p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={() => setShowHistoryModal(true)}
                disabled={!selectedAccountId}
              >
                <History className="w-4 h-4 mr-2" />
                Previous Reconciliations
              </Button>
              <Button
                onClick={handleReconcile}
                className="bg-green-600 hover:bg-green-700"
                disabled={!selectedAccountId}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Reconcile
              </Button>
              <Button onClick={() => handleEditAccount()} className="bg-blue-600 hover:bg-blue-700">
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Bank Account
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
                  <Label>Bank Account</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex-[2] min-w-[300px]">
                  <div className="flex items-center justify-between mb-1">
                    <Label>Date Range</Label>
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={() => handleQuickFilter('thisMonth')}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        type="button"
                      >
                        This Month
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => handleQuickFilter('lastMonth')}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        type="button"
                      >
                        Last Month
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => handleQuickFilter('last3Months')}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        type="button"
                      >
                        Last 3 Months
                      </button>
                    </div>
                  </div>
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
                  <Label className="text-slate-600">Account Balance</Label>
                  <div>
                    <p className="text-xl font-bold text-slate-900">${(selectedAccount?.current_balance || 0).toFixed(2)}</p>
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

          {/* Print Title */}
          <div className="print-area">
            <div className="print-title" style={{ display: 'none' }}>
              Bank Statement - {selectedAccount?.name || 'All Accounts'}
            </div>
            <div className="print-subtitle" style={{ display: 'none' }}>
              {format(new Date(appliedFromDate), 'MMMM d, yyyy')} - {format(new Date(appliedToDate), 'MMMM d, yyyy')}
            </div>
            
            {/* Transactions Table */}
            <Card>
              <CardHeader className="no-print">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    Bank Transactions ({transactions.length})
                  </CardTitle>
                  <div className="flex items-center gap-2"> {/* Grouping buttons */}
                    <Button 
                      onClick={() => setShowTransferModal(true)} 
                      size="sm" 
                      variant="outline"
                      className="bg-white"
                      disabled={!selectedAccountId || bankAccounts.length < 2} // Disable if less than 2 accounts
                    >
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      Transfer Funds
                    </Button>
                    <Button onClick={handleNewTransaction} size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={!selectedAccountId}>
                      <Plus className="w-4 h-4 mr-2" />
                      New Transaction
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Debit</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Credit</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
                        <th className="text-center p-3 font-semibold text-slate-700">Cleared</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array(5).fill(0).map((_, i) => (
                          <tr key={i} className="border-b animate-pulse">
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                            <td className="p-3"><div className="h-4 bg-slate-200 rounded w-8"></div></td>
                          </tr>
                        ))
                      ) : transactionsWithBalance.length > 0 ? (
                        transactionsWithBalance.map((tx, index) => (
                          <tr key={tx.id} className="border-b hover:bg-slate-50">
                            <td className="p-3">{format(parseLocalDate(tx.transaction_date), 'MMM d, yyyy')}</td>
                            <td className="p-3">
                              <div>
                                {tx.banktx ? (
                                  <button
                                    onClick={() => handleEditTransaction(tx)}
                                    className="font-medium text-slate-900 hover:text-blue-700 hover:underline cursor-pointer text-left"
                                  >
                                    {tx.description}
                                  </button>
                                ) : (
                                  <span className="font-medium text-slate-900">{tx.description}</span>
                                )}
                                {tx.reference && (
                                  <span className="text-slate-500 text-xs ml-2">Ref: {tx.reference}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {tx.debit_amount > 0 && (
                                <span className="font-medium text-red-600">${tx.debit_amount.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {tx.credit_amount > 0 && (
                                <button
                                  onClick={() => handleDepositClick(tx)}
                                  className="font-medium text-green-600 hover:text-green-700 hover:underline cursor-pointer"
                                >
                                  ${tx.credit_amount.toFixed(2)}
                                </button>
                              )}
                            </td>
                            <td className="p-3 text-right font-semibold text-slate-900">
                              ${tx.calculatedBalance.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              {tx.cleared ? (
                                <Badge className="bg-green-100 text-green-800">Cleared</Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500">Uncleared</Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="p-12 text-center">
                            <div className="text-slate-400 mb-4">
                              <Landmark className="w-12 h-12 mx-auto" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Transactions</h3>
                            <p className="text-slate-600">
                              {selectedAccount ? 'No transactions found for the selected date range.' : 'Select a bank account to view transactions.'}
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

      <BankAccountEditModal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAccount(null);
        }}
        bankAccount={editingAccount}
        onSubmit={handleSaveAccount}
      />

      <BankTransactionModal
        open={showTransactionModal}
        onClose={() => {
          setShowTransactionModal(false);
          setEditingTransaction(null);
        }}
        bankAccountId={selectedAccountId}
        transaction={editingTransaction}
        onSubmit={handleSaveTransaction}
      />

      <DepositDetailsModal
        open={showDepositModal}
        onClose={() => {
          setShowDepositModal(false);
          setSelectedDeposit(null);
        }}
        deposit={selectedDeposit}
      />

      <ReconciliationHistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        bankAccountId={selectedAccountId}
      />

      <BankTransferModal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        bankAccounts={bankAccounts}
        onSubmit={handleTransfer}
      />
    </>
  );
}