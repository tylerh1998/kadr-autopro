import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar as CalendarIcon, Plus, CheckCircle, FileText, DollarSign, AlertCircle, Trash2, RefreshCw, Printer, Briefcase } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';

// Import new modal components
import AddPaychequeModal from '../components/payroll/AddPaychequeModal';
import AddRemittanceModal from '../components/payroll/AddRemittanceModal';
import AddAdjustmentModal from '../components/payroll/AddAdjustmentModal';
import MarkPaidModal from '../components/payroll/MarkPaidModal';

export default function PayrollPage() {
  const { employee } = useAuth();
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: endOfMonth(new Date())
  });

  const calculateNetPay = (t) => {
    if (t.transaction_type !== 'Paycheque') return 0;
    const gross = t.gross_pay || 0;
    const deductions = (t.income_tax || 0) + (t.cpp_contribution || 0) + (t.cpp2_contribution || 0) + (t.ei_premium || 0);
    return gross - deductions;
  };
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);

  // State variables for controlling modal visibility
  const [showAddPaychequeModal, setShowAddPaychequeModal] = useState(false);
  const [showAddRemittanceModal, setShowAddRemittanceModal] = useState(false);
  const [showAddAdjustmentModal, setShowAddAdjustmentModal] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);

  const getCurrentMountainTimestamp = () => moment.tz('America/Edmonton').toISOString();
  const formatMountainDate = (value) => moment.tz(value, 'America/Edmonton').format('MMM D, YYYY');
  const getMountainDateKey = (value) => moment.tz(value, 'America/Edmonton').format('YYYY-MM-DD');

  // Load PayrollTransaction data
  useEffect(() => {
    loadTransactions();
  }, [dateRange, transactionTypeFilter]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('PayrollTransaction').select('*');
      if (error) {
        console.error('Error loading payroll transactions:', error);
        return;
      }

      const allTransactions = (data || []).map((transaction) => ({
        ...transaction,
        amount: transaction.amount === null || transaction.amount === undefined || transaction.amount === '' ? 0 : parseFloat(transaction.amount) || 0,
        gross_pay: transaction.gross_pay || 0,
        income_tax: transaction.income_tax || 0,
        cpp_contribution: transaction.cpp_contribution || 0,
        cpp2_contribution: transaction.cpp2_contribution || 0,
        ei_premium: transaction.ei_premium || 0,
        cpp_employer: transaction.cpp_employer || 0,
        cpp2_employer: transaction.cpp2_employer || 0,
        ei_employer: transaction.ei_employer || 0,
        is_paid: transaction.is_paid === true
      }));
      
      let filtered = allTransactions.filter(transaction => {
        const transactionDateKey = getMountainDateKey(transaction.pay_date);
        const fromDateKey = dateRange.from ? moment(dateRange.from).format('YYYY-MM-DD') : null;
        const toDateKey = dateRange.to ? moment(dateRange.to).format('YYYY-MM-DD') : null;

        if (fromDateKey && transactionDateKey < fromDateKey) return false;
        if (toDateKey && transactionDateKey > toDateKey) return false;
        return true;
      });
      
      if (transactionTypeFilter !== 'all') {
        filtered = filtered.filter(t => t.transaction_type === transactionTypeFilter);
      }
      
      filtered.sort((a, b) => moment.tz(b.pay_date, 'America/Edmonton').valueOf() - moment.tz(a.pay_date, 'America/Edmonton').valueOf());
      setTransactions(filtered);
      setSelectedTransactions([]);
    } catch (error) {
      console.error('Error loading payroll transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (range) => {
    setDateRange(range);
  };

  const handleDelete = async (transaction) => {
    if (window.confirm(`Are you sure you want to reverse this ${transaction.transaction_type}? This will create a negative adjustment to reverse the transaction.`)) {
      try {
        // Determine the amount to reverse
        let reversalAmount = 0;
        let reversalDescription = '';

        if (transaction.transaction_type === 'Paycheque') {
          reversalAmount = -calculateNetPay(transaction);
          reversalDescription = `Reversal of Paycheque ${transaction.paycheque_number || ''} dated ${formatMountainDate(transaction.pay_date)}`;
        } else if (transaction.transaction_type === 'Remittance') {
          // Sum up all deduction amounts for remittance reversal
          const totalRemittanceAmount = (transaction.income_tax || 0) + 
                                        (transaction.cpp_contribution || 0) + (transaction.cpp_employer || 0) +
                                        (transaction.ei_premium || 0) + (transaction.ei_employer || 0);
          reversalAmount = -totalRemittanceAmount;
          reversalDescription = `Reversal of Remittance dated ${formatMountainDate(transaction.pay_date)}`;
        } else if (transaction.transaction_type === 'Adjustment') {
          reversalAmount = -(transaction.amount || 0);
          reversalDescription = `Reversal of Adjustment: ${transaction.adjustment_reason || ''} dated ${formatMountainDate(transaction.pay_date)}`;
        }

        const currentUser = employee;
        const currentTimestamp = getCurrentMountainTimestamp();

        // Create reversal adjustment
        const { error: reversalError } = await supabase.from('PayrollTransaction').insert({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          transaction_type: 'Adjustment',
          pay_date: format(new Date(), 'yyyy-MM-dd'),
          amount: String(reversalAmount),
          adjustment_reason: reversalDescription,
          gl_account: transaction.transaction_type === 'Adjustment' ? (transaction.gl_account || '5005') : '5005',
          notes: `Original transaction ID: ${transaction.id}`,
          is_paid: false,
          created_date: currentTimestamp,
          updated_date: currentTimestamp,
          created_by_id: currentUser?.id || null,
          created_by: currentUser?.User_name || currentUser?.full_name || currentUser?.email || null
        });
        if (reversalError) throw reversalError;

        alert('Reversal adjustment created successfully. The original transaction remains for audit purposes.');
        
        // Reload transactions
        loadTransactions();
      } catch (error) {
        console.error('Error creating reversal:', error);
        alert('Failed to create reversal adjustment. Please try again.');
      }
    }
  };

  const handleToggleSelection = (transactionId) => {
    setSelectedTransactions(prev => {
      if (prev.includes(transactionId)) {
        return prev.filter(id => id !== transactionId);
      } else {
        return [...prev, transactionId];
      }
    });
  };

  const handleMarkPaidClick = () => {
    const unpaidSelected = transactions.filter(t => 
      selectedTransactions.includes(t.id) && !t.is_paid
    );

    if (unpaidSelected.length === 0) {
      alert('Please select at least one unpaid transaction to mark as paid.');
      return;
    }

    setShowMarkPaidModal(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedTransactionObjects = transactions.filter(t => selectedTransactions.includes(t.id) && !t.is_paid);

  // Calculate summary statistics
  const summaryStats = {
    totalPaycheques: transactions.filter(t => t.transaction_type === 'Paycheque').length,
    totalRemittances: transactions.filter(t => t.transaction_type === 'Remittance').length,
    totalAdjustments: transactions.filter(t => t.transaction_type === 'Adjustment').length,
    unpaidItems: transactions.filter(t => !t.is_paid).length,
  };

  // Calculate monetary totals for print summary
  const totalGrossPay = transactions
    .filter(t => t.transaction_type === 'Paycheque' && t.gross_pay)
    .reduce((sum, t) => sum + t.gross_pay, 0);

  const totalNetPay = transactions
    .filter(t => t.transaction_type === 'Paycheque')
    .reduce((sum, t) => sum + calculateNetPay(t), 0);

  const totalRemittanceAmount = transactions
    .filter(t => t.transaction_type === 'Remittance' && t.amount)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalAdjustmentAmount = transactions
    .filter(t => t.transaction_type === 'Adjustment' && t.amount)
    .reduce((sum, t) => sum + t.amount, 0);

  const getTransactionBadgeColor = (type) => {
    switch (type) {
      case 'Paycheque':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      case 'Remittance':
        return 'bg-slate-900 text-white';
      case 'Adjustment':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-700/60 dark:text-slate-300';
    }
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
            padding: 20px;
            box-sizing: border-box;
          }
          .no-print { display: none !important; }
          .print-header { 
            display: block !important; 
            text-align: center; 
            margin-bottom: 20px; 
            font-size: 18px; 
            font-weight: bold; 
            color: #000;
          }
          .print-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 10px;
          }
          .print-table th, .print-table td { 
            border: 1px solid #ddd;
            padding: 8px; 
            text-align: left; 
            font-size: 12px; 
            color: #000;
          }
          .print-table th { 
            background-color: #f2f2f2;
            font-weight: bold; 
          }
          .print-table tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .print-table .font-medium, .print-table .font-bold, .print-table .font-semibold {
            font-weight: bold !important;
          }
          .print-table .text-red-600 {
            color: red !important;
          }
          .print-table .text-green-600 {
            color: green !important;
          }
          /* Specific print styles for badges to ensure visibility */
          .print-table .bg-green-100 { background-color: #d1fae5 !important; }
          .print-table .text-green-800 { color: #065f46 !important; }
          .print-table .bg-blue-100 { background-color: #dbeafe !important; }
          .print-table .text-blue-800 { color: #1e40af !important; }
          .print-table .bg-orange-100 { background-color: #ffedd5 !important; }
          .print-table .text-orange-800 { color: #9a3412 !important; }
          .print-table .bg-red-100 { background-color: #fee2e2 !important; }
          .print-table .text-red-800 { color: #991b1b !important; }
          .print-table .bg-slate-900 { background-color: #0f172a !important; }
          .print-table .text-white { color: #ffffff !important; }
          .print-table .bg-gray-100 { background-color: #f3f4f6 !important; }
          .print-table .text-gray-800 { color: #1f2937 !important; }
          .print-table .border-red-300 { border-color: #fca5a5 !important; }
          .print-table .text-red-700 { color: #b91c1c !important; }
          .print-table .border-orange-300 { border-color: #fdba74 !important; }
          .print-table .text-orange-700 { color: #c2410c !important; }


          .print-summary {
            display: block !important;
            margin-top: 20px;
            padding: 10px;
            border-top: 2px solid #000;
            color: #000;
          }
          .print-summary-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-size: 14px;
            color: #000;
          }
        }
      `}</style>
      
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Payroll Management</h1>
              <p className="text-slate-600 mt-1 dark:text-slate-400">Manage all payroll transactions in one place</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal w-[240px]",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={handleDateSelect}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {/* Transaction Type Filter */}
              <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                <SelectTrigger className="w-[160px] bg-white dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600">
                  <SelectValue placeholder="All Transactions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transactions</SelectItem>
                  <SelectItem value="Paycheque">Paycheques</SelectItem>
                  <SelectItem value="Remittance">Remittances</SelectItem>
                  <SelectItem value="Adjustment">Adjustments</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button variant="outline" size="icon" onClick={loadTransactions} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>

            </div>
          </div>

          {/* This div contains all printable content */}
          <div className="print-area">
            {/* Print-only Header */}
            <div className="print-header" style={{ display: 'none' }}>
              <div>Payroll Transactions Report</div>
              <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '5px' }}>
                {dateRange?.from && dateRange?.to ? (
                  <>Period: {format(dateRange.from, "MMMM d, yyyy")} - {format(dateRange.to, "MMMM d, yyyy")}</>
                ) : (
                  <>All Transactions</>
                )}
              </div>
              {transactionTypeFilter !== 'all' && (
                <div style={{ fontSize: '14px', fontWeight: 'normal' }}>
                  Type: {transactionTypeFilter}
                </div>
              )}
              <div style={{ fontSize: '12px', fontWeight: 'normal', color: '#666', marginTop: '5px' }}>
                Generated: {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
              </div>
            </div>

            {/* Transactions Table */}
            <Card>
              <CardHeader className="no-print flex flex-row items-center justify-between">
                <CardTitle>Payroll Transactions</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 gap-2"
                    onClick={() => setShowAddPaychequeModal(true)}
                  >
                    <DollarSign className="w-4 h-4" />
                    Add Paycheque
                  </Button>
                  <Button 
                    className="bg-green-600 hover:bg-green-700 gap-2"
                    onClick={handleMarkPaidClick}
                    disabled={selectedTransactionObjects.length === 0}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark Paid ({selectedTransactionObjects.length})
                  </Button>
                  <Button 
                    className="bg-black text-white hover:bg-slate-800 gap-2"
                    onClick={() => setShowAddRemittanceModal(true)}
                  >
                    <FileText className="w-4 h-4" />
                    Add Remittance
                  </Button>
                  <Button 
                    className="bg-red-600 hover:bg-red-700 gap-2"
                    onClick={() => setShowAddAdjustmentModal(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Add Adjustment
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handlePrint}
                    title="Print Report"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 mx-auto text-slate-400 animate-spin mb-4" />
                    <p className="text-slate-600 dark:text-slate-400">Loading transactions...</p>
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden dark:border-slate-700">
                    <Table className="print-table">
                      <TableHeader className="bg-slate-50 dark:bg-slate-800">
                        <TableRow>
                          <TableHead className="w-10 no-print">
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTransactions(transactions.filter(t => !t.is_paid).map(t => t.id));
                                } else {
                                  setSelectedTransactions([]);
                                }
                              }}
                              checked={selectedTransactions.length > 0 && selectedTransactions.length === transactions.filter(t => !t.is_paid).length}
                              className="rounded border-gray-300 dark:border-slate-600"
                            />
                          </TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Gross Pay</TableHead>
                          <TableHead className="text-right">Net Pay / Amount</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center no-print">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((transaction) => (
                          <TableRow key={transaction.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <TableCell className="no-print">
                              {!transaction.is_paid && (
                                <input
                                  type="checkbox"
                                  checked={selectedTransactions.includes(transaction.id)}
                                  onChange={() => handleToggleSelection(transaction.id)}
                                  className="rounded border-gray-300 dark:border-slate-600"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={getTransactionBadgeColor(transaction.transaction_type)}>
                                {transaction.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatMountainDate(transaction.pay_date)}
                            </TableCell>
                            <TableCell className="text-right">
                              {transaction.transaction_type === 'Paycheque' && transaction.gross_pay ? (
                                <span className="font-semibold">${transaction.gross_pay.toFixed(2)}</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {transaction.transaction_type === 'Paycheque' ? (
                                <span className="font-bold text-green-600 dark:text-green-400">${calculateNetPay(transaction).toFixed(2)}</span>
                              ) : transaction.amount ? (
                                <span className="font-bold text-blue-600 dark:text-blue-400">${transaction.amount.toFixed(2)}</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm space-y-1">
                                {transaction.transaction_type === 'Paycheque' && transaction.paycheque_number && (
                                  <div><span className="font-medium">Paycheque #:</span> {transaction.paycheque_number}</div>
                                )}
                                {transaction.transaction_type === 'Remittance' && (
                                  <div className="space-y-0.5">
                                    {transaction.income_tax > 0 && <div className="text-xs">Income Tax: ${transaction.income_tax.toFixed(2)}</div>}
                                    {(transaction.cpp_contribution > 0 || transaction.cpp_employer > 0) && (
                                      <div className="text-xs">CPP: ${((transaction.cpp_contribution || 0) + (transaction.cpp_employer || 0)).toFixed(2)}</div>
                                    )}
                                    {(transaction.ei_premium > 0 || transaction.ei_employer > 0) && (
                                      <div className="text-xs">EI: ${((transaction.ei_premium || 0) + (transaction.ei_employer || 0)).toFixed(2)}</div>
                                    )}
                                    {transaction.paycheque_numbers_included && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400">Paycheques: {transaction.paycheque_numbers_included}</div>
                                    )}
                                  </div>
                                )}
                                {transaction.transaction_type === 'Adjustment' && transaction.adjustment_reason && (
                                  <div className="text-xs text-slate-600 dark:text-slate-400">{transaction.adjustment_reason}</div>
                                )}
                                {transaction.notes && (
                                  <div className="text-xs text-slate-600 dark:text-slate-400 italic">{transaction.notes}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {transaction.is_paid ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900/60">
                                  Paid
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-900/60 dark:text-orange-400">
                                  Unpaid
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center no-print">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(transaction)}
                                disabled={transaction.is_paid}
                                className={cn(
                                  "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20",
                                  transaction.is_paid && "opacity-50 cursor-not-allowed text-gray-400 hover:text-gray-400 hover:bg-transparent dark:text-slate-600 dark:hover:text-slate-600"
                                )}
                                title={transaction.is_paid ? "Cannot delete paid transaction" : "Delete transaction"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    {/* Print-only Summary */}
                    <div className="print-summary" style={{ display: 'none' }}>
                      <div className="print-summary-row">
                        <span>Total Paycheques:</span>
                        <span>{summaryStats.totalPaycheques}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Total Remittances:</span>
                        <span>{summaryStats.totalRemittances}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Total Adjustments:</span>
                        <span>{summaryStats.totalAdjustments}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Unpaid Items:</span>
                        <span>{summaryStats.unpaidItems}</span>
                      </div>
                      <hr style={{margin: '10px 0', borderTop: '1px dashed #eee'}}/>
                      <div className="print-summary-row">
                        <span>Total Gross Pay:</span>
                        <span>${totalGrossPay.toFixed(2)}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Total Net Pay:</span>
                        <span>${totalNetPay.toFixed(2)}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Total Remitted:</span>
                        <span>${totalRemittanceAmount.toFixed(2)}</span>
                      </div>
                      <div className="print-summary-row">
                        <span>Total Adjustments (Net):</span>
                        <span>${totalAdjustmentAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 no-print">
                    <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Transactions Found</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                      {transactionTypeFilter !== 'all' 
                        ? `No ${transactionTypeFilter} transactions found for the selected date range.` 
                        : 'Get started by adding your first payroll transaction using the buttons above.'}
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline">Import Paycheques</Button>
                      <Button variant="outline">Import Remittances</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Modals */}
        <AddPaychequeModal
          open={showAddPaychequeModal}
          onClose={() => setShowAddPaychequeModal(false)}
          onSuccess={loadTransactions}
        />

        <AddRemittanceModal
          open={showAddRemittanceModal}
          onClose={() => setShowAddRemittanceModal(false)}
          onSuccess={loadTransactions}
        />

        <AddAdjustmentModal
          open={showAddAdjustmentModal}
          onClose={() => setShowAddAdjustmentModal(false)}
          onSuccess={loadTransactions}
        />

        <MarkPaidModal
          open={showMarkPaidModal}
          onClose={() => {
            setShowMarkPaidModal(false);
            setSelectedTransactions([]);
          }}
          transactions={selectedTransactionObjects}
          onSuccess={() => {
            loadTransactions();
            setSelectedTransactions([]);
          }}
        />
      </div>
    </>
  );
}