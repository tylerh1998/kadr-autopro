import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, CreditCard, Loader2, PlusCircle, Trash2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'e_transfer', label: 'e-Transfer' },
  { value: 'on_account', label: 'On Account' },
  { value: 'other', label: 'Other' }
];

export default function InvoicePaymentModal({
  open,
  onClose,
  onSubmit, // Not used directly here, but kept for signature.
  workOrder,
  customer, // Added for cheque name default
  totalAmount, // Added as a prop
  existingPayments = [], // Added as a prop
  onProcessPayment,
  onNavigateAway // Added to suppress unsaved changes warning
}) {
  const [payments, setPayments] = useState([]);
  const [newPayment, setNewPayment] = useState({
    amount: 0,
    method: 'cash', // Default to schema value
    cheque_name: '',
    cheque_number: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });
  const [loading, setLoading] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [invoiceDateLocked, setInvoiceDateLocked] = useState(false);

  // Helper to get customer display name
  const getCustomerDisplayName = () => {
    if (!customer) return '';
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  useEffect(() => {
    if (open) {
      // Initialize payments directly from existingPayments prop
      setPayments(Array.isArray(existingPayments) ? existingPayments : []);
      // Reset cheque_name to customer display name when modal opens
      setNewPayment(prev => ({
        ...prev,
        cheque_name: getCustomerDisplayName()
      }));
      // Check if invoice date already exists on work order
      if (workOrder?.invoice_date) {
        setInvoiceDate(workOrder.invoice_date);
        setInvoiceDateLocked(true);
      } else {
        setInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
        setInvoiceDateLocked(false);
      }
    }
  }, [open, existingPayments, customer, workOrder]); // Dependency on existingPayments prop, customer, and workOrder

  const { totalPaid, balanceDue } = useMemo(() => {
    // totalAmount is now passed as a prop, no need to calculate it here from line_items

    // totalPaid calculation uses numeric amount from payments state
    const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balanceDue = totalAmount - totalPaid;

    return { totalPaid, balanceDue };
  }, [totalAmount, payments]); // totalAmount is now a dependency

  const handleNewPaymentChange = (field, value) => {
    setNewPayment(prev => {
      let updatedValue = value;
      if (field === 'amount') {
        updatedValue = parseFloat(value) || 0; // Ensure amount is always a number
      }
      return { ...prev, [field]: updatedValue };
    });
  };

  const handleAddPayment = async () => {


    try {
      setLoading(true);

      let finalAmount = parseFloat(newPayment.amount);
      let pennyAdjustment = 0;

      // Apply Canadian Cash Rounding if method is cash
      if (newPayment.method === 'cash') {
        // Round to nearest 0.05
        const roundedAmount = Math.round(finalAmount * 20) / 20;
        pennyAdjustment = roundedAmount - finalAmount;
        finalAmount = roundedAmount;
        
        // Adjust precision
        pennyAdjustment = parseFloat(pennyAdjustment.toFixed(2));
        finalAmount = parseFloat(finalAmount.toFixed(2));

        if (pennyAdjustment !== 0) {
          console.log(`Applying penny adjustment: ${pennyAdjustment} (Original: ${newPayment.amount}, Rounded: ${finalAmount})`);
        }
      }

      // Apply Credit Card Fee (3%)
      let creditCardFee = 0;
      if (newPayment.method === 'credit_card') {
        creditCardFee = finalAmount * 0.03;
        creditCardFee = parseFloat(creditCardFee.toFixed(2));
        console.log(`Applying credit card fee: ${creditCardFee} (Amount: ${finalAmount})`);
      }

      const paymentData = {
        amount: finalAmount + creditCardFee, 
        method: newPayment.method,
        date: newPayment.date,
      };

      if (pennyAdjustment !== 0) {
        paymentData.penny_adjustment = pennyAdjustment;
      }

      if (creditCardFee > 0) {
        paymentData.credit_card_fee = creditCardFee;
      }
      
      // Add cheque fields if payment method is cheque
      if (newPayment.method === 'cheque') {
        paymentData.cheque_name = newPayment.cheque_name;
        paymentData.cheque_number = newPayment.cheque_number;
      }
      
      await onProcessPayment('add', paymentData);
      // Reset form
      setNewPayment({
        amount: 0,
        method: 'cash',
        cheque_name: '',
        cheque_number: '',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
    } catch (error) {
      console.error('Error adding payment:', error);
      alert(`Failed to add payment: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePayment = async (payment) => {
    if (!payment.id) { // Assume only payments with an ID can be removed from DB
      alert("Cannot delete payment - no ID found.");
      return;
    }

    try {
      setLoading(true);

      // Validation: Check CustomerPayments entity
      const cp = await base44.entities.CustomerPayments.get(payment.id);
      if (cp) {
        if (cp.deposited) {
          alert("Cannot delete this payment as it has already been deposited.");
          setLoading(false);
          return;
        }
        if (cp.ar_paid && Number(cp.ar_paid) !== 0) {
          alert("Cannot delete this payment as a payment has already been made against it in Accounts Receivable.");
          setLoading(false);
          return;
        }
      }

      await onProcessPayment('delete', { id: payment.id });
    } catch (error) {
      console.error('Error removing payment:', error);
      alert(`Failed to remove payment: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    try {
      setLoading(true);
      
      // Save the invoice date via parent onSubmit (which calls handleSave)
      // This ensures the unsaved changes flag is cleared in DocumentEditor before navigation
      if (onSubmit) {
        await onSubmit({ invoice_date: invoiceDate });
      }

      // Signal navigation to parent to suppress unsaved changes warning
      if (onNavigateAway) {
        onNavigateAway();
      }
      
      // Navigate in the same window/tab, replacing WorkOrderEdit
      const url = `/InvoiceConversion?id=${workOrder.ro_number}`;
      window.location.href = url;
      // No onClose() call - the page is being replaced
    } catch (error) {
      console.error('Error saving invoice date:', error);
      alert('Failed to save invoice date. Please try again.');
      setLoading(false);
    }
  };

  const setAmountToBalance = () => {
    setNewPayment(prev => ({ ...prev, amount: parseFloat(balanceDue.toFixed(2)) })); // Ensure it's a number
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl"> {/* Adjusted max-width for new layout */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-600" />
            Settle Payment for Invoice
          </DialogTitle>
          <DialogDescription>
            Record payments to settle the final invoice amount. The balance must be zero to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Add Payment Form */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h4 className="text-lg font-semibold border-b pb-2 mb-4">Add Payment</h4>
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount *</Label>
              <Input
                id="payment-amount"
                type="number"
                placeholder="0.00"
                value={newPayment.amount === 0 ? '' : newPayment.amount} // Show empty string for 0 for better UX
                onChange={(e) => handleNewPaymentChange('amount', e.target.value)}
                disabled={loading}
              />
              <Button variant="link" size="sm" className="p-0 h-auto" onClick={setAmountToBalance} disabled={loading}>
                Pay remaining balance
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Method *</Label>
              <div className="flex flex-wrap gap-2">
                {paymentMethodOptions.map(method => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => handleNewPaymentChange('method', method.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      newPayment.method === method.value
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-date">Date *</Label>
              <Input
                id="payment-date"
                type="date"
                value={newPayment.date}
                onChange={(e) => handleNewPaymentChange('date', e.target.value)}
                disabled={loading}
              />
            </div>
            {newPayment.method === 'cheque' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cheque-name">Cheque Name</Label>
                  <Input
                    id="cheque-name"
                    placeholder="Name on cheque"
                    value={newPayment.cheque_name}
                    onChange={(e) => handleNewPaymentChange('cheque_name', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cheque-number">Cheque Number</Label>
                  <Input
                    id="cheque-number"
                    placeholder="e.g., 12345"
                    value={newPayment.cheque_number}
                    onChange={(e) => handleNewPaymentChange('cheque_number', e.target.value)}
                    disabled={loading}
                  />
                </div>
              </>
            )}
            <Button onClick={handleAddPayment} className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusCircle className="w-4 h-4 mr-2" />} Add Payment
            </Button>
          </div>

          {/* Payments Summary and List */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span>Total Invoice:</span>
                  <span className="font-semibold text-lg">${totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Total Paid:</span>
                  <span className="font-semibold text-lg">${totalPaid.toFixed(2)}</span>
                </div>
                <div className={`flex justify-between items-center ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <span className="font-semibold text-lg">Balance Due:</span>
                  <span className="font-bold text-xl">${balanceDue.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h4 className="text-md font-semibold">Applied Payments</h4>
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {payments.length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">No payments applied yet.</p>
                ) : (
                  payments.map((payment, index) => (
                    <div key={payment.id || `temp-${index}`} className="flex items-center justify-between p-3 border-b last:border-b-0">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">${Number(payment.amount).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {(payment.payment_method || payment.method)?.replace(/_/g, ' ')}
                            {payment.payment_date && (() => {
                              const [year, month, day] = payment.payment_date.split('-').map(Number);
                              const localDate = new Date(year, month - 1, day);
                              return ` - ${format(localDate, 'MMM d, yyyy')}`;
                            })()}
                          </p>
                          {payment.penny_adjustment_amount && (
                             <p className="text-xs text-amber-600">
                               Penny Adj: ${Number(payment.penny_adjustment_amount).toFixed(2)}
                             </p>
                          )}
                          {payment.credit_card_fee_amount && (
                             <p className="text-xs text-blue-600">
                               CC Fee (3%): ${Number(payment.credit_card_fee_amount).toFixed(2)}
                             </p>
                          )}
                        </div>
                      </div>
                      {payment.id && ( // Only allow removing if payment has a database ID
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemovePayment(payment)}
                          className="text-red-500 hover:text-red-700"
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Warning if balance not zero */}
        {Math.abs(balanceDue) > 0.005 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Balance must be zero to continue</p>
          <p className="text-sm">Please add or remove payments until the balance due is $0.00</p>
          {newPayment.method === 'cash' && Math.abs(balanceDue) <= 0.02 && (
            <p className="text-xs text-amber-700 mt-1 font-medium">Tip: Use the "Pay remaining balance" link then select Cash to auto-apply rounding.</p>
          )}
        </div>
        </div>
        )}

        <DialogFooter className="flex items-center justify-between pt-4 gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="invoice-date" className="whitespace-nowrap text-sm font-medium">Invoice Date:</Label>
              <Input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-40"
                disabled={loading || invoiceDateLocked}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                onClick={handleContinue} 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={Math.abs(balanceDue) > 0.005 || loading}
              >
                Continue
              </Button>
            </div>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}