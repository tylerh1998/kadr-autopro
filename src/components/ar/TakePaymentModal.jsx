import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, DollarSign } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { CustomerPayments, CustomerARAdjustment, GLTransaction } from '@/entities/all';

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
        const [allPayments, allAdjustments] = await Promise.all([
          CustomerPayments.filter({ customer_id: customer.id }),
          CustomerARAdjustment.filter({ customer_id: customer.id })
        ]);

        const charges = [];

        // Add on_account charges (invoices)
        allPayments
          .filter(p => p.payment_method === 'on_account')
          .forEach(payment => {
            const balance = (payment.amount || 0) - (payment.ar_paid || 0);
            if (balance > 0.01) {
              charges.push({
                id: payment.id,
                type: 'invoice',
                reference: payment.invoice_number || '',
                date: payment.payment_date,
                amount: payment.amount || 0,
                ar_paid: payment.ar_paid || 0,
                balance: balance
              });
            }
          });

        // Add positive adjustments (charges)
        allAdjustments
          .filter(adj => adj.amount > 0)
          .forEach(adj => {
            const balance = adj.amount - (adj.ar_paid || 0);
            if (balance > 0.01) {
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
    const totalAmountWithFee = paymentAmount + creditCardFeeAmount;

    setLoading(true);
    try {
      const applyToEntries = [];

      // Step 1: If credit card fee exists, create a CustomerARAdjustment and GL entries for it
      if (creditCardFeeAmount > 0) {
        const feeReference = `CCFEE-${format(paymentDate, 'yyyyMMdd')}-${Date.now()}`;
        
        // Create the AR adjustment for the credit card fee
        const feeAdjustment = await CustomerARAdjustment.create({
          customer_id: customer.id,
          adjustment_date: format(paymentDate, 'yyyy-MM-dd'),
          amount: creditCardFeeAmount,
          gl_account: '4009',
          description: 'Credit Card Processing Fee (3%)',
          reference: feeReference,
          ar_paid: creditCardFeeAmount // Immediately paid by this payment
        });

        // Create GL entries: Debit 1100 (AR), Credit 4009 (CC Fees Collected)
        await GLTransaction.create({
          transaction_date: format(paymentDate, 'yyyy-MM-dd'),
          account_number: '1100',
          description: `Credit Card Fee - ${customer.first_name} ${customer.last_name}`,
          debit_amount: creditCardFeeAmount,
          credit_amount: 0,
          reference: feeReference,
          source_type: 'customer_ar_adjustment',
          source_id: feeAdjustment.id
        });

        await GLTransaction.create({
          transaction_date: format(paymentDate, 'yyyy-MM-dd'),
          account_number: '4009',
          description: `Credit Card Fee - ${customer.first_name} ${customer.last_name}`,
          debit_amount: 0,
          credit_amount: creditCardFeeAmount,
          reference: feeReference,
          source_type: 'customer_ar_adjustment',
          source_id: feeAdjustment.id
        });

        // Add fee adjustment to ar_applyto
        applyToEntries.push(`${feeAdjustment.id}:${creditCardFeeAmount.toFixed(2)}`);
        
        console.log('Created CC fee adjustment:', feeAdjustment.id, 'Amount:', creditCardFeeAmount);
      }

      // Step 2: Create the CustomerPayments record
      const newPaymentRecord = await CustomerPayments.create({
        customer_id: customer.id,
        amount: totalAmountWithFee,
        payment_method: paymentMethod,
        payment_date: format(paymentDate, 'yyyy-MM-dd'),
        reference: reference,
        notes: `AR Payment for ${customer.first_name} ${customer.last_name}${creditCardFeeAmount > 0 ? ` (includes $${creditCardFeeAmount.toFixed(2)} CC fee)` : ''}`,
        ar_pmt: true,
        ar_applyto: '' // Will be updated after applying to charges
      });

      console.log('Created payment record:', newPaymentRecord);

      // Step 2b: Create GL entries for the payment (Debit 1010 Cash Drawer, Credit 1100 AR)
      const paymentReference = `ARPMT-${newPaymentRecord.id}`;
      
      // Debit 1010 (Cash Drawer) - money received
      await GLTransaction.create({
        transaction_date: format(paymentDate, 'yyyy-MM-dd'),
        account_number: '1010',
        description: `AR Payment - ${customer.first_name} ${customer.last_name}`,
        debit_amount: totalAmountWithFee,
        credit_amount: 0,
        reference: paymentReference,
        source_type: 'customer_payment',
        source_id: newPaymentRecord.id
      });

      // Credit 1100 (Accounts Receivable) - reduce AR balance
      await GLTransaction.create({
        transaction_date: format(paymentDate, 'yyyy-MM-dd'),
        account_number: '1100',
        description: `AR Payment - ${customer.first_name} ${customer.last_name}`,
        debit_amount: 0,
        credit_amount: totalAmountWithFee,
        reference: paymentReference,
        source_type: 'customer_payment',
        source_id: newPaymentRecord.id
      });

      console.log('Created GL entries for payment:', paymentReference);

      // Step 3: Determine which charges to apply payment to
      let chargesToPay = [];
      
      if (activeTab === 'pay_invoices') {
        // User selected specific charges
        chargesToPay = outstandingCharges.filter(charge => selectedCharges[charge.id]);
      } else {
        // Apply to oldest charges first
        let remainingAmount = paymentAmount;
        for (const charge of outstandingCharges) {
          if (remainingAmount <= 0) break;
          
          const amountToApply = Math.min(remainingAmount, charge.balance);
          chargesToPay.push({ ...charge, amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      // Step 4: Apply payment to each charge and build ar_applyto string
      for (const charge of chargesToPay) {
        const amountToApply = activeTab === 'pay_invoices' ? charge.balance : (charge.amountToApply || charge.balance);
        const newArPaid = (charge.ar_paid || 0) + amountToApply;

        // Update the charge's ar_paid field
        if (charge.type === 'invoice') {
          await CustomerPayments.update(charge.id, {
            ar_paid: newArPaid
          });
        } else if (charge.type === 'adjustment') {
          await CustomerARAdjustment.update(charge.id, {
            ar_paid: newArPaid
          });
        }

        // Add to ar_applyto string
        applyToEntries.push(`${charge.id}:${amountToApply.toFixed(2)}`);
        
        console.log(`Applied $${amountToApply.toFixed(2)} to ${charge.type} ${charge.id}, new ar_paid: ${newArPaid}`);
      }

      // Step 5: Update the payment record with ar_applyto
      const arApplyToString = applyToEntries.join(',');
      await CustomerPayments.update(newPaymentRecord.id, {
        ar_applyto: arApplyToString
      });

      console.log('Payment application complete. ar_applyto:', arApplyToString);

      // Call the parent callback to refresh data
      if (onTakePayment) {
        await onTakePayment();
      }

      // Reset form state
      setSelectedCharges({});
      setAmount('');
      setPaymentDate(new Date());
      setPaymentMethod('cash');
      setReference('');
      setShowPaymentDetailsDialog(false);
      
      // Fetch the updated payment record with ar_applyto populated
      const updatedPaymentRecord = await CustomerPayments.get(newPaymentRecord.id);
      
      // Close modal and notify parent to open payment details
      onClose();
      
      if (onPaymentComplete) {
        onPaymentComplete(updatedPaymentRecord);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      // More detailed error message
      const errorMessage = error.message || error.toString();
      alert(`Failed to process payment: ${errorMessage}\n\nPlease check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take Payment for {customer?.first_name} {customer?.last_name}</DialogTitle>
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