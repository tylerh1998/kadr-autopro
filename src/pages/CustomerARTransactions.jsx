import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Customer, WorkOrder, CustomerPayments, CustomerARAdjustment, GLTransaction, FiscalPeriod } from '@/entities/all';
import { checkFiscalPeriodStatus } from '@/components/utils/fiscalPeriodUtils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  DollarSign,
  FileText,
  Plus,
  RefreshCw,
  Eye,
  Printer,
  Calendar as CalendarIcon,
  Trash2, // Added Trash2 icon
} from 'lucide-react';
import { format, parseISO, differenceInDays, subDays } from 'date-fns';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import TakePaymentModal from '@/components/ar/TakePaymentModal';
import RecordAdjustmentModal from '@/components/ar/RecordAdjustmentModal';
import StatementModal from '@/components/ar/StatementModal';
import ARPaymentDetailsModal from '@/components/ar/ARPaymentDetailsModal';
import InvoiceViewerModal from '@/components/ar/InvoiceViewerModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { // Added AlertDialog components
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CustomerARTransactionsPage() {
  const [customer, setCustomer] = useState(null);
  const [transactionsTabData, setTransactionsTabData] = useState([]);
  const [paymentsTabData, setPaymentsTabData] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState(null);
  const [daysBack, setDaysBack] = useState(120);
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 120), to: new Date() });
  const [pendingDaysBack, setPendingDaysBack] = useState(120);
  const [pendingDateRange, setPendingDateRange] = useState({ from: subDays(new Date(), 120), to: new Date() });
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [showDeleteAdjustmentConfirm, setShowDeleteAdjustmentConfirm] = useState(false);
  const [adjustmentToDelete, setAdjustmentToDelete] = useState(null);
  const [showInvoiceViewer, setShowInvoiceViewer] = useState(false);
  const [viewInvoiceUrl, setViewInvoiceUrl] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  
  const customerId = new URLSearchParams(location.search).get('customerId');
  const cameFrom = new URLSearchParams(location.search).get('from');

  const createPageUrl = (pageName) => {
    switch (pageName) {
      case 'Customers':
        return '/Customers';
      case 'CustomerARSummary':
        return '/CustomerARSummary';
      default:
        return '/'; // Fallback
    }
  };

  const handleBackClick = () => {
    if (cameFrom === 'customers') {
      navigate(createPageUrl('Customers'));
    } else {
      navigate(createPageUrl('CustomerARSummary'));
    }
  };

  const loadData = useCallback(async () => {
    if (!customerId) return;
    
    setLoading(true);
    try {
      const customerData = await Customer.get(customerId);
      setCustomer(customerData);

      // Call backend function to get transactions
      const response = await base44.functions.invoke('getCustomerARTransactions', {
        customerId,
        dateFrom: dateRange.from ? dateRange.from.toISOString() : null,
        dateTo: dateRange.to ? dateRange.to.toISOString() : null,
        searchTerm: searchTerm
      });

      if (response.data.success) {
        setTransactionsTabData(response.data.transactionsTab);
        setPaymentsTabData(response.data.paymentsTab);
        setCurrentBalance(response.data.allTimeBalance);
        setOpeningBalance(response.data.openingBalance || 0);
      } else {
        console.error('Failed to load transactions:', response.data.error);
      }
      
    } catch (error) {
      console.error('Error loading customer AR transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [customerId, dateRange, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDaysBackChange = (days) => {
    const numDays = parseInt(days, 10);
    if (!isNaN(numDays) && numDays >= 0) {
        setPendingDaysBack(numDays);
        setPendingDateRange({ from: subDays(new Date(), numDays), to: new Date() });
    } else if (days === '') {
        setPendingDaysBack('');
    }
  };

  const handleDateRangeChange = (range) => {
    if (range?.from) {
      setPendingDateRange(range);
      if (range.from && range.to) {
        setPendingDaysBack('');
      }
    } else {
      setPendingDateRange({ from: undefined, to: undefined });
      setPendingDaysBack(120);
    }
  };

  const handleApplyDateFilter = () => {
    setDaysBack(pendingDaysBack);
    setDateRange(pendingDateRange);
    // loadData will be triggered by useEffect watching dateRange
  };

  const handleViewInvoice = async (transaction) => {
    try {
      // Check for legacy invoice URL first
      if (transaction.lankar_invoice) {
        setViewInvoiceUrl(transaction.lankar_invoice);
        setShowInvoiceViewer(true);
        return;
      }

      let workOrder = null;

      // Try to get work order by ID first (most reliable)
      if (transaction.workOrderId) {
        try {
          workOrder = await WorkOrder.get(transaction.workOrderId);
        } catch (e) {
          console.log('Work order not found by ID, trying reference');
        }
      } 
      
      // Fall back to searching by reference
      if (!workOrder && transaction.reference) {
        if (transaction.reference.startsWith('INV')) {
          const workOrders = await WorkOrder.filter({ inv_number: transaction.reference });
          if (workOrders && workOrders.length > 0) {
            workOrder = workOrders[0];
          }
        } else {
          const workOrders = await WorkOrder.filter({ ro_number: transaction.reference });
          if (workOrders && workOrders.length > 0) {
            workOrder = workOrders[0];
          }
        }
      }

      if (workOrder && workOrder.ro_number) {
        const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
        window.open(url, '_blank', 'width=1600,height=1000');
      } else {
        alert("Could not find the associated work order.");
      }
    } catch (error) {
      console.error('Error finding work order:', error);
      alert("An error occurred while trying to find the work order.");
    }
  };

  const handleTakePayment = async () => {
    await loadData();
  };

  const handlePaymentComplete = (paymentRecord) => {
    setShowPaymentModal(false);
    setSelectedPaymentForDetails(paymentRecord);
    setShowPaymentDetailsModal(true);
  };

  const handleRecordAdjustment = async (adjustmentData) => {
    try {
      // Create the CustomerARAdjustment record
      const adjustment = await CustomerARAdjustment.create(adjustmentData);
      
      const amount = Math.abs(adjustmentData.amount);
      const isCharge = adjustmentData.amount > 0;
      const glDescription = `AR Adjustment: ${adjustmentData.description}`;
      const reference = adjustmentData.reference || `ADJ-${adjustment.id}`;
      
      // Create GL transactions
      if (isCharge) {
        // Charge (+): Debit 1100 (AR), Credit selected GL account
        await GLTransaction.create({
          transaction_date: adjustmentData.adjustment_date,
          account_number: '1100',
          description: glDescription,
          debit_amount: amount,
          credit_amount: 0,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        });
        await GLTransaction.create({
          transaction_date: adjustmentData.adjustment_date,
          account_number: adjustmentData.gl_account,
          description: glDescription,
          debit_amount: 0,
          credit_amount: amount,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        });
      } else {
        // Credit (-): Debit selected GL account, Credit 1100 (AR)
        await GLTransaction.create({
          transaction_date: adjustmentData.adjustment_date,
          account_number: adjustmentData.gl_account,
          description: glDescription,
          debit_amount: amount,
          credit_amount: 0,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        });
        await GLTransaction.create({
          transaction_date: adjustmentData.adjustment_date,
          account_number: '1100',
          description: glDescription,
          debit_amount: 0,
          credit_amount: amount,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        });
      }
      
      await loadData();
      setShowAdjustmentModal(false);
    } catch (error) {
      console.error('Error recording adjustment:', error);
      alert('Failed to record adjustment. Please try again.');
    }
  };

  const handlePaymentClick = async (transaction) => {
    try {
      // Only proceed if this is a payment source, not an adjustment
      if (transaction.source !== 'payment') {
        console.log('Not a payment record, skipping details fetch');
        return;
      }
      
      // Fetch the actual CustomerPayments record to get ar_applyto
      // The transaction object constructed in useMemo might not have all details,
      // especially ar_applyto array, which is crucial for the details modal.
      const paymentRecord = await CustomerPayments.get(transaction.sourceId);
      setSelectedPaymentForDetails(paymentRecord);
      setShowPaymentDetailsModal(true);
    } catch (error) {
      console.error('Error fetching payment details:', error);
      alert('Could not load payment details. The record may have been deleted.');
    }
  };

  const handleDeletePayment = async (transaction) => {
    try {
      // Only proceed if this is a payment source, not an adjustment
      if (transaction.source !== 'payment') {
        alert('This is not a payment record and cannot be deleted from here.');
        return;
      }
      
      // Fetch the full payment record
      const paymentRecord = await CustomerPayments.get(transaction.sourceId);
      
      // Validate that payment hasn't been deposited
      if (paymentRecord.deposited === true) {
        alert('Cannot delete a payment that has already been deposited.');
        return;
      }
      
      setPaymentToDelete(paymentRecord);
      setShowDeleteConfirm(true);
    } catch (error) {
      console.error('Error fetching payment for deletion:', error);
      alert('Could not load payment details for deletion. The record may have been deleted.');
    }
  };

  const confirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    
    try {
      const arApplyTo = paymentToDelete.ar_applyto || '';
      
      if (!arApplyTo) {
        // If there's no ar_applyto, it implies the payment was potentially an unapplied credit (though ar_pmt true usually means it was applied)
        // or a payment that didn't apply to anything explicitly (e.g., initial credit). Just delete it.
        await CustomerPayments.delete(paymentToDelete.id);
      } else {
        // Parse ar_applyto string: "id1:amount1,id2:amount2,..."
        const entries = arApplyTo.split(',').filter(e => e.trim());
        
        for (const entry of entries) {
          const [recordId, amountStr] = entry.split(':');
          const amountApplied = parseFloat(amountStr);
          
          if (!recordId || isNaN(amountApplied)) continue;
          
          let updated = false;
          // Try to update CustomerPayments (e.g., if it was an invoice created as a payment type 'on_account')
          try {
            const payment = await CustomerPayments.get(recordId);
            if (payment) {
              const newArPaid = Math.max(0, (payment.ar_paid || 0) - amountApplied);
              await CustomerPayments.update(recordId, {
                ar_paid: newArPaid
              });
              console.log(`Reversed $${amountApplied.toFixed(2)} from CustomerPayments record ${recordId}, new ar_paid: ${newArPaid}`);
              updated = true;
            }
          } catch (e) {
            // console.warn(`Record ${recordId} not found in CustomerPayments, trying CustomerARAdjustment. Error:`, e);
            // This is expected if the record is an adjustment, not an invoice-as-payment
          }
          
          // If not updated, try to update CustomerARAdjustment record
          if (!updated) {
            try {
              const adjustment = await CustomerARAdjustment.get(recordId);
              if (adjustment) {
                const newArPaid = Math.max(0, (adjustment.ar_paid || 0) - amountApplied);
                await CustomerARAdjustment.update(recordId, {
                  ar_paid: newArPaid
                });
                console.log(`Reversed $${amountApplied.toFixed(2)} from CustomerARAdjustment record ${recordId}, new ar_paid: ${newArPaid}`);
                updated = true;
              }
            } catch (e) {
              // console.warn(`Record ${recordId} not found in CustomerARAdjustment. Error:`, e);
            }
          }

          if (!updated) {
            console.warn(`Could not find a record (CustomerPayments or CustomerARAdjustment) to reverse payment for ID: ${recordId}. It might be a work order invoice not tracked via ar_paid on these entities.`);
          }
        }
        
        // After reversing all applications, delete the payment record itself
        await CustomerPayments.delete(paymentToDelete.id);
      }
      
      console.log('Payment deleted successfully:', paymentToDelete.id);
      
      // Close dialog and refresh data
      setShowDeleteConfirm(false);
      setPaymentToDelete(null);
      await loadData();
      
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(`Failed to delete payment: ${error.message}`);
    }
  };

  const handleDeleteAdjustment = async (transaction) => {
    if (transaction.source !== 'adjustment') {
      alert('This is not an adjustment and cannot be deleted from here.');
      return;
    }

    try {
      const adjustment = await CustomerARAdjustment.get(transaction.sourceId);
      setAdjustmentToDelete(adjustment);
      setShowDeleteAdjustmentConfirm(true);
    } catch (error) {
      console.error('Error fetching adjustment for deletion:', error);
      alert('Could not load adjustment details for deletion.');
    }
  };

  const confirmDeleteAdjustment = async () => {
    if (!adjustmentToDelete) return;

    try {
      // Check fiscal period status
      const periodStatus = await checkFiscalPeriodStatus(adjustmentToDelete.adjustment_date);
      
      if (!periodStatus.isValid) {
        alert('Cannot delete this adjustment as it was created in a closed fiscal period. You can record a new adjustment to reverse it if needed.');
        return;
      }

      // Create reversing GL transactions
      const amount = Math.abs(adjustmentToDelete.amount);
      const isCharge = adjustmentToDelete.amount > 0;
      const glDescription = `Reversal: ${adjustmentToDelete.description}`;
      const reference = `REV-${adjustmentToDelete.reference || adjustmentToDelete.id}`;

      if (isCharge) {
        // Original was: Debit 1100, Credit gl_account
        // Reversal: Debit gl_account, Credit 1100
        await GLTransaction.create({
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          account_number: adjustmentToDelete.gl_account,
          description: glDescription,
          debit_amount: amount,
          credit_amount: 0,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustmentToDelete.id
        });
        await GLTransaction.create({
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          account_number: '1100',
          description: glDescription,
          debit_amount: 0,
          credit_amount: amount,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustmentToDelete.id
        });
      } else {
        // Original was: Debit gl_account, Credit 1100
        // Reversal: Debit 1100, Credit gl_account
        await GLTransaction.create({
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          account_number: '1100',
          description: glDescription,
          debit_amount: amount,
          credit_amount: 0,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustmentToDelete.id
        });
        await GLTransaction.create({
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          account_number: adjustmentToDelete.gl_account,
          description: glDescription,
          debit_amount: 0,
          credit_amount: amount,
          reference: reference,
          source_type: 'adjustment',
          source_id: adjustmentToDelete.id
        });
      }

      // Delete the adjustment
      await CustomerARAdjustment.delete(adjustmentToDelete.id);

      console.log('Adjustment deleted with reversing GL transactions:', adjustmentToDelete.id);

      setShowDeleteAdjustmentConfirm(false);
      setAdjustmentToDelete(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting adjustment:', error);
      alert(`Failed to delete adjustment: ${error.message}`);
    }
  };

  // All transaction processing now handled by backend

  const formatPaymentMethod = (method) => {
    if (!method) return '';
    return method.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Helper function to format customer name
  const formatCustomerName = (customer) => {
    if (!customer) return '';
    if (customer.org_name) {
      const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
    }
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-slate-600">Customer not found.</p>
            <Button 
              variant="outline" 
              onClick={() => navigate('/CustomerARSummary')} // Fallback if customer not found
              className="mt-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to A/R Summary
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TransactionTable = ({ data, showPaymentDetails = false }) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left p-3 font-semibold text-slate-700">Date</th>
            {!showPaymentDetails && <th className="text-left p-3 font-semibold text-slate-700">Reference</th>}
            <th className="text-left p-3 font-semibold text-slate-700">Description</th>
            {showPaymentDetails && <th className="text-left p-3 font-semibold text-slate-700">Payment Method</th>}
            {!showPaymentDetails && <th className="text-right p-3 font-semibold text-slate-700">Charges</th>}
            <th className="text-right p-3 font-semibold text-slate-700">Payments</th>
            {!showPaymentDetails && <th className="text-right p-3 font-semibold text-slate-700">Owing</th>}
            {showPaymentDetails && <th className="text-center p-3 font-semibold text-slate-700">Actions</th>} {/* New column header */}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={showPaymentDetails ? 5 : 6} className="text-center py-12"> {/* Adjusted colSpan */}
                <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Transactions</h3>
                <p className="text-slate-600">No transactions found for the selected date range.</p>
              </td>
            </tr>
          ) : (
            data.map((transaction, index) => (
              <ContextMenu key={`${transaction.sourceId}-${index}`}>
                <ContextMenuTrigger asChild>
                  <tr 
                    className={`border-b border-slate-100 ${showPaymentDetails && transaction.source === 'payment' ? 'cursor-pointer hover:bg-slate-50' : ''} ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                    onClick={(e) => {
                      if (showPaymentDetails && transaction.source === 'payment') {
                        e.stopPropagation();
                        handlePaymentClick(transaction);
                      }
                    }}
                  >
                    <td className="p-3">
                      {format(parseISO(transaction.date), 'MMM d, yyyy')}
                    </td>
                    {!showPaymentDetails && (
                      <td className="p-3 text-slate-600">
                        {transaction.reference}
                      </td>
                    )}
                    <td className="p-3 text-slate-900">
                      {transaction.description}
                    </td>
                    {showPaymentDetails && (
                      <td className="p-3 text-slate-600">
                        {formatPaymentMethod(transaction.payment_method)}
                      </td>
                    )}
                    {!showPaymentDetails && (
                      <td className="p-3 text-right">
                        {(transaction.amount || 0) > 0 && (
                          <span className="font-semibold text-red-600">
                            ${(transaction.amount || 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                    )}
                    <td 
                      className={`p-3 text-right ${!showPaymentDetails && (transaction.payment || 0) > 0 && transaction.source === 'payment' ? 'cursor-pointer hover:underline' : ''}`}
                      onClick={(e) => {
                        if (!showPaymentDetails && (transaction.payment || 0) > 0 && transaction.source === 'payment') {
                          e.stopPropagation();
                          handlePaymentClick(transaction);
                        }
                      }}
                    >
                      {(transaction.payment || 0) > 0 && (
                        <span className="font-semibold text-green-600">
                          ${(transaction.payment || 0).toFixed(2)}
                        </span>
                      )}
                    </td>
                    {!showPaymentDetails && (
                      <td className="p-3 text-right">
                        <span className={`font-semibold ${
                          (transaction.balance || 0) > 0 ? 'text-red-600' : 
                          (transaction.balance || 0) < 0 ? 'text-green-600' : 
                          'text-slate-900'
                        }`}>
                          ${Math.abs(transaction.balance || 0).toFixed(2)}
                          {(transaction.balance || 0) < 0 && ' CR'}
                        </span>
                      </td>
                    )}
                    {showPaymentDetails && (
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePayment(transaction);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {transaction.reference && transaction.source !== 'adjustment' && (
                    <ContextMenuItem onClick={() => handleViewInvoice(transaction)}>
                      <Eye className="w-4 h-4 mr-2" />
                      View {transaction.reference}
                    </ContextMenuItem>
                  )}
                  {transaction.source === 'adjustment' && (
                    <ContextMenuItem onClick={() => handleDeleteAdjustment(transaction)} className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Adjustment
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={handleBackClick}
              className="shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                A/R Transactions for {customer ? formatCustomerName(customer) : '...'}
              </h1>
              <div className="flex items-center gap-4 mt-2">
                <p className="text-slate-600">{customer.phone}</p>
                {customer.email && <p className="text-slate-600">{customer.email}</p>}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <Card className="mr-2">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600">Current Balance</p>
                <p className={`text-2xl font-bold ${currentBalance > 0 ? 'text-red-600' : currentBalance < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                  ${Math.abs(currentBalance).toFixed(2)}
                  {currentBalance < 0 && ' CR'}
                </p>
              </CardContent>
            </Card>
            <Button variant="outline" onClick={() => setShowStatementModal(true)}>
              <Printer className="w-4 h-4 mr-2" />
              Statement
            </Button>
            <Button onClick={() => setShowPaymentModal(true)}>
              <DollarSign className="w-4 h-4 mr-2" />
              Take Payment
            </Button>
            <Button variant="outline" onClick={() => setShowAdjustmentModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Record Adjustment
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-2">
              <Label htmlFor="days-back">Days Back</Label>
              <Input
                id="days-back"
                type="number"
                value={pendingDaysBack}
                onChange={(e) => handleDaysBackChange(e.target.value)}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className="w-[280px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {pendingDateRange.from ? (
                      pendingDateRange.to ? (
                        <>
                          {format(pendingDateRange.from, "LLL dd, y")} -{" "}
                          {format(pendingDateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(pendingDateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={pendingDateRange.from || new Date()}
                    selected={pendingDateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleApplyDateFilter}>Apply</Button>
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                type="text"
                placeholder="Search by reference, description, or amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>
              
              <TabsContent value="transactions" className="mt-4">
                <TransactionTable data={transactionsTabData} showPaymentDetails={false} />
              </TabsContent>
              
              <TabsContent value="payments" className="mt-4">
                <TransactionTable data={paymentsTabData} showPaymentDetails={true} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {customer && (
        <TakePaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          customer={customer}
          invoices={[]}
          onTakePayment={handleTakePayment}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      {customer && (
        <RecordAdjustmentModal
          open={showAdjustmentModal}
          onClose={() => setShowAdjustmentModal(false)}
          customer={customer}
          onRecordAdjustment={handleRecordAdjustment}
        />
      )}

      {showStatementModal && customer && (
        <StatementModal
            open={showStatementModal}
            onClose={() => setShowStatementModal(false)}
            customer={customer}
        />
      )}

      <ARPaymentDetailsModal
        open={showPaymentDetailsModal}
        onClose={() => {
          setShowPaymentDetailsModal(false);
          setSelectedPaymentForDetails(null);
        }}
        paymentRecord={selectedPaymentForDetails}
      />

      <InvoiceViewerModal
        open={showInvoiceViewer}
        onClose={() => {
          setShowInvoiceViewer(false);
          setViewInvoiceUrl(null);
        }}
        invoiceUrl={viewInvoiceUrl}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the payment and update all affected invoices/adjustments. This action cannot be undone.
              {paymentToDelete && (
                <div className="mt-4 p-3 bg-slate-100 rounded">
                  <p className="font-semibold">Payment Amount: ${(paymentToDelete.amount || 0).toFixed(2)}</p>
                  <p>Payment Date: {format(parseISO(paymentToDelete.payment_date), 'MMM d, yyyy')}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPaymentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeletePayment}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAdjustmentConfirm} onOpenChange={setShowDeleteAdjustmentConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the adjustment and reverse all associated GL transactions. This action cannot be undone.
              {adjustmentToDelete && (
                <div className="mt-4 p-3 bg-slate-100 rounded">
                  <p className="font-semibold">Amount: ${Math.abs(adjustmentToDelete.amount || 0).toFixed(2)}</p>
                  <p>Date: {format(parseISO(adjustmentToDelete.adjustment_date), 'MMM d, yyyy')}</p>
                  <p>Description: {adjustmentToDelete.description}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAdjustmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteAdjustment}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Adjustment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      );
      }