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
import { format, differenceInDays } from 'date-fns';
import { base44 } from '@/api/base44Client';

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

  // Fetch outstanding charges when modal opens
  useEffect(() => {
    const fetchOutstandingCharges = async () => {
      if (!customer || !open) return;

      try {
        const [paymentsRes, adjustmentsRes, workOrdersRes] = await Promise.all([
          base44.functions.invoke('supabaseCustomerPayments', { action: 'filter', match: { customer_id: customer.id } }),
          base44.functions.invoke('supabaseCustomerARAdjustment', { action: 'filter', match: { customer_id: customer.id } }),
          base44.functions.invoke('supabaseWorkOrder', { action: 'filter', match: { customer_id: customer.id } })
        ]);
        const allPayments = paymentsRes?.data?.data || [];
        const allAdjustments = adjustmentsRes?.data?.data || [];
        const allWorkOrders = workOrdersRes?.data?.data || [];
        const workOrderMap = new Map();

        allWorkOrders.forEach((workOrder) => {
          if (!workOrder) return;
          [workOrder.id, workOrder.inv_number, workOrder.ro_number, workOrder.wo_number, workOrder.est_number, workOrder.crinv_number]
            .filter(Boolean)
            .forEach((key) => {
              if (!workOrderMap.has(key)) {
                workOrderMap.set(key, workOrder);
              }
            });
        });

        const charges = [];

        // Add on_account charges (invoices)
        allPayments
          .filter(p => p.payment_method === 'on_account')
          .forEach(payment => {
            const balance = (payment.amount || 0) - (payment.ar_paid || 0);
            if (balance > 0.01) {
              const workOrder = workOrderMap.get(payment.work_order_id) || workOrderMap.get(payment.invoice_number) || null;
              charges.push({
                id: payment.id,
                type: 'invoice',
                reference: workOrder?.inv_number || payment.invoice_number || getWorkOrderLookupNumber(workOrder) || '',
                date: payment.payment_date,
                amount: payment.amount || 0,
                ar_paid: payment.ar_paid || 0,
                balance: balance
              });
            }
          });

        // Add adjustments (charges and credits)
        allAdjustments
          .forEach(adj => {
            const balance = adj.amount - (adj.ar_paid || 0);
            // Check if there is an outstanding balance (positive or negative)
            if (Math.abs(balance) > 0.01) {
              charges.push({
                id: adj.id,
                type: 'adjustment',
                reference: adj.reference || adj.description || '',
                date: adj.adjustment_date,
                amount: adj.amount,
                ar_paid: adj.ar_paid || 0,
                balance: balance
              });
            }
          });

        // Sort by date (oldest first)
        charges.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setOutstandingCharges(charges);
      } catch (error) {
        console.error('Error fetching outstanding charges:', error);
        alert('Failed to load outstanding charges');
      }
    };

    fetchOutstandingCharges();
  }, [customer, open]);

  const totalSelectedAmount = useMemo(() => {
    return outstandingCharges
      .filter(charge => selectedCharges[charge.id])
      .reduce((total, charge) => total + charge.balance, 0);
  }, [selectedCharges, outstandingCharges]);

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

  const handleProceedToPaymentDetails = () => {
    const paymentAmount = activeTab === 'pay_invoices' ? totalSelectedAmount : parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }
    setShowPaymentDetailsDialog(true);
  };

  const creditCardFeeAmount = useMemo(() => {
    const paymentAmount = activeTab === 'pay_invoices' ? totalSelectedAmount : (parseFloat(amount) || 0);
    return paymentMethod === 'credit_card' ? paymentAmount * 0.03 : 0;
  }, [activeTab, totalSelectedAmount, amount, paymentMethod]);

  const handleSubmit = async () => {
    const paymentAmount = activeTab === 'pay_invoices' ? totalSelectedAmount : parseFloat(amount);

    setLoading(true);
    try {
      const response = await base44.functions.invoke('processCustomerARAccounting', {
        action: 'create_payment',
        customer_id: customer.id,
        payment_date: format(paymentDate, 'yyyy-MM-dd'),
        payment_amount: paymentAmount,
        payment_method: paymentMethod,
        reference,
        apply_mode: activeTab === 'pay_invoices' ? 'selected' : 'oldest',
        selected_charge_ids: Object.keys(selectedCharges),
        credit_card_fee_amount: creditCardFeeAmount
      });

      const updatedPaymentRecord = response.data?.payment;

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
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50' : (index % 2 === 1 ? 'bg-slate-50' : '')} hover:bg-blue-100`}
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
                        <TableCell>{format(new Date(charge.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{differenceInDays(new Date(), new Date(charge.date))} days</TableCell>
                        <TableCell className="text-right">${charge.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={6} className="text-center h-24">No outstanding charges.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
              <span className="font-semibold">Selected Amount:</span>
              <span className="text-xl font-bold">${totalSelectedAmount.toFixed(2)}</span>
            </div>
          </TabsContent>
          
          <TabsContent value="pay_oldest" className="py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount</Label>
              <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button 
            onClick={handleProceedToPaymentDetails} 
            disabled={(activeTab === 'pay_invoices' && totalSelectedAmount === 0) || (activeTab === 'pay_oldest' && (!amount || parseFloat(amount) <= 0))}
          >
            Next: Payment Details (${(activeTab === 'pay_invoices' ? totalSelectedAmount : (parseFloat(amount) || 0)).toFixed(2)})
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showPaymentDetailsDialog} onOpenChange={(open) => { if (!open) setShowPaymentDetailsDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Payment Amount:</p>
              <p className="text-xl font-bold">
                ${(activeTab === 'pay_invoices' ? totalSelectedAmount : (parseFloat(amount) || 0)).toFixed(2)}
              </p>
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-amber-800">Credit Card Fee (3%):</p>
                  <p className="text-lg font-bold text-amber-800">
                    ${creditCardFeeAmount.toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-amber-200">
                  <p className="text-sm font-semibold text-amber-900">Total to Charge:</p>
                  <p className="text-lg font-bold text-amber-900">
                    ${((activeTab === 'pay_invoices' ? totalSelectedAmount : (parseFloat(amount) || 0)) + creditCardFeeAmount).toFixed(2)}
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
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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