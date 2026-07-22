import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Customer } from '@/entities/all';
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
  Trash2,
  Send,
} from 'lucide-react';
import { format, parseISO, differenceInDays, subDays } from 'date-fns';
import moment from 'moment-timezone';
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
import BatchSendWorkOrdersModal from '@/components/ar/BatchSendWorkOrdersModal';
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

const formatMountainDate = (value) => {
  if (!value) return '—';

  const isDateOnlyString = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsedDate = isDateOnlyString
    ? moment.tz(value, 'YYYY-MM-DD', true, 'America/Edmonton')
    : moment.tz(value, 'America/Edmonton');

  return parsedDate.isValid() ? parsedDate.format('MMM D, YYYY') : '—';
};

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
  const [selectedWorkOrderIds, setSelectedWorkOrderIds] = useState([]);
  const [showBatchSendModal, setShowBatchSendModal] = useState(false);
  const [batchSendResults, setBatchSendResults] = useState([]);
  const [activeTab, setActiveTab] = useState('transactions');

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
      const customerRes = await base44.functions.invoke('supabaseCustomer', { action: 'get', id: customerId });
      if (customerRes.data && customerRes.data.data) {
        setCustomer(customerRes.data.data);
      } else {
        // Fallback if supabase proxy fails or returns empty
        const customerData = await Customer.get(customerId);
        setCustomer(customerData);
      }

      const response = await base44.functions.invoke('getCustomerARData', {
        customerId,
        dateFrom: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : null,
        dateTo: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : null,
        searchTerm
      });

      if (response.data.success) {
        setTransactionsTabData(response.data.transactionsTab || []);
        setPaymentsTabData(response.data.paymentsTab || []);
        setCurrentBalance(response.data.summary?.total_balance ?? response.data.allTimeBalance ?? 0);
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
      if (transaction.lankar_invoice) {
        setViewInvoiceUrl(transaction.lankar_invoice);
        setShowInvoiceViewer(true);
        return;
      }

      if (transaction.workOrderLookupNumber) {
        const url = `/WorkOrderEdit?id=${transaction.workOrderLookupNumber}`;
        window.open(url, '_blank', 'width=1600,height=1000');
        return;
      }

      alert("Could not find the associated work order.");
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
      await base44.functions.invoke('processCustomerARAccounting', {
        action: 'create_adjustment',
        adjustmentData
      });

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
      const res = await base44.functions.invoke('supabaseCustomerPayments', { action: 'get', id: transaction.sourceId });
      const paymentRecord = res.data.data;
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
      const res = await base44.functions.invoke('supabaseCustomerPayments', { action: 'get', id: transaction.sourceId });
      const paymentRecord = res.data.data;
      
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
      await base44.functions.invoke('processCustomerARAccounting', {
        action: 'reverse_payment',
        payment_id: paymentToDelete.id
      });

      setShowDeleteConfirm(false);
      setPaymentToDelete(null);
      await loadData();
      
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(`Failed to delete payment: ${error?.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteAdjustment = async (transaction) => {
    if (transaction.source !== 'adjustment') {
      alert('This is not an adjustment and cannot be deleted from here.');
      return;
    }

    try {
      const res = await base44.functions.invoke('supabaseCustomerARAdjustment', { action: 'get', id: transaction.sourceId });
      const adjustment = res.data.data;
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
      const periodStatus = await checkFiscalPeriodStatus(adjustmentToDelete.adjustment_date);
      if (!periodStatus.isValid && periodStatus.message && periodStatus.message.includes('closed')) {
        alert('Cannot delete this adjustment as it was created in a closed fiscal period. You can record a new adjustment to reverse it if needed.');
        return;
      }

      await base44.functions.invoke('processCustomerARAccounting', {
        action: 'reverse_adjustment',
        adjustment_id: adjustmentToDelete.id
      });

      setShowDeleteAdjustmentConfirm(false);
      setAdjustmentToDelete(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting adjustment:', error);
      alert(`Failed to delete adjustment: ${error?.response?.data?.error || error.message}`);
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
    return customer.org_name || [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  };

  const eligibleTransactions = useMemo(
    () => transactionsTabData.filter((transaction) => transaction.source === 'charge' && transaction.work_order_id),
    [transactionsTabData]
  );

  const selectedWorkOrders = useMemo(() => {
    const workOrderMap = new Map();
    eligibleTransactions.forEach((transaction) => {
      if (!workOrderMap.has(transaction.work_order_id)) {
        workOrderMap.set(transaction.work_order_id, transaction.work_order);
      }
    });
    return selectedWorkOrderIds.map((id) => workOrderMap.get(id)).filter(Boolean);
  }, [eligibleTransactions, selectedWorkOrderIds]);

  const handleToggleWorkOrderSelection = (transaction) => {
    const workOrderId = transaction.work_order_id;
    if (!workOrderId) return;
    setSelectedWorkOrderIds((prev) =>
      prev.includes(workOrderId)
        ? prev.filter((id) => id !== workOrderId)
        : [...prev, workOrderId]
    );
  };

  const handleBatchSendComplete = (results) => {
    setBatchSendResults(results);
    setSelectedWorkOrderIds([]);
  };

  const handlePrint = () => {
    window.print();
  };

  const appliedDateRangeLabel = useMemo(() => {
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    if (dateRange.from) {
      return format(dateRange.from, 'MMM d, yyyy');
    }
    return 'All Dates';
  }, [dateRange]);

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

  const TransactionTable = ({ data, showPaymentDetails = false }) => {
    const totalCharges = data.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
    const totalPayments = data.reduce((sum, transaction) => sum + (Number(transaction.payment) || 0), 0);
    const visibleBalanceTotal = data.reduce((sum, transaction) => sum + (Number(transaction.balance) || 0), 0);
    const closingOwing = showPaymentDetails
      ? totalPayments
      : Number(openingBalance || 0) + visibleBalanceTotal;
    const showTotalsRow = showPaymentDetails
      ? data.length > 0
      : data.length > 0 || Math.abs(openingBalance) > 0.005;

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">{!showPaymentDetails && <th className="w-12 p-3 no-print"></th>}<th className="text-left p-3 font-semibold text-slate-700">Date</th>
              {!showPaymentDetails && <th className="text-left p-3 font-semibold text-slate-700">Reference</th>}
              <th className="text-left p-3 font-semibold text-slate-700">Description</th>
              {showPaymentDetails && <th className="text-left p-3 font-semibold text-slate-700">Payment Method</th>}
              {!showPaymentDetails && <th className="text-right p-3 font-semibold text-slate-700">Charges</th>}
              <th className="text-right p-3 font-semibold text-slate-700">Payments</th>
              {!showPaymentDetails && <th className="text-right p-3 font-semibold text-slate-700">Owing</th>}
              {showPaymentDetails && <th className="text-center p-3 font-semibold text-slate-700 no-print">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {!showPaymentDetails && Math.abs(openingBalance) > 0.005 && (
              <tr className="bg-slate-50/80 border-b border-slate-200 font-medium italic">
                <td className="p-3 no-print"></td>
                <td className="p-3 text-slate-500">
                  {dateRange.from ? format(dateRange.from, 'MMM d, yyyy') : 'Prior'}
                </td>
                <td className="p-3 text-slate-500"></td>
                <td className="p-3 text-slate-900">Previous Balance</td>
                <td className="p-3 text-right"></td>
                <td className="p-3 text-right"></td>
                <td className="p-3 text-right">
                  <span className={`${openingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${Math.abs(openingBalance).toFixed(2)}
                    {openingBalance < 0 && ' CR'}
                  </span>
                </td>
              </tr>
            )}
            {data.length === 0 && (!showPaymentDetails && Math.abs(openingBalance) < 0.005) ? (
              <tr>
                <td colSpan={showPaymentDetails ? 5 : 6} className="text-center py-12">
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
                      {!showPaymentDetails && (
                        <td className="p-3 no-print" onClick={(e) => e.stopPropagation()}>
                        {transaction.source === 'charge' && transaction.work_order_id && (
                          <input
                            type="checkbox"
                            checked={selectedWorkOrderIds.includes(transaction.work_order_id)}
                            onChange={() => handleToggleWorkOrderSelection(transaction)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        )}
                        </td>
                      )}
                      <td className="p-3">
                        {showPaymentDetails ? formatMountainDate(transaction.date) : format(parseISO(transaction.date), 'MMM d, yyyy')}
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
                        <td className="p-3 text-center no-print">
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
                    {transaction.source === 'charge' && transaction.workOrderLookupNumber && (
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
          {showTotalsRow && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                {!showPaymentDetails && <td className="p-3 no-print"></td>}
                <td className="p-3 text-slate-900" colSpan={showPaymentDetails ? 3 : 3}>Total</td>
                {!showPaymentDetails && (
                  <td className="p-3 text-right text-red-600">${totalCharges.toFixed(2)}</td>
                )}
                <td className="p-3 text-right text-green-600">${totalPayments.toFixed(2)}</td>
                {!showPaymentDetails && (
                  <td className="p-3 text-right">
                    <span className={closingOwing > 0 ? 'text-red-600' : closingOwing < 0 ? 'text-green-600' : 'text-slate-900'}>
                      ${Math.abs(closingOwing).toFixed(2)}
                      {closingOwing < 0 && ' CR'}
                    </span>
                  </td>
                )}
                {showPaymentDetails && <td className="p-3 no-print"></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

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

        <Card className="no-print">
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
          <CardHeader className="no-print">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Transaction History</CardTitle>
              <div className="flex items-center gap-2 no-print">
                {selectedWorkOrderIds.length > 0 && (
                  <Button onClick={() => setShowBatchSendModal(true)}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Selected
                  </Button>
                )}
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="print-only mb-4 border-b border-slate-300 pb-3">
              <h2 className="text-xl font-bold text-slate-900">A/R Transaction History</h2>
              <p className="text-slate-700">{formatCustomerName(customer)}</p>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Tab:</span> {activeTab === 'payments' ? 'Payments' : 'Transactions'}</p>
                <p><span className="font-semibold text-slate-900">Date Range:</span> {appliedDateRangeLabel}</p>
                {searchTerm && <p><span className="font-semibold text-slate-900">Search:</span> {searchTerm}</p>}
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 no-print">
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

      {batchSendResults.length > 0 && (
       <Card className="mt-6 no-print">
         <CardHeader>
           <CardTitle>Last Batch Send Status</CardTitle>
         </CardHeader>
         <CardContent className="space-y-3">
           {batchSendResults.map((result) => (
             <div key={result.work_order_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
               <div>
                 <p className="font-medium text-slate-900">{result.label}</p>
                 <p className="text-slate-500">{result.message}</p>
               </div>
               <Badge className={result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                 {result.success ? 'Sent' : 'Failed'}
               </Badge>
             </div>
           ))}
         </CardContent>
       </Card>
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

      <BatchSendWorkOrdersModal
       open={showBatchSendModal}
       onClose={() => setShowBatchSendModal(false)}
       customer={customer}
       selectedWorkOrders={selectedWorkOrders}
       onSent={handleBatchSendComplete}
      />
      </div>
      );
      }