import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BookOpen, Calendar, Printer, Search, ArrowLeft } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { getMountainTimeNow } from '@/components/utils/mountainTimeUtils';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GLJournalPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountsMap, setAccountsMap] = useState({});

  const urlParams = new URLSearchParams(window.location.search);
  const urlStartDate = urlParams.get('startDate');
  const urlEndDate = urlParams.get('endDate');

  // Determine initial dates from URL or defaults
  const initialStartDate = urlStartDate || format(subDays(getMountainTimeNow(), 30), 'yyyy-MM-dd');
  const initialEndDate = urlEndDate || format(getMountainTimeNow(), 'yyyy-MM-dd');
  
  // Date range input state (not applied yet)
  const [daysBack, setDaysBack] = useState(30);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  
  // Applied date range state (used for filtering)
  const [appliedStartDate, setAppliedStartDate] = useState(initialStartDate);
  const [appliedEndDate, setAppliedEndDate] = useState(initialEndDate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      console.log('Loading all GL transactions');
      console.log('Date range:', appliedStartDate, 'to', appliedEndDate);
      
      // Fetch chart of accounts for tooltips
      const accounts = await base44.entities.ChartOfAccount.list();
      const accountMap = {};
      accounts.forEach(acc => {
        accountMap[acc.account_number] = acc.account_name;
      });
      setAccountsMap(accountMap);
      
      // Fetch transactions filtered by date range directly from the database
      const query = {
        transaction_date: {
          $gte: appliedStartDate,
          $lte: appliedEndDate + 'T23:59:59.999Z'
        }
      };
      const filteredTransactions = await base44.entities.GLTransaction.filter(query, '-transaction_date', 20000);

      // Sort by date (newest first)
      const sortedTransactions = filteredTransactions.sort((a, b) => {
        return new Date(b.transaction_date) - new Date(a.transaction_date);
      });

      setTransactions(sortedTransactions);
      console.log(`Loaded ${sortedTransactions.length} transactions`);
    } catch (error) {
      console.error('Error loading GL transactions:', error);
      alert('Failed to load transactions: ' + error.message);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [appliedStartDate, appliedEndDate]);

  // Load data when component mounts or when applied dates change
  useEffect(() => {
    if (appliedStartDate && appliedEndDate) {
      loadData();
    }
  }, [appliedStartDate, appliedEndDate, loadData]);

  // Apply date range filter
  const handleApplyDateRange = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  // Calculate start date from days back
  const handleDaysBackChange = (value) => {
    setDaysBack(value);
    const calculatedStartDate = format(subDays(new Date(endDate), parseInt(value) || 0), 'yyyy-MM-dd');
    setStartDate(calculatedStartDate);
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Helper function to format date without timezone issues
  const formatTransactionDate = (dateString) => {
    if (!dateString) return '';
    
    try {
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

  const filteredDisplayTransactions = transactions.filter(tx => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      tx.account_number?.toLowerCase().includes(search) ||
      tx.description?.toLowerCase().includes(search) ||
      tx.reference?.toLowerCase().includes(search) ||
      String(tx.debit_amount || '').includes(search) ||
      String(tx.credit_amount || '').includes(search)
    );
  });

  const totalDebit = filteredDisplayTransactions.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
  const totalCredit = filteredDisplayTransactions.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);

  console.log('DEBUG GLJournal: Final filteredDisplayTransactions count:', filteredDisplayTransactions.length);
  const missingTxId = '697c35a6a1e978baa77c2cd3';
  const foundMissingTx = filteredDisplayTransactions.find(tx => tx.id === missingTxId);
  if (foundMissingTx) {
    console.log('DEBUG GLJournal: Missing transaction IS present in final display list!', foundMissingTx);
  } else {
    console.log('DEBUG GLJournal: Missing transaction IS NOT present in final display list.', {missingTxId: missingTxId, appliedStartDate: appliedStartDate, appliedEndDate: appliedEndDate, searchTerm: searchTerm});
  }

  return (
    <div className="p-6 min-h-screen">
      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          body > div > div > header,
          body > div > header,
          body header,
          header {
            display: none !important;
            visibility: hidden !important;
          }
          
          .min-h-screen {
            min-height: 0 !important;
            height: auto !important;
            background-color: white !important;
          }
          
          div[class*="bg-slate-"] {
             background-color: white !important;
          }
          
          .print-container {
            max-width: 100% !important;
            padding: 10mm 0 !important;
            background: white !important;
            margin: 0 auto !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
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
          
          .overflow-x-auto {
            overflow: visible !important;
            display: block !important;
          }
          
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
          
          /* Remove colored backgrounds on print */
          .bg-green-50, .bg-red-50, .bg-purple-50, .bg-blue-50, .bg-slate-50, .bg-slate-100, .bg-orange-50 {
             background-color: white !important;
          }
          
          th:nth-child(1), td:nth-child(1) { width: 10% !important; }
          th:nth-child(2), td:nth-child(2) { width: 10% !important; }
          th:nth-child(3), td:nth-child(3) { width: 45% !important; }
          th:nth-child(4), td:nth-child(4) { width: 12% !important; text-align: right !important; }
          th:nth-child(5), td:nth-child(5) { width: 12% !important; text-align: right !important; }
          
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
        
        .print-header {
          display: none;
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6 print-container">
        {/* Print Header - Only visible when printing */}
        <div className="print-header">
          <h1>General Ledger Journal</h1>
          <div className="info-line">
            <strong>Date Range:</strong> {formatTransactionDate(appliedStartDate)} to {formatTransactionDate(appliedEndDate)}
          </div>
          <div className="info-line">
            <strong>Report Date:</strong> {format(getMountainTimeNow(), 'MMMM d, yyyy h:mm a')}
          </div>
        </div>

        {/* Header with Date Filters - Hidden when printing */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 no-print">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">GL Journal</h1>
            <p className="text-slate-600 mt-1">All general ledger transactions</p>
          </div>
          
          {/* Search and Date Range Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="search" className="text-xs text-slate-600">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Account, description, ref..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-56 bg-white"
                />
              </div>
            </div>
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
                Transactions ({filteredDisplayTransactions.length})
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
                    <th className="text-left p-3 font-semibold text-slate-700">Account</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Debit</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array(10).fill(0).map((_, i) => (
                      <tr key={i} className="border-b animate-pulse">
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                      </tr>
                    ))
                  ) : filteredDisplayTransactions.length > 0 ? (
                    <>
                      {filteredDisplayTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">{formatTransactionDate(tx.transaction_date)}</td>
                        <td className="p-3 font-medium text-slate-900">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{tx.account_number}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{accountsMap[tx.account_number] || 'Unknown Account'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
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
                      </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <td colSpan="3" className="p-3 text-right text-slate-700">Totals:</td>
                        <td className="p-3 text-right text-red-600">${totalDebit.toFixed(2)}</td>
                        <td className="p-3 text-right text-green-600">${totalCredit.toFixed(2)}</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan="5" className="p-12 text-center">
                        <div className="text-slate-400 mb-4">
                          <BookOpen className="w-12 h-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Transactions</h3>
                        <p className="text-slate-600 mb-4">No transactions found in the selected date range.</p>
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