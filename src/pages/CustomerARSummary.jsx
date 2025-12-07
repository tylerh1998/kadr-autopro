import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Customer, WorkOrder, CustomerPayments, CustomerARAdjustment } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Printer, DollarSign } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import TakePaymentModal from '@/components/ar/TakePaymentModal';
import StatementModal from '@/components/ar/StatementModal';
import InterestCalculationModal from '@/components/ar/InterestCalculationModal'; // Added import for InterestCalculationModal

export default function CustomerARSummaryPage() {
  const [customers, setCustomers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]); // Keep for context menu on Statement
  const [customerPayments, setCustomerPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false); // New state for interest modal

  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [customersData, workOrdersData, paymentsData, adjustmentsData] = await Promise.all([
        Customer.list(),
        WorkOrder.filter({ stage: 'invoice' }),
        CustomerPayments.list(),
        CustomerARAdjustment.list(),
      ]);
      
      setCustomers(customersData);
      setWorkOrders(workOrdersData);
      setCustomerPayments(paymentsData);
      setAdjustments(adjustmentsData);

    } catch (error) {
      console.error('Error loading A/R data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const arSummaryData = useMemo(() => {
    if (loading) return [];

    const today = new Date();
    
    return customers.map(customer => {
      // Get all payments and adjustments for this customer
      const allCustomerPayments = customerPayments.filter(p => p.customer_id === customer.id);
      const customerAdj = adjustments.filter(adj => adj.customer_id === customer.id);

      // Separate payments into charges ('on_account') and actual payments
      // The logic from CustomerARTransactions shows that only 'on_account' and 'ar_pmt' are relevant for AR.
      const onAccountCharges = allCustomerPayments.filter(p => p.payment_method === 'on_account');
      const actualPayments = allCustomerPayments.filter(p => p.ar_pmt && p.payment_method !== 'on_account');
      
      // Calculate total charges: sum of 'On Account' payments + positive adjustments
      const totalOnAccountCharges = onAccountCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
      const totalChargeAdjustments = customerAdj.reduce((sum, adj) => sum + (adj.amount > 0 ? adj.amount : 0), 0);
      const totalCharges = totalOnAccountCharges + totalChargeAdjustments;
      
      // Calculate total credits: sum of actual AR payments + negative adjustments
      const totalActualPayments = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalCreditAdjustments = customerAdj.reduce((sum, adj) => sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0), 0);
      const totalCredits = totalActualPayments + totalCreditAdjustments;
      
      // Net balance
      const total_balance = totalCharges - totalCredits;
      
      if (total_balance <= 0.01) {
        return {
          customer: { ...customer },
          balance_0_30: 0,
          balance_31_60: 0,
          balance_60_plus: 0,
          total_balance: 0,
        };
      }

      // Now calculate aging - distribute the remaining balance across age buckets
      // The charge items should be 'on_account' payments and positive adjustments
      let balance_0_30 = 0;
      let balance_31_60 = 0;
      let balance_60_plus = 0;

      // Create a list of all charge items with their dates
      const chargeItems = [];
            
      // Add on_account charges
      onAccountCharges.forEach(charge => {
        if (charge.payment_date) {
          const chargeDate = new Date(charge.payment_date);
          const daysOld = differenceInDays(today, chargeDate);
          chargeItems.push({
            date: chargeDate,
            daysOld,
            amount: charge.amount || 0
          });
        }
      });
      
      // Add positive adjustments
      customerAdj.forEach(adj => {
        if (adj.amount > 0) {
            const adjDate = new Date(adj.adjustment_date);
            const daysOld = differenceInDays(today, adjDate);
            chargeItems.push({
                date: adjDate,
                daysOld,
                amount: adj.amount || 0
            });
        }
      });
      
      // Sort by date (oldest first) to apply payments correctly for aging
      chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      // This part is tricky. A simple aging calculation based on charge item dates is needed.
      // We will distribute the total balance based on the age of the remaining charges.
      let tempCreditsToApply = totalCredits;

      // Apply credits to oldest charges first
      for (const charge of chargeItems) {
        if (tempCreditsToApply > 0) {
            const paidAmount = Math.min(tempCreditsToApply, charge.amount);
            charge.amount -= paidAmount; // Reduce the charge's outstanding amount
            tempCreditsToApply -= paidAmount;
        }
      }
      
      // Distribute remaining charge amounts across age buckets
      chargeItems.forEach(item => {
        if (item.amount <= 0) return; // Only consider remaining positive amounts
        
        if (item.daysOld <= 30) {
          balance_0_30 += item.amount;
        } else if (item.daysOld <= 60) {
          balance_31_60 += item.amount;
        } else {
          balance_60_plus += item.amount;
        }
      });

      return {
        customer: { ...customer },
        balance_0_30: balance_0_30,
        balance_31_60: balance_31_60,
        balance_60_plus: balance_60_plus,
        total_balance: total_balance,
      };
    }).filter(c => c.total_balance > 0.01);

  }, [customers, customerPayments, adjustments, loading]);

  const filteredData = useMemo(() => {
    return arSummaryData.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const firstName = item.customer?.first_name?.toLowerCase() || '';
      const lastName = item.customer?.last_name?.toLowerCase() || '';
      return firstName.includes(searchLower) || lastName.includes(searchLower);
    });
  }, [arSummaryData, searchTerm]);

  // NEW: Calculate totals for the summary
  const totals = useMemo(() => {
    return filteredData.reduce((acc, item) => {
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
  }, [filteredData]);

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

  // NEW: Fetch and process transaction data for the selected customer (same logic as CustomerARTransactions)
  const getTransactionDataForStatement = useMemo(() => {
    if (!selectedCustomer) return [];

    const allCustomerPayments = customerPayments.filter(p => p.customer_id === selectedCustomer.id);
    const customerAdj = adjustments.filter(adj => adj.customer_id === selectedCustomer.id);

    // Filter payments to only include On Account or those from AR module
    const payments = allCustomerPayments.filter(p => p.payment_method === 'on_account' || p.ar_pmt);

    const allTransactions = [];
    
    payments.forEach(payment => {
      if (payment.payment_method === 'on_account') {
        allTransactions.push({
          id: `payment-${payment.id}`,
          date: payment.payment_date,
          type: 'On Account Charge',
          description: 'Invoice Charged',
          reference: payment.invoice_number || payment.reference || '',
          charge: payment.amount || 0,
          payment: 0,
          source: 'payment',
          sourceId: payment.id
        });
      } else {
        allTransactions.push({
          id: `payment-${payment.id}`,
          date: payment.payment_date,
          type: 'Payment',
          description: payment.notes || `${payment.payment_method.replace('_', ' ')} Payment`,
          reference: payment.reference || '',
          charge: 0,
          payment: payment.amount || 0,
          source: 'payment',
          sourceId: payment.id
        });
      }
    });
    
    customerAdj.forEach(adjustment => {
      allTransactions.push({
        id: `adjustment-${adjustment.id}`,
        date: adjustment.adjustment_date,
        type: adjustment.amount > 0 ? 'Charge Adjustment' : 'Credit Adjustment',
        description: adjustment.description,
        reference: adjustment.reference || '',
        charge: adjustment.amount > 0 ? adjustment.amount : 0,
        payment: adjustment.amount < 0 ? Math.abs(adjustment.amount) : 0,
        source: 'adjustment',
        sourceId: adjustment.id
      });
    });
    
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate running balances
    let runningBalance = 0;
    const transactionsWithBalance = [...allTransactions].reverse().map(transaction => {
      runningBalance += (transaction.charge - transaction.payment);
      return {
        ...transaction,
        balance: runningBalance
      };
    }).reverse();

    return transactionsWithBalance;
  }, [selectedCustomer, customerPayments, adjustments]);

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
      <style jsx global>{`
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
                  <CardTitle>Customer Balances</CardTitle>
                  <div className="relative no-print">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      placeholder="Search Customers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
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
                      ) : filteredData.length > 0 ? (
                        <>
                          {filteredData.map(({ customer, balance_0_30, balance_31_60, balance_60_plus, total_balance }) => (
                            <ContextMenu key={customer.id} onOpenChange={() => handleContextMenuOpen(customer)}>
                              <ContextMenuTrigger asChild>
                                <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => handleRowClick(customer)}>
                                  <TableCell className="font-medium">{customer.first_name} {customer.last_name}</TableCell>
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
            transactions={getTransactionDataForStatement}
          />
        )}

        {/* New Interest Calculation Modal */}
        <InterestCalculationModal
          open={showInterestModal}
          onClose={() => setShowInterestModal(false)}
          customers={customers}
          onInterestCalculated={handleInterestCalculated}
        />
      </div>
    </>
  );
}