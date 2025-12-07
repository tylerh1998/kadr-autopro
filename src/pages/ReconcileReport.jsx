import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BankAccount, BankTransaction } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Printer,
  LogOut,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '../utils';

export default function ReconcileReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reconciliationId = searchParams.get('id');

  const [bankAccount, setBankAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(0);

  useEffect(() => {
    if (!reconciliationId) {
      alert('No reconciliation ID provided');
      navigate(createPageUrl('Bank'));
      return;
    }
    loadReconciliationData();
  }, [reconciliationId, navigate]);

  const loadReconciliationData = async () => {
    setLoading(true);
    try {
      const allTransactions = await BankTransaction.list('transaction_date');
      const reconTransactions = allTransactions.filter(tx => tx.reconciliation_id === reconciliationId);

      if (reconTransactions.length === 0) {
        alert('No transactions found for this reconciliation');
        navigate(createPageUrl('Bank'));
        return;
      }

      setTransactions(reconTransactions);

      const firstTx = reconTransactions[0];
      const account = await BankAccount.get(firstTx.bank_account_id);
      setBankAccount(account);

      const allAccountTxs = allTransactions.filter(tx => tx.bank_account_id === firstTx.bank_account_id);
      const txsBeforeFirst = allAccountTxs.filter(tx => 
        new Date(tx.transaction_date) < new Date(reconTransactions[0].transaction_date)
      );
      
      const calculatedStartingBalance = txsBeforeFirst.reduce(
        (sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0),
        0
      );
      setStartingBalance(calculatedStartingBalance);

    } catch (error) {
      console.error('Error loading reconciliation data:', error);
      alert('Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExit = () => {
    navigate(createPageUrl('Bank'));
  };

  const totalCredits = transactions.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
  const totalDebits = transactions.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
  const endingBalance = startingBalance + totalCredits - totalDebits;

  const unclearedBalance = transactions
    .filter(tx => !tx.cleared)
    .reduce((sum, tx) => sum + (tx.credit_amount || 0) - (tx.debit_amount || 0), 0);

  const transactionsBySourceType = transactions.reduce((acc, tx) => {
    const sourceType = tx.source_type || 'manual';
    if (!acc[sourceType]) {
      acc[sourceType] = {
        count: 0,
        totalCredits: 0,
        totalDebits: 0,
        netAmount: 0
      };
    }
    acc[sourceType].count += 1;
    acc[sourceType].totalCredits += (tx.credit_amount || 0);
    acc[sourceType].totalDebits += (tx.debit_amount || 0);
    acc[sourceType].netAmount += (tx.credit_amount || 0) - (tx.debit_amount || 0);
    return acc;
  }, {});

  const transactionsWithBalance = useMemo(() => {
    let runningBalance = startingBalance;
    return transactions.map(tx => {
      runningBalance += (tx.credit_amount || 0) - (tx.debit_amount || 0);
      return {
        ...tx,
        calculatedBalance: runningBalance
      };
    });
  }, [transactions, startingBalance]);

  if (loading) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading reconciliation report...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
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
          .print-logo {
            visibility: visible !important;
            display: block !important;
            width: 100%;
            max-width: 600px;
            height: auto;
            margin: 0 auto 30px;
          }
          .print-title { 
            visibility: visible !important;
            display: block !important;
            font-size: 18px; 
            font-weight: bold; 
            margin-bottom: 20px;
            text-align: center;
          }
          .print-subtitle {
            visibility: visible !important;
            display: block !important;
            font-size: 14px;
            text-align: center;
            margin-bottom: 25px;
            color: #666;
          }
          .totals-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 20px !important;
            margin-bottom: 25px !important;
          }
          .totals-card {
            border: 2px solid #000;
            padding: 15px;
            break-inside: avoid;
          }
          .totals-card-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
          }
          .transactions-section {
            page-break-before: always !important;
            margin-top: 0 !important;
          }
          .transactions-title {
            visibility: visible !important;
            display: block !important;
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            text-align: center;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
          }
          table { border-collapse: collapse; width: 100%; font-size: 11px; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #ddd;
          }
          .totals-row:last-child {
            border-bottom: none;
          }
          .totals-label {
            font-weight: normal;
            color: #666;
            font-size: 12px;
          }
          .totals-value {
            font-weight: bold;
            font-size: 12px;
          }
        }
        
        @media screen {
          .transactions-title {
            display: none;
          }
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center no-print">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Reconciliation Report</h1>
              <p className="text-slate-600 mt-1">ID: {reconciliationId}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleExit} variant="outline">
                <LogOut className="w-4 h-4 mr-2" />
                Exit to Bank
              </Button>
              <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-2" />
                Print Report
              </Button>
            </div>
          </div>

          <div className="print-area">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b90236f4d7e6ac0de4a262/fd8c6d187_KensAutoDieselRepair12.jpg"
              alt="Ken's Auto & Diesel Repair"
              className="print-logo"
              style={{ display: 'none' }}
            />
            
            <div className="print-title" style={{ display: 'none' }}>
              Bank Reconciliation Report
            </div>
            <div className="print-subtitle" style={{ display: 'none' }}>
              {bankAccount?.name} - Reconciliation ID: {reconciliationId}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 totals-grid">
              <Card className="totals-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base totals-card-title">
                    <DollarSign className="w-5 h-5 no-print" />
                    Account Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b totals-row">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-600 no-print" />
                      <span className="text-slate-700 totals-label">Starting Balance</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900 totals-value">
                      ${(startingBalance || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b totals-row">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600 no-print" />
                      <span className="text-slate-700 totals-label">Total Credits</span>
                    </div>
                    <span className="text-lg font-bold text-green-600 totals-value">
                      ${(totalCredits || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b totals-row">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-600 no-print" />
                      <span className="text-slate-700 totals-label">Total Debits</span>
                    </div>
                    <span className="text-lg font-bold text-red-600 totals-value">
                      ${(totalDebits || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b totals-row">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-600 no-print" />
                      <span className="text-slate-700 totals-label">Ending Balance</span>
                    </div>
                    <span className="text-lg font-bold text-blue-600 totals-value">
                      ${(endingBalance || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center totals-row">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 no-print" />
                      <span className="text-slate-700 totals-label">Uncleared Balance</span>
                    </div>
                    <span className="text-lg font-bold text-amber-600 totals-value">
                      ${(unclearedBalance || 0).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="totals-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base totals-card-title">
                    <CheckCircle2 className="w-5 h-5 no-print" />
                    Transactions by Source Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(transactionsBySourceType).map(([sourceType, data]) => (
                    <div key={sourceType} className="flex justify-between items-center pb-3 border-b last:border-b-0 totals-row">
                      <div>
                        <span className="text-slate-700 capitalize totals-label">
                          {sourceType.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          ({data.count})
                        </span>
                      </div>
                      <span className={`text-lg font-bold totals-value ${
                        data.netAmount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${data.netAmount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  
                  {Object.keys(transactionsBySourceType).length === 0 && (
                    <p className="text-slate-500 text-center py-4">No transactions to display</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="transactions-section">
              <h2 className="transactions-title">
                Reconciled Transactions Detail
              </h2>
              
              <Card>
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Reconciled Transactions ({transactions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: '11px' }}>
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left">Reference</th>
                          <th className="p-2 text-left">Source Type</th>
                          <th className="p-2 text-right">Credits</th>
                          <th className="p-2 text-right">Debits</th>
                          <th className="p-2 text-right">Balance</th>
                          <th className="p-2 text-center no-print">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionsWithBalance.map((tx) => (
                          <tr key={tx.id} className="border-b hover:bg-slate-50">
                            <td className="p-2 whitespace-nowrap">{format(new Date(tx.transaction_date), 'MMM d, yyyy')}</td>
                            <td className="p-2">{tx.description}</td>
                            <td className="p-2 text-slate-600">{tx.reference || '-'}</td>
                            <td className="p-2 capitalize whitespace-nowrap">
                              {tx.source_type ? tx.source_type.replace('_', ' ') : 'manual'}
                            </td>
                            <td className="p-2 text-right text-green-600 font-medium">
                              {tx.credit_amount ? `$${tx.credit_amount.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-right text-red-600 font-medium">
                              {tx.debit_amount ? `$${tx.debit_amount.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-right font-medium">
                              ${tx.calculatedBalance.toFixed(2)}
                            </td>
                            <td className="p-2 text-center no-print">
                              {tx.cleared ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600 inline" />
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}