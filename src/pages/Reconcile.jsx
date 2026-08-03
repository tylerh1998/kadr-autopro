import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import moment from 'moment-timezone';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  DollarSign,
  Calendar,
  Save,
  ArrowLeft,
  Landmark,
  History,
  ArrowUp,
  ArrowDown,
  Upload,
  RotateCcw
} from 'lucide-react';
import { format, addDays, endOfMonth } from 'date-fns';
import { createPageUrl } from '../utils';
import AutoReconcileModal from '../components/bank/AutoReconcileModal';

// Helper function to parse YYYY-MM-DD date strings as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return new Date();
  const datePart = dateString.substring(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const generateEntityId = () => crypto.randomUUID().replace(/-/g, '').substring(0, 24);
const getCurrentMountainTimestamp = () => moment.tz('America/Edmonton').format();

export default function ReconcilePage() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bankAccountId = searchParams.get('bank_account_id');

  const [bankAccount, setBankAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [statementBalance, setStatementBalance] = useState('');
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [showAutoReconcileModal, setShowAutoReconcileModal] = useState(false);
  
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Fetch current user on mount
  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);

  // Fetch last reconciliation to auto-populate dates
  useEffect(() => {
    const fetchLastRecon = async () => {
      if (!bankAccountId) return;
      try {
        const { data: reconData, error: reconError } = await supabase
          .from('BankReconciliation')
          .select('*')
          .eq('bank_account_id', bankAccountId);
        if (reconError) throw reconError;

        const lastRecons = (reconData || []).sort((a, b) =>
          String(b.period_end_date || '').localeCompare(String(a.period_end_date || ''))
        );

        if (lastRecons.length > 0) {
          const lastEndDateStr = lastRecons[0].period_end_date;
          if (lastEndDateStr) {
            const lastEnd = parseLocalDate(lastEndDateStr);
            const nextStart = addDays(lastEnd, 1);
            setPeriodStart(format(nextStart, 'yyyy-MM-dd'));
            setPeriodEnd(format(endOfMonth(nextStart), 'yyyy-MM-dd'));
          }
        } else {
          setPeriodStart('');
          setPeriodEnd('');
        }
      } catch (err) {
        console.error('Error fetching last reconciliation', err);
      }
    };
    fetchLastRecon();
  }, [bankAccountId]);

  useEffect(() => {
    const loadData = async () => {
      if (!bankAccountId) {
        navigate(createPageUrl('Bank'));
        return;
      }

      setLoading(true);
      try {
        const { data: accountData, error: accountError } = await supabase
          .from('BankAccount')
          .select('*')
          .eq('id', bankAccountId);
        if (accountError) throw accountError;

        const account = accountData?.[0] || null;
        setBankAccount(account);

        const { data: txResponse, error: txError } = await supabase.functions.invoke('autopro-getBankTransactions', {
          body: {
            bankAccountId,
            isReconciled: false
          }
        });
        if (txError) throw txError;
        if (txResponse?.error) throw new Error(txResponse.error);

        const accountTransactions = (txResponse?.transactions || []).map((tx) => ({
          ...tx,
          debit_amount: parseFloat(tx.debit_amount) || 0,
          credit_amount: parseFloat(tx.credit_amount) || 0,
          reconciled: tx.reconciled === true,
          cleared: tx.cleared === true,
          is_reversed: tx.is_reversed === true || tx.is_reversed === 'true'
        }));

        setTransactions(accountTransactions);
        setFilteredTransactions(accountTransactions);
      } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load bank account data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    }, [bankAccountId, navigate]);

  const releaseBankAccountLock = useCallback(async () => {
    if (!bankAccountId || !currentUser) return;

    try {
      await supabase
        .from('BankAccount')
        .update({
          locked_by_user: null,
          locked_timestamp: null
        })
        .eq('id', bankAccountId);
    } catch (error) {
      console.error('Error releasing lock:', error);
    }
  }, [bankAccountId, currentUser]);

  useEffect(() => {
    return () => {
      releaseBankAccountLock();
    };
  }, [releaseBankAccountLock]);

  const toggleTransaction = (txId) => {
    setSelectedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(txId)) {
        newSet.delete(txId);
      } else {
        newSet.add(txId);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (selectedTransactions.size === filteredTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(filteredTransactions.map(tx => tx.id)));
    }
  };

  const calculateTotals = useCallback(() => {
    const selectedTxs = filteredTransactions.filter(tx => selectedTransactions.has(tx.id));
    
    const totalCredits = selectedTxs.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
    const totalDebits = selectedTxs.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
    
    let startingBalance = 0;
    if (filteredTransactions.length > 0) {
      const allDisplayedBalance = filteredTransactions.reduce(
        (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 
        0
      );
      startingBalance = (bankAccount?.current_balance || 0) - allDisplayedBalance;
    }

    const clearedBalance = startingBalance + totalCredits - totalDebits;
    
    return {
      totalCredits,
      totalDebits,
      clearedBalance,
      startingBalance
    };
  }, [filteredTransactions, selectedTransactions, bankAccount]);

  const handleSaveReconciliation = async () => {
    if (!statementBalance || statementBalance === '') {
      alert('Please enter the statement ending balance');
      return;
    }

    if (!periodStart || !periodEnd) {
      alert('Please enter both the Period Start and Period End dates.');
      return;
    }

    const parsedBalance = parseFloat(statementBalance);
    if (isNaN(parsedBalance)) {
      alert('Please enter a valid statement balance');
      return;
    }

    if (selectedTransactions.size === 0) {
      alert('Please select at least one transaction to reconcile');
      return;
    }

    const totals = calculateTotals();
    const difference = parsedBalance - totals.clearedBalance;

    if (Math.abs(difference) > 0.01) {
      const confirmProceed = window.confirm(
        `There is a difference of $${difference.toFixed(2)} between the statement balance and cleared transactions. Do you want to proceed anyway?`
      );
      if (!confirmProceed) return;
    }

    setSaving(true);
    try {
      const activeUser = currentUser || employee;
      if (!activeUser) {
        throw new Error('User not found');
      }

      const reconciliationId = `RECON-${Date.now()}`;
      const reconciliationRecordId = generateEntityId();
      const reconciliationDate = getCurrentMountainTimestamp();
      const metadataTimestamp = getCurrentMountainTimestamp();

      const { data: updateData, error: updateInvokeError } = await supabase.functions.invoke('autopro-batchReconcileTransactions', {
        body: {
          transactionIds: Array.from(selectedTransactions),
          reconciliationId
        }
      });

      if (updateInvokeError) {
        throw new Error(updateInvokeError.message);
      }
      if (!updateData.success) {
        throw new Error(updateData.message || updateData.error || 'Failed to update some transactions');
      }

      const reconciliationRecord = {
        id: reconciliationRecordId,
        bank_account_id: bankAccountId,
        reconciliation_id: reconciliationId,
        reconciliation_date: reconciliationDate,
        period_start_date: periodStart,
        period_end_date: periodEnd,
        statement_ending_balance: parsedBalance,
        cleared_balance_at_reconciliation: totals.clearedBalance,
        difference,
        starting_balance: totals.startingBalance,
        total_credits: totals.totalCredits,
        total_debits: totals.totalDebits,
        created_date: metadataTimestamp,
        updated_date: metadataTimestamp,
        created_by_id: activeUser.id,
        created_by: activeUser.email || null,
        reconciled_by: activeUser.email || null,
        is_sample: false
      };

      const { error: reconciliationInsertError } = await supabase
        .from('BankReconciliation')
        .insert(reconciliationRecord);
      if (reconciliationInsertError) throw new Error(reconciliationInsertError.message);

      alert('Reconciliation saved successfully!');
      navigate(`${createPageUrl('ReconcileReport')}?id=${reconciliationId}`);

    } catch (error) {
      console.error('Error saving reconciliation:', error);
      alert('Failed to save reconciliation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const totals = !loading ? calculateTotals() : { totalCredits: 0, totalDebits: 0, clearedBalance: 0, startingBalance: 0 };
  const parsedStatementBalance = parseFloat(statementBalance) || 0;
  const difference = parsedStatementBalance - totals.clearedBalance;

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollButtons(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };



  const handleApplyMatches = (matchedIds) => {
    setSelectedTransactions(prev => {
      const newSet = new Set(prev);
      matchedIds.forEach(id => newSet.add(id));
      return newSet;
    });
    alert(`Successfully checked off ${matchedIds.length} matched transactions.`);
  };

  // const handleEmergencyReset = async () => {
  //   if (!window.confirm("WARNING: This will reset ALL transactions that are marked as reconciled or cleared (across ALL bank accounts). This is a destructive operation to fix stuck transactions. Are you sure?")) {
  //     return;
  //   }

  //   setLoading(true);
  //   try {
  //     console.log('Attempting emergency reset...');
  //     const response = await base44.functions.invoke('emergencyResetReconciliation');
  //     console.log('Reset response:', response);
      
  //     if (response.data.success) {
  //       alert(response.data.message);
  //       window.location.reload();
  //     } else {
  //       alert('Error: ' + (response.data.error || 'Unknown error'));
  //     }
  //   } catch (error) {
  //     console.error('Reset failed:', error);
  //     alert('Failed to reset transactions: ' + error.message);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={async () => {
                await releaseBankAccountLock();
                navigate(createPageUrl('Bank'));
              }}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Bank Accounts
            </Button>
            <h1 className="text-3xl font-bold text-slate-900">Reconcile Bank Account</h1>
          </div>
          <div className="flex gap-2">
            {/* {currentUser?.role === 'admin' && (
              <Button onClick={handleEmergencyReset} variant="destructive" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Emergency Reset
              </Button>
            )} */}
            <Button onClick={() => setShowAutoReconcileModal(true)} variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading bank account data...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    {bankAccount?.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-600">Bank Name</p>
                      <p className="font-semibold">{bankAccount?.bank_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Account Type</p>
                      <p className="font-semibold">{bankAccount?.account_type || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Current Balance</p>
                      <p className="text-xl font-bold text-slate-900">
                        ${(bankAccount?.current_balance || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-slate-600">Showing unreconciled transactions from last 365 days</p>
                    </div>
                    
                    <div className="pt-4 border-t space-y-3">
                      <h4 className="font-semibold text-sm text-slate-900">Reconciliation Period</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="period-start" className="text-xs">Period Start</Label>
                          <Input
                            id="period-start"
                            type="date"
                            value={periodStart}
                            onChange={(e) => setPeriodStart(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="period-end" className="text-xs">Period End</Label>
                          <Input
                            id="period-end"
                            type="date"
                            value={periodEnd}
                            onChange={(e) => setPeriodEnd(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Reconciliation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="statement-balance">Statement Ending Balance</Label>
                        <Input
                          id="statement-balance"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={statementBalance}
                          onChange={(e) => setStatementBalance(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Starting Balance:</span>
                        <span className="font-semibold">
                          ${totals.startingBalance.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-green-600">
                        <span>Total Credits (Selected):</span>
                        <span className="font-semibold">
                          +${totals.totalCredits.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>Total Debits (Selected):</span>
                        <span className="font-semibold">
                          -${totals.totalDebits.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-semibold">Cleared Balance:</span>
                        <span className="font-bold text-lg">
                          ${totals.clearedBalance.toFixed(2)}
                        </span>
                      </div>
                      {statementBalance && (
                        <div className="flex justify-between border-t pt-2">
                          <span className="font-semibold">Difference:</span>
                          <span className={`font-bold text-lg ${
                            Math.abs(difference) < 0.01
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            ${difference.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <Button
                        onClick={handleSaveReconciliation}
                        disabled={saving || selectedTransactions.size === 0 || !statementBalance}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Reconciliation'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Unreconciled Transactions
                  </span>
                  <Badge variant="outline">
                    {selectedTransactions.size} of {filteredTransactions.length} selected
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filteredTransactions.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No unreconciled transactions found for the selected date range.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-slate-100">
                          <th className="text-left p-3 cursor-pointer hover:bg-slate-50" onClick={toggleAll}>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0}
                                onCheckedChange={toggleAll}
                              />
                              <span className="text-sm font-medium">Select All</span>
                            </div>
                          </th>
                          <th className="text-left p-3 font-medium">Date</th>
                          <th className="text-left p-3 font-medium">Description</th>
                          <th className="text-left p-3 font-medium">Reference</th>
                          <th className="text-right p-3 font-medium">Debit</th>
                          <th className="text-right p-3 font-medium">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((tx) => (
                          <tr 
                            key={tx.id} 
                            className={`border-b cursor-pointer transition-colors ${selectedTransactions.has(tx.id) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'}`}
                            onClick={() => toggleTransaction(tx.id)}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={selectedTransactions.has(tx.id)}
                                onCheckedChange={() => toggleTransaction(tx.id)}
                              />
                            </td>
                            <td className="p-3">
                              {format(parseLocalDate(tx.transaction_date), 'MMM d, yyyy')}
                            </td>
                            <td className="p-3">{tx.description}</td>
                            <td className="p-3 text-slate-600">{tx.reference || '-'}</td>
                            <td className="p-3 text-right text-red-600">
                              {tx.debit_amount > 0 ? `$${tx.debit_amount.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-3 text-right text-green-600">
                              {tx.credit_amount > 0 ? `$${tx.credit_amount.toFixed(2)}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {showScrollButtons && (
              <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
                <Button
                  onClick={scrollToTop}
                  size="icon"
                  className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
                >
                  <ArrowUp className="h-5 w-5" />
                </Button>
                <Button
                  onClick={scrollToBottom}
                  size="icon"
                  className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
                >
                  <ArrowDown className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Floating Cleared Balance Box */}
            <div className="fixed bottom-6 left-6 z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-4 min-w-[200px] animate-in slide-in-from-bottom-5">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-500">Cleared Balance</span>
                <span className="text-2xl font-bold text-slate-900">
                  ${totals.clearedBalance.toFixed(2)}
                </span>
                {statementBalance && (
                  <div className="flex justify-between items-center border-t pt-2 mt-1">
                    <span className="text-xs text-slate-500">Difference</span>
                    <span className={`text-sm font-bold ${
                      Math.abs(difference) < 0.01 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ${difference.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AutoReconcileModal
        open={showAutoReconcileModal}
        onClose={() => setShowAutoReconcileModal(false)}
        bankAccountId={bankAccountId}
        periodEnd={periodEnd}
        onApplyMatches={handleApplyMatches}
      />
    </div>
  );
}