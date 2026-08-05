import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Printer, DollarSign } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";

import TakePaymentModal from '@/components/ar/TakePaymentModal';
import StatementModal from '@/components/ar/StatementModal';
import InterestCalculationModal from '@/components/ar/InterestCalculationModal'; // Added import for InterestCalculationModal

export default function CustomerARSummaryPage() {
  const [arSummaryData, setArSummaryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [showOnlyWithBalance, setShowOnlyWithBalance] = useState(true);

  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch AR summary data from backend
      const { data: response, error: summaryError } = await supabase.functions.invoke('autopro-supabaseCustomerARSummary', {
        body: {
          searchTerm: activeSearchTerm,
          showOnlyWithBalance,
          asOfDate
        }
      });

      if (!summaryError && response?.success) {
        // Sort alphabetically
        const sortedData = response.arSummaryData.sort((a, b) => {
           const getName = (c) => {
               if (c.org_name) return c.org_name;
               return [c.first_name, c.last_name].filter(Boolean).join(' ');
           };
           const nameA = getName(a.customer).toLowerCase();
           const nameB = getName(b.customer).toLowerCase();
           return nameA.localeCompare(nameB);
        });
        setArSummaryData(sortedData);
      } else {
        console.error('Failed to load AR summary:', summaryError?.message || response?.error);
        setArSummaryData([]);
      }


    } catch (error) {
      console.error('Error loading A/R data:', error);
      setArSummaryData([]);
    } finally {
      setLoading(false);
    }
    }, [activeSearchTerm, showOnlyWithBalance, asOfDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredData = arSummaryData; // Backend already handles filtering by searchTerm

  // Helper function to format customer name
  const formatCustomerName = (customer) => {
    if (!customer) return '';
    if (customer.org_name) {
      const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
    }
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  };

  const totals = useMemo(() => {
    return arSummaryData.reduce((acc, item) => {
      acc.balance_0_30 += item.balance_0_30;
      acc.balance_31_60 += item.balance_31_60;
      acc.balance_60_plus += item.balance_60_plus;
      acc.total_balance += item.total_balance;
      return acc;
    }, {
      balance_0_30: 0,
      balance_31_60: 0,
      balance_60_plus: 0,
      total_balance: 0
    });
  }, [arSummaryData]);

  // handleTakePayment is now simplified, as the modal will handle the payment creation
  // and then call this to refresh the data.
  const handleTakePayment = async () => {
    // Refresh data after payment is processed by the TakePaymentModal
    await loadData();
  };
  
  const handleRowClick = (customer) => {
    navigate(`/CustomerARTransactions?customerId=${customer.id}`);
  };

  const handleContextMenuOpen = (customer) => {
    setSelectedCustomer(customer);
  };

  const handleTakePaymentClick = () => {
    if (selectedCustomer) {
      setShowPaymentModal(true);
    }
  };

  const handlePrintStatementClick = () => {
    if (selectedCustomer) {
      setShowStatementModal(true);
    }
  };



  const handlePrint = () => {
    window.print();
  };

  // New handler for when interest calculation is completed
  const handleInterestCalculated = () => {
    loadData(); // Reload data after interest is applied
    setShowInterestModal(false); // Close the modal
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }

          /* Force light/black output regardless of app dark mode */
          body { background-color: white !important; }
          [class*="bg-slate-"], [class*="bg-white"], .bg-card {
            background-color: white !important;
          }
          .text-slate-900, .text-slate-700, .text-slate-600, .text-slate-500, .text-slate-400, .text-card-foreground {
            color: #000 !important;
          }
          .text-yellow-600, .text-yellow-700 {
            color: #a16207 !important;
          }
          .text-red-600, .text-red-700 {
            color: #dc2626 !important;
          }
        }
      `}</style>
      
      <div className="p-6 min-h-screen dark:bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 no-print">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Accounts Receivable Summary</h1>
            <div className="flex gap-2"> {/* Added a flex container for buttons */}
              <Button onClick={handlePrint} variant="outline" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700">
                <Printer className="w-4 h-4 mr-2" />
                Print Summary
              </Button>
              <Button 
                onClick={() => setShowInterestModal(true)} 
                variant="outline"
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-900 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Calculate Interest
              </Button>
            </div>
          </div>
          
          <div className="print-area">
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <CardTitle>Customer Balances</CardTitle>
                    <span className="hidden print:inline text-sm font-medium text-slate-600 dark:text-slate-400">
                      As of: {asOfDate}
                    </span>
                    <div className="flex items-center gap-2 no-print">
                      <Checkbox 
                        id="show-only-balance"
                        checked={showOnlyWithBalance}
                        onCheckedChange={setShowOnlyWithBalance}
                      />
                      <label 
                        htmlFor="show-only-balance"
                        className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
                      >
                        Only display customers with a balance
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-2 no-print ml-4 border-l pl-4 border-slate-200 dark:border-slate-700">
                      <label htmlFor="as-of-date" className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        As Of:
                      </label>
                      <Input
                        id="as-of-date"
                        type="date"
                        value={asOfDate}
                        onChange={(e) => setAsOfDate(e.target.value)}
                        className="w-40 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="relative no-print">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                      placeholder="Search Customers (Press Enter)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setActiveSearchTerm(searchTerm);
                        }
                      }}
                      className="pl-10 w-96 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border dark:border-slate-800 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-100 dark:bg-slate-800">
                      <TableRow>
                        <TableHead className="text-left font-semibold text-slate-700 dark:text-slate-300">Customer</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-300">0-30 Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-300">31-60 Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-300">60+ Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-300">Total Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center p-4 text-slate-500 dark:text-slate-400">Loading...</TableCell>
                        </TableRow>
                      ) : arSummaryData.length > 0 ? (
                        <>
                            {arSummaryData.map(({ customer, balance_0_30, balance_31_60, balance_60_plus, total_balance }, index) => (
                            <ContextMenu key={customer.id} onOpenChange={() => handleContextMenuOpen(customer)}>
                              <ContextMenuTrigger asChild>
                                <TableRow 
                                  className={`cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/50 ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}`} 
                                  onClick={() => handleRowClick(customer)}
                                >
                                  <TableCell className="font-medium dark:text-slate-100">{formatCustomerName(customer)}</TableCell>
                                  <TableCell className="text-right dark:text-slate-200">${balance_0_30.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-yellow-600 dark:text-yellow-500">${balance_31_60.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-red-600 dark:text-red-400">${balance_60_plus.toFixed(2)}</TableCell>
                                  <TableCell className="text-right font-bold dark:text-slate-100">${total_balance.toFixed(2)}</TableCell>
                                </TableRow>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={handleTakePaymentClick}>
                                  <DollarSign className="w-4 h-4 mr-2" />
                                  Take Payment
                                </ContextMenuItem>
                                <ContextMenuItem onClick={handlePrintStatementClick}>
                                  <Printer className="w-4 h-4 mr-2" />
                                  Statement
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ))}
                          {/* Totals Row */}
                          <TableRow className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-bold">
                            <TableCell className="font-bold text-slate-900 dark:text-slate-100">TOTALS</TableCell>
                            <TableCell className="text-right text-slate-900 dark:text-slate-100">${totals.balance_0_30.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-yellow-700 dark:text-yellow-500">${totals.balance_31_60.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-red-700 dark:text-red-400">${totals.balance_60_plus.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold text-slate-900 dark:text-slate-100 text-lg">${totals.total_balance.toFixed(2)}</TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center h-24 text-slate-500 dark:text-slate-400">No customers with outstanding balances found.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {showPaymentModal && selectedCustomer && (
          <TakePaymentModal
            open={showPaymentModal}
            onClose={() => {
              setShowPaymentModal(false);
              setSelectedCustomer(null);
            }}
            customer={selectedCustomer}
            invoices={[]}
            onTakePayment={handleTakePayment} // Pass the simplified handleTakePayment
          />
        )}

        {showStatementModal && selectedCustomer && (
          <StatementModal
            open={showStatementModal}
            onClose={() => {
              setShowStatementModal(false);
              setSelectedCustomer(null);
            }}
            customer={selectedCustomer}
          />
        )}

        {/* New Interest Calculation Modal */}
        <InterestCalculationModal
          open={showInterestModal}
          onClose={() => setShowInterestModal(false)}
          customers={arSummaryData.map(item => item.customer)}
          onInterestCalculated={handleInterestCalculated}
          />
      </div>
    </>
  );
}