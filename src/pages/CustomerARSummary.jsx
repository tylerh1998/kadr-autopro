import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Customer, WorkOrder, CustomerPayments, CustomerARAdjustment } from '@/entities/all';
import { base44 } from '@/api/base44Client';
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
  const [workOrders, setWorkOrders] = useState([]); // Keep for context menu on Statement
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
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
      const response = await base44.functions.invoke('getCustomerARSummary', { 
        searchTerm: activeSearchTerm,
        showOnlyWithBalance
      });

      if (response.data.success) {
        // Sort alphabetically
        const sortedData = response.data.arSummaryData.sort((a, b) => {
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
        console.error('Failed to load AR summary:', response.data.error);
        setArSummaryData([]);
      }

      // Still need work orders for statement/payment modals
      const workOrdersData = await WorkOrder.filter({ stage: 'invoice' });
      setWorkOrders(workOrdersData);

    } catch (error) {
      console.error('Error loading A/R data:', error);
      setArSummaryData([]);
    } finally {
      setLoading(false);
    }
    }, [activeSearchTerm, showOnlyWithBalance]);

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

  const customerInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return workOrders.filter(wo => wo.customer_id === selectedCustomer.id);
  }, [selectedCustomer, workOrders]);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 no-print">
            <h1 className="text-3xl font-bold text-slate-900">Accounts Receivable Summary</h1>
            <div className="flex gap-2"> {/* Added a flex container for buttons */}
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print Summary
              </Button>
              <Button 
                onClick={() => setShowInterestModal(true)} 
                variant="outline"
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Calculate Interest
              </Button>
            </div>
          </div>
          
          <div className="print-area">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <CardTitle>Customer Balances</CardTitle>
                    <div className="flex items-center gap-2 no-print">
                      <Checkbox 
                        id="show-only-balance"
                        checked={showOnlyWithBalance}
                        onCheckedChange={setShowOnlyWithBalance}
                      />
                      <label 
                        htmlFor="show-only-balance"
                        className="text-sm text-slate-600 cursor-pointer"
                      >
                        Only display customers with a balance
                      </label>
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
                      className="pl-10 w-96"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-100">
                      <TableRow>
                        <TableHead className="text-left font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700">0-30 Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700">31-60 Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700">60+ Days</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700">Total Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center p-4 text-slate-500">Loading...</TableCell>
                        </TableRow>
                      ) : arSummaryData.length > 0 ? (
                        <>
                            {arSummaryData.map(({ customer, balance_0_30, balance_31_60, balance_60_plus, total_balance }, index) => (
                            <ContextMenu key={customer.id} onOpenChange={() => handleContextMenuOpen(customer)}>
                              <ContextMenuTrigger asChild>
                                <TableRow 
                                  className={`cursor-pointer hover:bg-blue-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`} 
                                  onClick={() => handleRowClick(customer)}
                                >
                                  <TableCell className="font-medium">{formatCustomerName(customer)}</TableCell>
                                  <TableCell className="text-right">${balance_0_30.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-yellow-600">${balance_31_60.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-red-600">${balance_60_plus.toFixed(2)}</TableCell>
                                  <TableCell className="text-right font-bold">${total_balance.toFixed(2)}</TableCell>
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
                          <TableRow className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                            <TableCell className="font-bold text-slate-900">TOTALS</TableCell>
                            <TableCell className="text-right text-slate-900">${totals.balance_0_30.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-yellow-700">${totals.balance_31_60.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-red-700">${totals.balance_60_plus.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold text-slate-900 text-lg">${totals.total_balance.toFixed(2)}</TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center h-24 text-slate-500">No customers with outstanding balances found.</TableCell>
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
            invoices={customerInvoices}
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