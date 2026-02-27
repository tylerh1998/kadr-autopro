import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon, Loader2, X } from 'lucide-react';
import { format, parseISO, differenceInDays, parse, endOfMonth, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from "@/lib/utils";
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { checkBankAccountLock, checkEntityLock } from '../utils/mountainTimeUtils';
import { checkFiscalPeriodStatus } from '../utils/fiscalPeriodUtils';
import { BankAccount, LinesOfCredit } from '@/entities/all';
import AddToSheetModal from './AddToSheetModal';

// Helper function to safely parse date for calendar component
const safeParseDateForCalendar = (dateString) => {
    if (!dateString || dateString === '') return undefined;
    try {
        const parsed = parseISO(dateString);
        if (isNaN(parsed.getTime())) return undefined;
        return parsed;
    } catch (error) {
        console.error('Date parsing error for calendar:', error, dateString);
        return undefined;
    }
};

// Helper function to format date for input field (MM/DD/YYYY)
const formatDateForInput = (dateString) => {
    if (!dateString || dateString === '') return '';
    try {
        const parsed = parseISO(dateString);
        if (isNaN(parsed.getTime())) return '';
        return format(parsed, 'MM/dd/yyyy');
    } catch (error) {
        console.error('Date formatting error for input:', error, dateString);
        return '';
    }
};

// Helper function to parse and validate date input with autofill
const parseAndValidateDateInput = (inputDate) => {
    if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
    
    const trimmed = inputDate.trim();
    let month, day, year;
    
    try {
        const parts = trimmed.split('/');
        
        if (parts.length === 2) {
            // MM/DD format - autofill current year
            month = parts[0];
            day = parts[1];
            year = new Date().getFullYear().toString();
        } else if (parts.length === 3) {
            // MM/DD/YY or MM/DD/YYYY format
            month = parts[0];
            day = parts[1];
            year = parts[2];
            
            // Convert 2-digit year to 4-digit
            if (year.length === 2) {
                const currentYear = new Date().getFullYear();
                const currentCentury = Math.floor(currentYear / 100) * 100;
                const twoDigitYear = parseInt(year);
                year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
            }
        } else {
            return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
        }
        
        // Pad month and day
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
        
        // Validate numeric values
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
            return { valid: false, date: null, error: 'Date must contain valid numbers' };
        }
        
        if (monthNum < 1 || monthNum > 12) {
            return { valid: false, date: null, error: 'Month must be between 1 and 12' };
        }
        
        if (dayNum < 1 || dayNum > 31) {
            return { valid: false, date: null, error: 'Day must be between 1 and 31' };
        }
        
        if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) { // Arbitrary but reasonable year range
            return { valid: false, date: null, error: 'Year must be a valid 4-digit year (1900-2100)' };
        }
        
        // Create date and validate it's a real date
        const isoDate = `${year}-${month}-${day}`;
        const testDate = new Date(isoDate + 'T00:00:00'); // Use T00:00:00 to avoid timezone issues
        
        if (isNaN(testDate.getTime())) {
            return { valid: false, date: null, error: 'Invalid date' };
        }
        
        // Verify the date components match (catches invalid dates like Feb 30)
        if (testDate.getFullYear() !== yearNum || 
            testDate.getMonth() + 1 !== monthNum || 
            testDate.getDate() !== dayNum) {
            return { valid: false, date: null, error: 'Invalid date (e.g., Feb 30, April 31 do not exist)' };
        }
        
        return { valid: true, date: isoDate, error: null };
    } catch (error) {
        console.error('Date parsing error:', error, inputDate);
        return { valid: false, date: null, error: 'Error parsing date' };
    }
};

export default function SupplierPaymentModal({ open, onClose, supplier, invoiceLines, onPaymentComplete }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pay_invoices');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [linesOfCredit, setLinesOfCredit] = useState([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState({});
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);
  const [showChequeNumberPrompt, setShowChequeNumberPrompt] = useState(false);
  const [chequeNumberInput, setChequeNumberInput] = useState('');
  const [nextChequeNumber, setNextChequeNumber] = useState(1);
  const [processingCheque, setProcessingCheque] = useState(false);
  const [showPaymentDetailsDialog, setShowPaymentDetailsDialog] = useState(false);
  const [showAddToSheetModal, setShowAddToSheetModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };
    fetchUser();
  }, []);

  const [paymentData, setPaymentData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_date_display: format(new Date(), 'MM/dd/yyyy'),
    payment_method: '',
    from_account_id: '',
    amount: '',
    notes: '',
    dateError: null
  });

  // Calculate total balance owing (sum of all balances, including credits as negative)
  const totalBalanceOwing = useMemo(() => {
    const total = outstandingInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);
    return Math.round(total * 100) / 100;
  }, [outstandingInvoices]);

  useEffect(() => {
    if (open && supplier) {
      loadData();
    } else {
      resetModal();
    }
  }, [open, supplier]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [banks, locs] = await Promise.all([
        base44.entities.BankAccount.filter({ is_active: true }),
        base44.entities.LinesOfCredit.filter({ is_active: true })
      ]);

      setBankAccounts(banks || []);
      setLinesOfCredit(locs || []);

      if (invoiceLines && Array.isArray(invoiceLines)) {
        // Create a unique key for each invoice since conceptual invoices might not have unique IDs
        // Include both positive balances (invoices) and negative balances (credits)
        const outstanding = invoiceLines
          .filter(inv => Math.abs(inv.balance_due) > 0.01)
          .map((inv, index) => ({
            ...inv,
            uniqueKey: `${inv.supplier_id}_${inv.invoice_number}_${inv.invoice_date}_${index}`
          }))
          .sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));
        setOutstandingInvoices(outstanding);
      }
    } catch (error) {
      console.error('Error loading payment data:', error);
      alert('Failed to load payment data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setActiveTab('pay_invoices');
    setSelectedInvoices({});
    setPaymentData({
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_date_display: format(new Date(), 'MM/dd/yyyy'),
      payment_method: '',
      from_account_id: '',
      amount: '',
      notes: '',
      dateError: null
    });
    setChequeNumberInput('');
    setShowChequeNumberPrompt(false);
    setProcessingCheque(false);
    setShowPaymentDetailsDialog(false);
    setShowAddToSheetModal(false);
    setDateRange({ from: undefined, to: undefined });
    setCalculationResult(null);
    setCalculating(false);
  };

  const handleInvoiceSelection = (invoiceKey, checked) => {
    setSelectedInvoices(prev => ({
      ...prev,
      [invoiceKey]: checked
    }));
  };

  const filteredInvoices = useMemo(() => {
    if (!dateRange?.from) return outstandingInvoices;

    return outstandingInvoices.filter(inv => {
      const invDate = parseISO(inv.invoice_date);
      const from = startOfDay(dateRange.from);
      
      if (dateRange.to) {
        const to = endOfDay(dateRange.to);
        return invDate >= from && invDate <= to;
      }
      
      return invDate >= from;
    });
  }, [outstandingInvoices, dateRange]);

  const handleSelectAll = (checked) => {
    setSelectedInvoices(prev => {
      const next = { ...prev };
      filteredInvoices.forEach(inv => {
        if (checked) {
          next[inv.uniqueKey] = true;
        } else {
          delete next[inv.uniqueKey];
        }
      });
      return next;
    });
  };

  const totalSelectedAmount = useMemo(() => {
    if (activeTab === 'pay_invoices') {
      return outstandingInvoices
        .filter(inv => selectedInvoices[inv.uniqueKey])
        .reduce((sum, inv) => sum + inv.balance_due, 0);
    } else {
      const clean = paymentData.amount.toString().replace(/[^0-9.-]+/g, "");
      return parseFloat(clean) || 0;
    }
  }, [activeTab, selectedInvoices, outstandingInvoices, paymentData.amount]);

  const handlePaymentMethodChange = (method) => {
    let defaultAccountId = '';
    
    if (method === 'Bank Account' || method === 'Cheque') {
      const primaryAccount = bankAccounts.find(acc => acc.primary);
      if (primaryAccount) {
        defaultAccountId = primaryAccount.id;
      }
    }
    
    setPaymentData(prev => ({
      ...prev,
      payment_method: method,
      from_account_id: defaultAccountId
    }));
  };

  const parseAmount = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const clean = value.toString().replace(/[^0-9.-]+/g, "");
    return parseFloat(clean) || 0;
  };

  const handleAmountChange = (value) => {
    const cleanValue = value.replace(/[^0-9.-]+/g, "");
    const numValue = parseFloat(cleanValue);

    // Clear previous calculation when amount changes
    if (calculationResult) {
        setCalculationResult(null);
    }

    setPaymentData(prev => ({
      ...prev,
      amount: value
    }));
  };

  const handleAmountBlur = () => {
    if (!paymentData.amount || paymentData.amount.trim() === '') return;
    const val = parseAmount(paymentData.amount);
    if (!isNaN(val)) {
        setPaymentData(prev => ({
            ...prev,
            amount: val.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        }));
    }
  };

  const handleProceedToPaymentDetails = () => {
    if (activeTab === 'pay_invoices' && Object.values(selectedInvoices).filter(Boolean).length === 0) {
      alert('Please select at least one invoice to pay');
      return;
    }

    if (activeTab === 'pay_on_account') {
      if (!paymentData.amount || parseFloat(paymentData.amount) === 0) {
        alert('Please enter a payment amount');
        return;
      }
      if (!calculationResult) {
        alert('Please calculate the payment breakdown before proceeding.');
        return;
      }
    }

    setShowPaymentDetailsDialog(true);
  };

  const handleSubmit = async () => {
    if (paymentData.dateError) {
      alert(`Invalid date: ${paymentData.dateError}`);
      return;
    }

    if (!paymentData.payment_method) {
      alert('Please select a payment method');
      return;
    }

    if (paymentData.payment_method !== 'Cash' && !paymentData.from_account_id) {
      alert('Please select a source account');
      return;
    }

    // Check if bank account is locked (for Bank Account, Cheque, or Line of Credit)
    if (paymentData.payment_method !== 'Cash') {
      try {
        let accountToCheck;
        
        if (paymentData.payment_method === 'Line of Credit') {
          // For LOC, check LOC lock
          accountToCheck = await LinesOfCredit.get(paymentData.from_account_id);
          
          if (accountToCheck.locked_by_user && accountToCheck.locked_timestamp) {
            const lockStatus = checkEntityLock(accountToCheck, currentUser?.email || '');
            
            if (lockStatus.isLocked) {
              alert(`This line of credit account is currently locked by ${accountToCheck.locked_by_user}. Please wait until the lock is released before making a payment.`);
              return;
            }
          }
        } else {
          // For Bank Account or Cheque, check the bank account lock
          accountToCheck = await BankAccount.get(paymentData.from_account_id);
          
          if (accountToCheck.locked_by_user && accountToCheck.locked_timestamp) {
            const lockStatus = checkBankAccountLock(accountToCheck, currentUser?.email || '');
            
            if (!lockStatus.isExpired) {
              alert(`This bank account is currently locked by ${accountToCheck.locked_by_user}. Please wait until the lock is released before making a payment.`);
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error checking bank account lock:', error);
        alert('Failed to verify bank account status. Please try again.');
        return;
      }
    }

    if (paymentData.payment_method === 'Cheque') {
      const selectedBank = bankAccounts.find(b => b.id === paymentData.from_account_id);
      if (selectedBank) {
        setNextChequeNumber(selectedBank.next_cheque_number || 1);
        setChequeNumberInput(String(selectedBank.next_cheque_number || 1));
        setShowPaymentDetailsDialog(false);
        setShowChequeNumberPrompt(true);
      }
    } else {
      await processPaymentLogic();
    }
  };

  const handleChequeNumberConfirm = async () => {
    if (!chequeNumberInput || chequeNumberInput.trim() === '') {
      alert('Please enter a cheque number');
      return;
    }
    setShowChequeNumberPrompt(false);
    setProcessingCheque(true);
    
    try {
      await processPaymentLogic(chequeNumberInput);
      
      // Navigate to cheque writer page with full refresh
      const chequeUrl = `${createPageUrl('ChequeWriter')}?chequeReference=${encodeURIComponent(chequeNumberInput)}`;
      window.location.href = chequeUrl;
    } catch (error) {
      setProcessingCheque(false);
      // Error already handled in processPaymentLogic
    }
  };

  const processPaymentLogic = async (chequeNumber = null) => {
    setLoading(true);
    try {
      let appliedInvoicesDetails = [];
      let paymentAmount = 0;

      if (activeTab === 'pay_invoices') {
        const selectedInvoicesList = outstandingInvoices.filter(inv => selectedInvoices[inv.uniqueKey]);
        appliedInvoicesDetails = selectedInvoicesList.map(inv => ({
          invoice_number: inv.invoice_number,
          amount_applied: inv.balance_due,
          id: inv.id // Include ID for optimization
        }));
        paymentAmount = selectedInvoicesList.reduce((sum, inv) => sum + inv.balance_due, 0);
      } else {
        // Pay On Account - Use calculated results
        paymentAmount = parseAmount(paymentData.amount);
        
        if (!calculationResult) {
            throw new Error("Please calculate payment breakdown first.");
        }

        appliedInvoicesDetails = calculationResult.appliedInvoices;
        
        // Add unapplied amount if any
        if (Math.abs(calculationResult.unappliedAmount) > 0.005) {
            appliedInvoicesDetails.push({
                invoice_number: 'On Account',
                amount_applied: calculationResult.unappliedAmount
            });
        }
      }

      // Call backend function to process payment
      const response = await base44.functions.invoke('processSupplierPayment', {
        supplierId: supplier.id,
        paymentDate: paymentData.payment_date,
        paymentMethod: paymentData.payment_method,
        fromAccountId: paymentData.from_account_id,
        totalPaymentAmount: paymentAmount,
        chequeNumber: chequeNumber || null,
        notes: paymentData.notes || null,
        appliedInvoices: appliedInvoicesDetails
      });

      // Handle response
      const result = response.data || response;
      
      if (result.success) {
        if (!chequeNumber) {
          if (onPaymentComplete) {
            onPaymentComplete();
          }
          onClose();
        }
      } else {
        throw new Error(result.error || 'Payment processing failed');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert(error.message || 'Failed to process payment. Please try again.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open && !showChequeNumberPrompt && !processingCheque} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <DialogTitle>Make Payment to {supplier?.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-[260px] justify-start text-left font-normal",
                      !dateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Filter by date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              {dateRange?.from && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setDateRange({ from: undefined, to: undefined })}
                  title="Clear date filter"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pay_invoices">Pay Specific Invoices</TabsTrigger>
                <TabsTrigger value="pay_on_account">Pay On Account</TabsTrigger>
              </TabsList>

              <TabsContent value="pay_invoices" className="space-y-4">
                <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={filteredInvoices.length > 0 && filteredInvoices.every(inv => selectedInvoices[inv.uniqueKey])}
                            onCheckedChange={handleSelectAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                            {outstandingInvoices.length === 0 ? "No outstanding invoices" : "No invoices found for this date range"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInvoices.map((invoice) => {
                          const age = differenceInDays(new Date(), parseISO(invoice.invoice_date));
                          const isSelected = selectedInvoices[invoice.uniqueKey];
                          const isCredit = invoice.balance_due < 0;
                          
                          return (
                            <TableRow 
                              key={invoice.uniqueKey}
                              className={`cursor-pointer ${isSelected ? 'bg-blue-50' : (isCredit ? 'bg-green-50' : '')} hover:bg-blue-100`}
                              onClick={() => handleInvoiceSelection(invoice.uniqueKey, !isSelected)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected || false}
                                  onCheckedChange={(checked) => handleInvoiceSelection(invoice.uniqueKey, checked)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {invoice.balance_due.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                              </TableCell>
                              <TableCell>{format(parseISO(invoice.invoice_date), 'MMM d, yyyy')}</TableCell>
                              <TableCell>{age} days</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                  <span className="font-semibold">Selected Amount:</span>
                  <span className="text-xl font-bold">{totalSelectedAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
              </TabsContent>

              <TabsContent value="pay_on_account" className="space-y-4">
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      This payment will be applied to the oldest outstanding invoices first.
                      Any remaining amount will be kept on account.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Payment Amount</Label>
                    <div className="flex gap-2">
                        <Input
                          id="payment-amount"
                          type="text"
                          placeholder="$0.00 (enter negative for a refund)"
                          value={paymentData.amount}
                          onChange={(e) => handleAmountChange(e.target.value)}
                          onBlur={handleAmountBlur}
                        />
                        <Button 
                            onClick={async () => {
                                const amount = parseAmount(paymentData.amount);
                                if (!amount) {
                                    alert("Please enter a valid amount");
                                    return;
                                }
                                setCalculating(true);
                                setCalculationResult(null);
                                try {
                                    const res = await base44.functions.invoke('calculateSupplierPaymentBreakdown', {
                                        supplierId: supplier.id,
                                        paymentAmount: amount
                                    });
                                    if (res.data.success) {
                                        setCalculationResult(res.data.breakdown);
                                    } else {
                                        alert(res.data.error || "Calculation failed");
                                    }
                                } catch (e) {
                                    console.error(e);
                                    alert("Calculation failed: " + e.message);
                                } finally {
                                    setCalculating(false);
                                }
                            }}
                            disabled={calculating || !paymentData.amount}
                        >
                            {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Calculate"}
                        </Button>
                    </div>
                    <p className="text-sm text-slate-500">
                      Total Balance Owing: {totalBalanceOwing.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </p>
                  </div>

                  {calculationResult && (
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-slate-100 px-4 py-2 font-medium border-b flex justify-between">
                            <span>Proposed Application</span>
                            <span>{calculationResult.totalApplied.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead className="text-right">Applied</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {calculationResult.appliedInvoices.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground">No invoices applied</TableCell>
                                        </TableRow>
                                    ) : (
                                        calculationResult.appliedInvoices.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{item.invoice_number}</TableCell>
                                                <TableCell className={`text-right ${item.amount_applied < 0 ? 'text-green-600' : ''}`}>
                                                    {item.amount_applied.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    {Math.abs(calculationResult.unappliedAmount) > 0.005 && (
                                        <TableRow className="bg-amber-50">
                                            <TableCell className="font-medium text-amber-800">Unapplied (On Account)</TableCell>
                                            <TableCell className="text-right font-medium text-amber-800">
                                                {calculationResult.unappliedAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                onClick={() => setShowAddToSheetModal(true)}
                disabled={loading || totalSelectedAmount === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Next: Add to Cash Flow
              </Button>
              <Button onClick={handleProceedToPaymentDetails} disabled={loading || totalSelectedAmount === 0}>
                Next: Payment Details ({totalSelectedAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDetailsDialog && !showChequeNumberPrompt && !processingCheque} onOpenChange={(open) => { if (!open) setShowPaymentDetailsDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Payment Amount:</p>
              <p className="text-xl font-bold">{totalSelectedAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <div className="flex items-center gap-1 max-w-xs">
                  <Input
                    type="text"
                    value={paymentData.payment_date_display}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, payment_date_display: e.target.value, dateError: null }))}
                    onBlur={async (e) => {
                      const value = e.target.value;
                      const parseResult = parseAndValidateDateInput(value);
                      
                      if (!parseResult.valid) {
                        setPaymentData(prev => ({ ...prev, dateError: parseResult.error }));
                        return;
                      }

                      const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
                      if (!fiscalCheck.isValid) {
                        setPaymentData(prev => ({ ...prev, dateError: fiscalCheck.message }));
                        return;
                      }

                      setPaymentData(prev => ({
                        ...prev,
                        payment_date: parseResult.date,
                        payment_date_display: formatDateForInput(parseResult.date),
                        dateError: null
                      }));
                    }}
                    placeholder="MM/DD/YYYY"
                    className={`flex-1 ${paymentData.dateError ? 'border-red-500 text-red-600' : ''}`}
                    title={paymentData.dateError || ''}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-10 w-10">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={safeParseDateForCalendar(paymentData.payment_date)}
                        onSelect={async (date) => {
                          if (date) {
                            const isoDate = format(date, 'yyyy-MM-dd');
                            const fiscalCheck = await checkFiscalPeriodStatus(isoDate);
                            
                            if (!fiscalCheck.isValid) {
                                alert(fiscalCheck.message);
                                return;
                            }

                            setPaymentData(prev => ({
                              ...prev,
                              payment_date: isoDate,
                              payment_date_display: formatDateForInput(isoDate),
                              dateError: null
                            }));
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {paymentData.dateError && <p className="text-xs text-red-600">{paymentData.dateError}</p>}
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="flex flex-wrap gap-2">
                  {['Bank Account', 'Cheque', 'Line of Credit', 'Cash'].map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => handlePaymentMethodChange(method)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        paymentData.payment_method === method
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {paymentData.payment_method && paymentData.payment_method !== 'Cash' && (
              <div className="space-y-2">
                <Label>
                  {paymentData.payment_method === 'Line of Credit' ? 'Line of Credit' : 'Bank Account'}
                </Label>
                <Select
                  value={paymentData.from_account_id}
                  onValueChange={(value) => setPaymentData(prev => ({ ...prev, from_account_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${paymentData.payment_method === 'Line of Credit' ? 'line of credit' : 'bank account'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentData.payment_method === 'Line of Credit'
                      ? linesOfCredit.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name} (Available: {loc.available_credit?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || '$0.00'})
                          </SelectItem>
                        ))
                      : bankAccounts.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add notes about this payment..."
                value={paymentData.notes}
                onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowPaymentDetailsDialog(false)} disabled={loading}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Process Payment`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showChequeNumberPrompt} onOpenChange={setShowChequeNumberPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Cheque Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cheque Number</Label>
              <Input
                type="text"
                value={chequeNumberInput}
                onChange={(e) => setChequeNumberInput(e.target.value)}
                placeholder="Enter cheque number"
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowChequeNumberPrompt(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleChequeNumberConfirm} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {processingCheque && (
        <Dialog open={true}>
          <DialogContent className="max-w-md">
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Processing Payment</h3>
                <p className="text-sm text-slate-600">Please wait while we process your payment and prepare the cheque...</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AddToSheetModal
        open={showAddToSheetModal}
        onClose={() => setShowAddToSheetModal(false)}
        initialValues={{
            supplierName: supplier?.name,
            amount: totalSelectedAmount,
            dueDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
        }}
        onSuccess={onClose}
      />
    </>
  );
}