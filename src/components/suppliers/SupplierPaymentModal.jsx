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
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInDays, parse } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { checkBankAccountLock } from '../utils/mountainTimeUtils';
import { BankAccount } from '@/entities/all';

export default function SupplierPaymentModal({ open, onClose, supplier, invoiceLines, onPaymentComplete }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pay_invoices');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [linesOfCredit, setLinesOfCredit] = useState([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState({});
  const [showChequeNumberPrompt, setShowChequeNumberPrompt] = useState(false);
  const [chequeNumberInput, setChequeNumberInput] = useState('');
  const [nextChequeNumber, setNextChequeNumber] = useState(1);
  const [processingCheque, setProcessingCheque] = useState(false);
  const [showPaymentDetailsDialog, setShowPaymentDetailsDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

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
    notes: ''
  });

  // Calculate total balance owing (sum of positive balances only)
  const totalBalanceOwing = useMemo(() => {
    return outstandingInvoices
      .filter(inv => inv.balance > 0)
      .reduce((sum, inv) => sum + inv.balance, 0);
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
        const outstanding = invoiceLines
          .filter(inv => Math.abs(inv.balance_due) > 0.01)
          .map((inv, index) => ({
            ...inv,
            uniqueKey: `${inv.supplier_id}_${inv.invoice_number}_${inv.invoice_date}_${index}`
          }));
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
      notes: ''
    });
    setChequeNumberInput('');
    setShowChequeNumberPrompt(false);
    setProcessingCheque(false);
    setShowPaymentDetailsDialog(false);
  };

  const handleInvoiceSelection = (invoiceKey, checked) => {
    setSelectedInvoices(prev => ({
      ...prev,
      [invoiceKey]: checked
    }));
  };

  const totalSelectedAmount = useMemo(() => {
    if (activeTab === 'pay_invoices') {
      return outstandingInvoices
        .filter(inv => selectedInvoices[inv.uniqueKey])
        .reduce((sum, inv) => sum + inv.balance_due, 0);
    } else {
      return parseFloat(paymentData.amount) || 0;
    }
  }, [activeTab, selectedInvoices, outstandingInvoices, paymentData.amount]);

  const handlePaymentMethodChange = (method) => {
    setPaymentData(prev => ({
      ...prev,
      payment_method: method,
      from_account_id: ''
    }));
  };

  const handleAmountChange = (value) => {
    const numValue = parseFloat(value);
    
    // If it's a positive payment and exceeds balance owing, show error and don't update
    if (!isNaN(numValue) && numValue > 0 && numValue > totalBalanceOwing + 0.01) {
      alert(`Payment amount cannot exceed the total balance owing of $${totalBalanceOwing.toFixed(2)}`);
      return;
    }
    
    setPaymentData(prev => ({
      ...prev,
      amount: value
    }));
  };

  const handleProceedToPaymentDetails = () => {
    if (activeTab === 'pay_invoices' && Object.values(selectedInvoices).filter(Boolean).length === 0) {
      alert('Please select at least one invoice to pay');
      return;
    }

    if (activeTab === 'pay_on_account' && (!paymentData.amount || parseFloat(paymentData.amount) === 0)) {
      alert('Please enter a payment amount');
      return;
    }

    setShowPaymentDetailsDialog(true);
  };

  const handleSubmit = async () => {
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
          // For LOC, we don't check bank account locks
          // LOC has its own locking mechanism if needed
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
          amount_applied: inv.balance_due
        }));
        paymentAmount = selectedInvoicesList.reduce((sum, inv) => sum + inv.balance_due, 0);
      } else {
        paymentAmount = parseFloat(paymentData.amount);
        
        const sortedInvoices = [...outstandingInvoices]
          .filter(inv => inv.balance_due > 0)
          .sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));

        let remainingPayment = paymentAmount;
        
        for (const invoice of sortedInvoices) {
          if (remainingPayment <= 0) break;
          
          const amountToApply = Math.min(remainingPayment, invoice.balance_due);
          appliedInvoicesDetails.push({
            invoice_number: invoice.invoice_number,
            amount_applied: amountToApply
          });
          remainingPayment -= amountToApply;
        }

        if (remainingPayment > 0.01) {
          appliedInvoicesDetails.push({
            invoice_number: 'On Account',
            amount_applied: remainingPayment
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
          alert('Payment processed successfully!');
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
          <DialogHeader>
            <DialogTitle>Make Payment to {supplier?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pay_invoices">Pay Specific Invoices</TabsTrigger>
                <TabsTrigger value="pay_on_account">Pay On Account</TabsTrigger>
              </TabsList>

              <TabsContent value="pay_invoices" className="space-y-4">
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outstandingInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                            No outstanding invoices
                          </TableCell>
                        </TableRow>
                      ) : (
                        outstandingInvoices.map((invoice) => {
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
                                ${invoice.balance_due.toFixed(2)}
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
                  <span className="text-xl font-bold">${totalSelectedAmount.toFixed(2)}</span>
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
                    <Input
                      id="payment-amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00 (enter negative for a refund)"
                      value={paymentData.amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                    />
                    <p className="text-sm text-slate-500">
                      Total Balance Owing: ${totalBalanceOwing.toFixed(2)}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleProceedToPaymentDetails} disabled={loading || totalSelectedAmount === 0}>
                Next: Payment Details (${Math.abs(totalSelectedAmount).toFixed(2)})
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
              <p className="text-xl font-bold">${Math.abs(totalSelectedAmount).toFixed(2)}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <div className="flex items-center gap-1 max-w-xs">
                  <Input
                    type="text"
                    value={paymentData.payment_date_display}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, payment_date_display: e.target.value }))}
                    onBlur={(e) => {
                      const value = e.target.value;
                      try {
                        const parsedDate = parse(value, 'MM/dd/yyyy', new Date());
                        if (!isNaN(parsedDate.getTime())) {
                          setPaymentData(prev => ({
                            ...prev,
                            payment_date: format(parsedDate, 'yyyy-MM-dd'),
                            payment_date_display: format(parsedDate, 'MM/dd/yyyy')
                          }));
                        }
                      } catch (error) {
                        setPaymentData(prev => ({
                          ...prev,
                          payment_date_display: format(parseISO(prev.payment_date), 'MM/dd/yyyy')
                        }));
                      }
                    }}
                    placeholder="MM/DD/YYYY"
                    className="flex-1"
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
                        selected={parseISO(paymentData.payment_date)}
                        onSelect={(date) => {
                          if (date) {
                            setPaymentData(prev => ({
                              ...prev,
                              payment_date: format(date, 'yyyy-MM-dd'),
                              payment_date_display: format(date, 'MM/dd/yyyy')
                            }));
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
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
                            {loc.name} (Available: ${loc.available_credit?.toFixed(2) || '0.00'})
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
    </>
  );
}