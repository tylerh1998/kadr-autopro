import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';

const getCustomerDisplayName = (customer) => {
  if (!customer) return '';
  return customer.org_name || [customer.first_name, customer.last_name].filter(Boolean).join(' ');
};

const getWorkOrderLookupNumber = (workOrder) => {
  return workOrder?.inv_number || workOrder?.ro_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.crinv_number || '';
};

export default function TakePaymentModal({ open, onClose, customer, invoices = [], onTakePayment, onPaymentComplete }) {
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [activeTab, setActiveTab] = useState('pay_invoices');
  const [selectedCharges, setSelectedCharges] = useState({});
  const [outstandingCharges, setOutstandingCharges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPaymentDetailsDialog, setShowPaymentDetailsDialog] = useState(false);

  useEffect(() => {
    const fetchOutstandingCharges = async () => {
      if (!customer || !open) return;

      try {
        const { data, error } = await supabase
          .rpc('get_outstanding_ar_items', { customer_id_val: customer.id });

        if (error) throw error;
        setOutstandingCharges(data || []);
      } catch (error) {
        console.error('Error fetching outstanding charges:', error);
        alert('Failed to load outstanding charges');
      }
    };

    fetchOutstandingCharges();
  }, [customer, open]);

  const chargesSelectedTotal = useMemo(() => {
    return outstandingCharges
      .filter(charge => selectedCharges[charge.id] && Number(charge.balance || 0) > 0)
      .reduce((total, charge) => total + Number(charge.balance || 0), 0);
  }, [selectedCharges, outstandingCharges]);

  const creditSelectedTotal = useMemo(() => {
    return outstandingCharges
      .filter(charge => selectedCharges[charge.id] && Number(charge.balance || 0) < 0)
      .reduce((total, charge) => total + Math.abs(Number(charge.balance || 0)), 0);
  }, [selectedCharges, outstandingCharges]);

  const creditAppliedTotal = Math.min(chargesSelectedTotal, creditSelectedTotal);
  const netAmountDue = Math.max(chargesSelectedTotal - creditAppliedTotal, 0);

  const hasAvailableCredit = useMemo(() => (
    outstandingCharges.some(charge => Number(charge.balance || 0) < -0.01)
  ), [outstandingCharges]);

  const handleSelectCharge = (chargeId, checked) => {
    setSelectedCharges(prev => {
      const newSelection = { ...prev };
      if (checked) {
        newSelection[chargeId] = true;
      } else {
        delete newSelection[chargeId];
      }
      return newSelection;
    });
  };

  const buildPaymentBody = () => {
    const isPayInvoices = activeTab === 'pay_invoices';
    const paymentAmount = isPayInvoices ? netAmountDue : parseFloat(amount);
    return {
      action: 'create_payment',
      customer_id: customer.id,
      payment_date: format(paymentDate, 'yyyy-MM-dd'),
      payment_amount: paymentAmount,
      payment_method: paymentMethod,
      reference,
      apply_mode: isPayInvoices ? 'selected' : 'oldest',
      selected_charge_ids: Object.keys(selectedCharges),
      credit_card_fee_amount: creditCardFeeAmount
    };
  };

  const submitPayment = async (bodyOverrides = {}) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('autopro-processCustomerARAccounting', {
        body: { ...buildPaymentBody(), ...bodyOverrides }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to process payment');

      const updatedPaymentRecord = data?.payment;

      if (onTakePayment) {
        await onTakePayment();
      }

      setSelectedCharges({});
      setAmount('');
      setPaymentDate(new Date());
      setPaymentMethod('cash');
      setReference('');
      setShowPaymentDetailsDialog(false);
      onClose();

      if (onPaymentComplete && updatedPaymentRecord) {
        onPaymentComplete(updatedPaymentRecord);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      const errorMessage = error?.response?.data?.error || error.message || error.toString();
      alert(`Failed to process payment: ${errorMessage}\n\nPlease check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => submitPayment();

  const handleSubmitCreditOnly = () => submitPayment({
    payment_amount: 0,
    payment_method: 'credit_applied',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    reference: '',
    credit_card_fee_amount: 0
  });

  const handleProceedToPaymentDetails = () => {
    if (activeTab === 'pay_invoices') {
      if (chargesSelectedTotal <= 0.01) {
        alert('Please select at least one charge to pay.');
        return;
      }
      if (netAmountDue <= 0.01) {
        handleSubmitCreditOnly();
        return;
      }
      setShowPaymentDetailsDialog(true);
      return;
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }
    setShowPaymentDetailsDialog(true);
  };

  const baseAmount = useMemo(() => (
    activeTab === 'pay_invoices' ? netAmountDue : (parseFloat(amount) || 0)
  ), [activeTab, netAmountDue, amount]);

  const creditCardFeeAmount = useMemo(() => (
    paymentMethod === 'credit_card' ? baseAmount * 0.03 : 0
  ), [baseAmount, paymentMethod]);

  // Canadian cash rounding: physical cash settles to the nearest nickel, so a cash payment's
  // amount due can differ from what's actually collected by a cent or two. Mirrors the exact
  // rounding formula used server-side (autopro-processCustomerARAccounting) so this preview
  // matches what actually gets charged/recorded as a Penny Adjustment.
  const roundedCashAmount = useMemo(() => Math.round(baseAmount * 20) / 20, [baseAmount]);
  const cashPennyAdjustment = useMemo(() => (
    Math.round((roundedCashAmount - baseAmount + Number.EPSILON) * 100) / 100
  ), [roundedCashAmount, baseAmount]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take Payment for {getCustomerDisplayName(customer)}</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pay_invoices">Pay Specific Invoices</TabsTrigger>
            <TabsTrigger value="pay_oldest">Pay On Account (Oldest First)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pay_invoices" className="py-4 space-y-4">
            <div className="border rounded-md max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingCharges.length > 0 ? outstandingCharges.map((charge, index) => {
                    const isSelected = !!selectedCharges[charge.id];
                    return (
                      <TableRow 
                        key={charge.id}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/40' : (index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/50' : '')} hover:bg-blue-100 dark:hover:bg-blue-900/60`}
                        onClick={() => handleSelectCharge(charge.id, !isSelected)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectCharge(charge.id, checked)}
                          />
                        </TableCell>
                        <TableCell className="capitalize">{charge.type}</TableCell>
                        <TableCell>{charge.reference}</TableCell>
                        <TableCell>{format(parseISO(charge.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{charge.age_days} days</TableCell>
                        <TableCell className="text-right">
                          {Number(charge.balance || 0) < 0 ? (
                            <span className="text-green-600 dark:text-green-400">${Math.abs(Number(charge.balance || 0)).toFixed(2)} CR</span>
                          ) : (
                            <span>${Number(charge.balance || 0).toFixed(2)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={6} className="text-center h-24">No outstanding charges.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Charges Selected:</span>
                <span className="font-medium">${chargesSelectedTotal.toFixed(2)}</span>
              </div>
              {creditAppliedTotal > 0.01 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-green-700 dark:text-green-400">Credit Applied:</span>
                  <span className="font-medium text-green-700 dark:text-green-400">-${creditAppliedTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="font-semibold">Net Amount Due:</span>
                <span className="text-xl font-bold">${netAmountDue.toFixed(2)}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pay_oldest" className="py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount</Label>
              <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              {hasAvailableCredit && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Available credit will be applied automatically.</p>
              )}
              {outstandingCharges.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">This customer has no outstanding balance - this payment will be recorded as a credit (overpayment) on their account.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleProceedToPaymentDetails}
            disabled={loading || (activeTab === 'pay_invoices' && chargesSelectedTotal === 0) || (activeTab === 'pay_oldest' && (!amount || parseFloat(amount) <= 0))}
          >
            {activeTab === 'pay_invoices' && chargesSelectedTotal > 0 && netAmountDue <= 0.01
              ? (loading ? 'Applying Credit...' : `Apply Credit ($${chargesSelectedTotal.toFixed(2)})`)
              : `Next: Payment Details ($${(activeTab === 'pay_invoices' ? netAmountDue : (parseFloat(amount) || 0)).toFixed(2)})`}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showPaymentDetailsDialog} onOpenChange={(open) => { if (!open) setShowPaymentDetailsDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400">Payment Amount:</p>
              <p className="text-xl font-bold">
                ${baseAmount.toFixed(2)}
              </p>
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-amber-800 dark:text-amber-500">Credit Card Fee (3%):</p>
                  <p className="text-lg font-bold text-amber-800 dark:text-amber-400">
                    ${creditCardFeeAmount.toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-amber-200 dark:border-amber-900/50">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-400">Total to Charge:</p>
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-300">
                    ${(baseAmount + creditCardFeeAmount).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'cash' && cashPennyAdjustment !== 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-900/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-blue-800 dark:text-blue-500">Penny Adjustment (Cash Rounding):</p>
                  <p className="text-lg font-bold text-blue-800 dark:text-blue-400">
                    {cashPennyAdjustment > 0 ? '+' : '-'}${Math.abs(cashPennyAdjustment).toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200 dark:border-blue-900/50">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-400">Amount to Collect:</p>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    ${roundedCashAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'cash', label: 'Cash' },
                  { value: 'debit', label: 'Debit' },
                  { value: 'credit_card', label: 'Credit Card' },
                  { value: 'cheque', label: 'Cheque' },
                  { value: 'e_transfer', label: 'e-Transfer' }
                ].map(method => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      paymentMethod === method.value
                        ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-md'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reference (Optional)</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g., Cheque #" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowPaymentDetailsDialog(false)}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Processing...' : (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Submit Payment
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}