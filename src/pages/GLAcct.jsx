import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChartOfAccount } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Calendar, Printer } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GLAcctPage() {
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const accountNumber = urlParams.get('account');
  const urlStartDate = urlParams.get('startDate');
  const urlEndDate = urlParams.get('endDate');

  // Determine initial dates from URL or defaults
  const initialStartDate = urlStartDate || format(subDays(new Date(), 365), 'yyyy-MM-dd');
  const initialEndDate = urlEndDate || format(new Date(), 'yyyy-MM-dd');
  
  // Date range input state (not applied yet)
  const [daysBack, setDaysBack] = useState(365);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  
  // Applied date range state (used for filtering)
  const [appliedStartDate, setAppliedStartDate] = useState(initialStartDate);
  const [appliedEndDate, setAppliedEndDate] = useState(initialEndDate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!accountNumber) {
        setLoading(false);
        return;
      }
      
      console.log('Loading data for account:', accountNumber);
      console.log('Date range:', appliedStartDate, 'to', appliedEndDate);
      
      // Fetch account details
      const accountData = await ChartOfAccount.filter({ account_number: accountNumber });
      setAccount(accountData[0] || null);

      // Fetch transactions via backend function
      const response = await base44.functions.invoke('getGLAccountTransactions', {
        accountNumber: accountNumber,
        appliedStartDate: appliedStartDate,
        appliedEndDate: appliedEndDate
      });

      console.log('Backend response:', response);

      if (response.data?.success) {
        // Backend returns transactions already processed with running balance
        setTransactions(response.data.transactions || []);
        console.log(`Loaded ${response.data.transactions?.length || 0} transactions`);
      } else {
        console.error('Backend error:', response.data?.error);
        alert('Failed to load transactions: ' + (response.data?.error || 'Unknown error'));
        setTransactions([]);
      }
    } catch (error) {
      console.error('Error loading account data:', error);
      alert('Failed to load account data: ' + error.message);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [accountNumber, appliedStartDate, appliedEndDate]);

  // Load data when component mounts or when applied dates change
  useEffect(() => {
    if (accountNumber && appliedStartDate && appliedEndDate) {
      loadData();
    }
  }, [accountNumber, appliedStartDate, appliedEndDate, loadData]);

  // Apply date range filter
  const handleApplyDateRange = () => {
    // Update applied dates - this will trigger loadData via useEffect
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  // Calculate start date from days back (separate from Apply)
  const handleDaysBackChange = (value) => {
    setDaysBack(value);
    const calculatedStartDate = format(subDays(new Date(endDate), parseInt(value) || 0), 'yyyy-MM-dd');
    setStartDate(calculatedStartDate);
  };

  // Handle back button - close window if opened in new tab
  const handleBack = () => {
    // Check if this window was opened by another window
    if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      // Fallback to navigation if not opened as popup
      window.location.href = createPageUrl('ChartOfAccounts');
    }
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Transactions are already processed by backend with balance calculated
  // Just use them directly
  const transactionsWithBalance = transactions;

  const accountTypeColors = {
    'Asset': 'bg-blue-100 text-blue-800',
    'Liability': 'bg-red-100 text-red-800',
    'Equity': 'bg-purple-100 text-purple-800',
    'Revenue': 'bg-green-100 text-green-800',
    'Expense': 'bg-orange-100 text-orange-800'
  };

  // Helper function to format date without timezone issues
  const formatTransactionDate = (dateString) => {
    if (!dateString) return '';
    
    try {
      // Parse the date string as local date to avoid timezone shifts
      const parts = dateString.split('-');
      if (parts.length !== 3) return dateString;
      
      const [year, month, day] = parts;
      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      
      if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
        return dateString;
      }
      
      const date = new Date(yearNum, monthNum - 1, dayNum);
      
      if (isNaN(date.getTime())) {
        return dateString;
      }
      
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  if (!account && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-700">
        <h1 className="text-4xl font-bold mb-4">Account Not Found</h1>
        <p className="text-lg mb-8">The account you are looking for does not exist.</p>
        <Button onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Chart of Accounts
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      {/* Print Styles */}
      <style>{`
        @media print {
          /* Hide non-printable UI elements */
          .no-print {
            display: none !important;
          }
          
          /* Reset page styles for printing */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Hide navigation and layout elements */
          body > div > div > header,
          body > div > header,
          body header,
          header {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Container adjustments */
          .print-container {
            max-width: 100% !important;
            padding: 10mm 0 !important;
            background: white !important;
            margin: 0 auto !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
          /* Print header styles */
          .print-header {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
            text-align: center;
          }
          
          .print-header h1 {
            font-size: 18pt;
            font-weight: bold;
            margin: 0 0 10px 0;
            color: #000 !important;
            display: block !important;
          }
          
          .print-header .info-line {
            font-size: 10pt;
            margin: 3px 0;
            color: #333 !important;
            display: block !important;
          }
          
          /* Make sure card content is visible */
          .print-card {
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
          .print-card > div {
            display: block !important;
            visibility: visible !important;
            padding: 0 !important;
          }
          
          /* Table container */
          .overflow-x-auto {
            overflow: visible !important;
            display: block !important;
          }
          
          /* Table styles for printing */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            font-size: 9pt !important;
            display: table !important;
            visibility: visible !important;
            opacity: 1 !important;
            background: white !important;
          }
          
          thead {
            display: table-header-group !important;
            visibility: visible !important;
          }
          
          tbody {
            display: table-row-group !important;
            visibility: visible !important;
          }
          
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
            display: table-row !important;
            visibility: visible !important;
          }
          
          th {
            background-color: #f5f5f5 !important;
            color: #000 !important;
            font-weight: bold !important;
            border: 1px solid #999 !important;
            padding: 4px 6px !important;
            text-align: left !important;
            font-size: 9pt !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          
          td {
            border: 1px solid #ccc !important;
            padding: 3px 6px !important;
            color: #000 !important;
            font-size: 9pt !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          
          td > div {
            display: block !important;
            visibility: visible !important;
          }
          
          td > div > span {
            display: inline !important;
            visibility: visible !important;
          }
          
          /* Color adjustments for print */
          .text-green-600 {
            color: #000 !important;
          }
          
          .text-red-600 {
            color: #000 !important;
          }
          
          .text-slate-900 {
            color: #000 !important;
          }
          
          .text-slate-500 {
            color: #666 !important;
          }
          
          .font-medium {
            font-weight: 500 !important;
          }
          
          .font-semibold {
            font-weight: 600 !important;
          }
          
          /* Column widths for better fitting */
          th:nth-child(1), td:nth-child(1) { width: 12% !important; }
          th:nth-child(2), td:nth-child(2) { width: 48% !important; }
          th:nth-child(3), td:nth-child(3) { width: 13% !important; text-align: right !important; }
          th:nth-child(4), td:nth-child(4) { width: 13% !important; text-align: right !important; }
          th:nth-child(5), td:nth-child(5) { width: 14% !important; text-align: right !important; }
          
          /* Page settings with footer for page numbers */
          @page {
            margin: 8mm 6mm 15mm 6mm;
            size: landscape;
            
            @bottom-center {
              content: "Page " counter(page) " of " counter(pages);
              font-size: 9pt;
              color: #333;
            }
          }
        }
        
        /* Hide print header on screen */
        .print-header {
          display: none;
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6 print-container">
        {/* Print Header - Only visible when printing */}
        <div className="print-header">
          <h1>Account {account?.account_number} - {account?.account_name}</h1>
          <div className="info-line">
            <strong>Date Range:</strong> {formatTransactionDate(appliedStartDate)} to {formatTransactionDate(appliedEndDate)}
          </div>
          <div className="info-line">
            <strong>Report Date:</strong> {format(new Date(), 'MMMM d, yyyy h:mm a')}
          </div>
        </div>

        {/* Header with Account Info and Date Filters - Hidden when printing */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 no-print">
          {/* Left Side: Back Button + Account Info */}
          <div className="flex items-center gap-4 flex-1">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900">
                Account {account?.account_number} - {account?.account_name || 'Loading...'}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {account && (
                  <Badge className={accountTypeColors[account.account_type]}>
                    {account.account_type}
                  </Badge>
                )}
                <p className="text-slate-600">General ledger transactions</p>
              </div>
            </div>
          </div>
          
          {/* Right Side: Date Range Filters */}
          <div className="flex flex-wrap items-end gap-3 lg:ml-0 ml-14">
            <div className="space-y-1">
              <Label htmlFor="days-back" className="text-xs text-slate-600">Days Back</Label>
              <Input
                id="days-back"
                type="number"
                value={daysBack}
                onChange={(e) => handleDaysBackChange(e.target.value)}
                placeholder="365"
                className="w-24 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="start-date" className="text-xs text-slate-600">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date" className="text-xs text-slate-600">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40 bg-white"
              />
            </div>
            <Button onClick={handleApplyDateRange} className="bg-blue-600 hover:bg-blue-700" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Apply
            </Button>
          </div>
        </div>

        <Card className="print-card">
          <CardHeader className="no-print">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Transactions ({transactionsWithBalance.length})
              </CardTitle>
              <Button 
                onClick={handlePrint} 
                variant="outline" 
                size="sm"
                className="no-print"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
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
                    <th className="text-right p-3 font-semibold text-slate-700">Debit</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Credit</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
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
                      </tr>
                    ))
                  ) : transactionsWithBalance.length > 0 ? (
                    transactionsWithBalance.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">{formatTransactionDate(tx.transaction_date)}</td>
                        <td className="p-3">
                          <div>
                            <span className="font-medium text-slate-900">{tx.description}</span>
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
                            <span className="font-medium text-green-600">${tx.credit_amount.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          ${tx.balance.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="p-12 text-center">
                        <div className="text-slate-400 mb-4">
                          <BookOpen className="w-12 h-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Transactions</h3>
                        <p className="text-slate-600 mb-4">No transactions found in the selected date range.</p>
                        <Link to={createPageUrl('JournalEntries')}>
                          <Button>Create Journal Entry</Button>
                        </Link>
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
  );
}