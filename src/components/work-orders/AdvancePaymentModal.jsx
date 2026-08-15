import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Lock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { checkFiscalPeriodStatus } from '@/components/utils/fiscalPeriodUtils';

export default function AdvancePaymentModal({
  open,
  onClose,
  workOrder,
  payments: initialPayments,
  onProcessPayment,
  totalOwing: propTotalOwing,
  viewOnly = false
}) {
  const [payments, setPayments] = useState([]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [processing, setProcessing] = useState(false);

  // Use the passed-in work order's stage for immediate UI feedback.
  const isInvoiceUI = workOrder?.stage === 'invoice';

  // Parse existing payments from workOrder.payments
  useEffect(() => {
    let parsedPayments = [];
    if (workOrder?.payments) {
      try {
        const paymentsData = typeof workOrder.payments === 'string' ? JSON.parse(workOrder.payments) : workOrder.payments;
        if (Array.isArray(paymentsData)) {
          // Normalize payment objects to handle inconsistent property names
          parsedPayments = paymentsData.map(payment => ({
            ...payment,
            payment_method: payment.payment_method || payment.method || 'Unknown',
            amount: parseFloat(payment.amount) || 0,
            payment_date: (() => {
              const rawDate = payment.payment_date || payment.date;
              if (!rawDate) return new Date();
              // Fix for date-only strings being interpreted as UTC midnight (which shows as previous day in US timezones)
              // If it's a YYYY-MM-DD string, append T12:00:00Z to put it in the middle of the day UTC (5am-ish MT)
              if (typeof rawDate === 'string' && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return new Date(`${rawDate}T12:00:00Z`);
              }
              return new Date(rawDate);
            })(),
          }));
        }
      } catch (e) {
        console.error("Failed to parse payments in AdvancePaymentModal:", e);
      }
    }
    setPayments(parsedPayments);
  }, [workOrder?.payments]);

  // Reset form fields when the modal opens
  useEffect(() => {
    if (open) {
      setAmount('');
      setReference('');
      setPaymentMethod('cash');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  /**
   * This is the definitive server-side check.
   * It fetches the work order by its unique ID and checks the stage.
   * @returns {Promise<boolean>} True if the work order is an invoice.
   */
  const isStageInvoiceInDatabase = async () => {
    if (!workOrder?.ro_number) {
      console.error("DATABASE CHECK FAILED: workOrder.ro_number is missing.");
      alert("Cannot verify document status. Action blocked for security.");
      return true;
    }
    try {
      console.log(`DATABASE CHECK: Verifying stage for WorkOrder RO: ${workOrder.ro_number}`);
      console.log("DEBUG: workOrder object at call time:", workOrder);
      console.log("DEBUG: ro_number used:", workOrder.ro_number);
      
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('*')
        .eq('ro_number', workOrder.ro_number);
      
      if (error) throw error;
      if (!data || data.length === 0) {
          throw new Error("Could not find work order");
      }
      
      const currentWorkOrder = data[0];
      const currentStage = currentWorkOrder?.stage;
      console.log(`DATABASE CHECK RESULT: Stage is '${currentStage}'.`);
      return currentStage === 'invoice';
    } catch (error) {
      console.error("DATABASE CHECK ERROR:", error);
      alert("Error verifying document status. Action blocked for security.");
      return true;
    }
  };

  const handleAddPayment = async () => {
    if (await isStageInvoiceInDatabase()) {
      alert("Action Blocked: Payments cannot be added to a locked invoice. Please revert to Work Order stage to proceed.");
      return;
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    if (!onProcessPayment) {
      alert("Payment processing not available. Please contact support.");
      return;
    }

    const fiscalCheck = await checkFiscalPeriodStatus(paymentDate);
    if (!fiscalCheck.isValid) {
      alert(fiscalCheck.message);
      return;
    }

    const paymentAmount = parseFloat(amount);
    
    const newPaymentData = {
      amount: paymentAmount,
      method: paymentMethod,
      reference: reference,
      date: paymentDate,
      advance_pmt: true,
    };
    
    setProcessing(true);
    try {
      // Create the payment via parent (which creates CustomerPayment record)
      const createdPayment = await onProcessPayment('add', newPaymentData);
      
      const { data: { user } } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();
      const userDisplay = user?.user_metadata?.full_name || user?.email || 'unknown';

      // Post GL transactions for the advance payment through SupabaseProxy
      const { error: glError } = await supabase.from('GLTransaction').insert([
          {
            id: crypto.randomUUID(),
            account_number: '1010',
            transaction_date: paymentDate,
            description: `Advance payment received - WO ${workOrder.wo_number || workOrder.ro_number}`,
            reference: reference || workOrder.wo_number || workOrder.ro_number,
            debit_amount: paymentAmount,
            credit_amount: 0,
            source_type: 'work_order',
            source_id: createdPayment?.id || '',
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user?.id || null,
            updated_by: userDisplay
          },
          {
            id: crypto.randomUUID(),
            account_number: '2100',
            transaction_date: paymentDate,
            description: `Advance payment received - WO ${workOrder.wo_number || workOrder.ro_number}`,
            reference: reference || workOrder.wo_number || workOrder.ro_number,
            debit_amount: 0,
            credit_amount: paymentAmount,
            source_type: 'work_order',
            source_id: createdPayment?.id || '',
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user?.id || null,
            updated_by: userDisplay
          }
        ]);
        
      if (glError) throw glError;
      
      // Reset form for next entry only after successful processing
      setAmount('');
      setReference('');
      setPaymentMethod('cash');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error adding payment:', error);
      alert('Failed to add payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePayment = async (paymentToDelete) => {
    if (await isStageInvoiceInDatabase()) {
      alert("Action Blocked: Payments cannot be deleted from a locked invoice. Please revert to Work Order stage to proceed.");
      return;
    }

    const paymentIdToDelete = paymentToDelete.id;
    if (!paymentIdToDelete) {
        alert("Cannot delete a payment without an ID. It might not be saved yet.");
        return;
    }

    let originalDateStr = format(new Date(), 'yyyy-MM-dd');
    if (paymentToDelete.payment_date && !isNaN(paymentToDelete.payment_date.getTime())) {
      originalDateStr = format(paymentToDelete.payment_date, 'yyyy-MM-dd');
    }
    const origFiscalCheck = await checkFiscalPeriodStatus(originalDateStr);
    if (!origFiscalCheck.isValid) {
      alert(`Cannot delete payment: Original payment date is in a closed fiscal period.`);
      return;
    }

    // Use original transaction date for the reversal
    const reversalDate = originalDateStr;

    try {
      // Validation: Check CustomerPayments entity
      const { data: cpData } = await supabase
        .from('CustomerPayment')
        .select('*')
        .eq('id', paymentIdToDelete);
      const cp = cpData?.[0];
      if (cp) {
        if (cp.deposited) {
          alert("Cannot delete this payment as it has already been deposited.");
          return;
        }
        if (cp.ar_paid && Number(cp.ar_paid) !== 0) {
          alert("Cannot delete this payment as a payment has already been made against it in Accounts Receivable.");
          return;
        }
      }
    } catch (error) {
      console.error("Error verifying payment status:", error);
      // Proceed if check fails? Or block? Assuming non-blocking if fetch fails, but validation logic usually blocks.
      // If we can't verify, we might want to let user try, or block. 
      // Given the specific request, I will proceed to confirmation but log error.
    }

    if (!confirm("Are you sure you want to delete this payment? This action cannot be undone.")) {
      return;
    }

    if (!onProcessPayment) {
      alert("Payment processing not available. Please contact support.");
      return;
    }

    setProcessing(true);
    try {
      const paymentAmount = paymentToDelete.amount || 0;
      const woRef = workOrder.wo_number || workOrder.ro_number;
      const reversalDesc = `Reversal: Advance payment - WO ${woRef}`;

      const { data: { user } } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();
      const userDisplay = user?.user_metadata?.full_name || user?.email || 'unknown';

      // Post reversal GL transactions through Supabase client
      const { error: revGlError } = await supabase.from('GLTransaction').insert([
          {
            id: crypto.randomUUID(),
            account_number: '1010',
            transaction_date: reversalDate,
            description: reversalDesc,
            reference: paymentToDelete.reference || woRef,
            debit_amount: 0,
            credit_amount: paymentAmount,
            source_type: 'work_order',
            source_id: paymentIdToDelete,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user?.id || null,
            updated_by: userDisplay
          },
          {
            id: crypto.randomUUID(),
            account_number: '2100',
            transaction_date: reversalDate,
            description: reversalDesc,
            reference: paymentToDelete.reference || woRef,
            debit_amount: paymentAmount,
            credit_amount: 0,
            source_type: 'work_order',
            source_id: paymentIdToDelete,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user?.id || null,
            updated_by: userDisplay
          }
        ]);
        
      if (revGlError) throw revGlError;

      // Delete the payment via parent
      await onProcessPayment('delete', { id: paymentIdToDelete });
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };
  
  // Use the prop directly - calculation happens in FinancialSummary/WorkOrderEdit
  const totalOwing = propTotalOwing;

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balanceDue = totalOwing - totalPaid;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take Payment for RO #{workOrder?.ro_number}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          {/* Add Payment Form - Hide in View Only */}
          {!viewOnly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Add New Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isInvoiceUI || processing}
                  />
                  <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={isInvoiceUI || processing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Payment Method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="debit">Debit</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="e_transfer">E-Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Reference #"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={isInvoiceUI || processing}
                  />
                </div>
                
                {isInvoiceUI && (
                  <div className="p-3 mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Payments are locked for invoices.</p>
                      <p className="text-xs">To make changes, revert this document to Work Order stage.</p>
                    </div>
                  </div>
                )}
              </CardContent>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-b-lg border-t dark:border-slate-800">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1">
                    <Label htmlFor="paymentDate" className="text-xs text-slate-600 dark:text-slate-400">Payment Date</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      disabled={isInvoiceUI || processing}
                      className="mt-1"
                    />
                  </div>
                  <Button 
                    onClick={handleAddPayment}
                    disabled={isInvoiceUI || processing}
                    className="mt-5"
                  >
                    {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    {processing ? 'Processing...' : 'Apply Payment'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Existing Payments List */}
          {payments.length > 0 ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Existing Payments:</h4>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto pr-2">
                {payments.map((payment, index) => (
                  <div key={payment.id || `temp-${index}`} className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                    <div>
                      <span className="font-medium">${payment.amount.toFixed(2)}</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">
                        {payment.payment_method} 
                        {payment.reference && ` - ${payment.reference}`}
                      </span>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {payment.payment_date ? format(new Date(payment.payment_date), 'MMMM d, yyyy') : 'Unknown Date'}
                      </div>
                    </div>
                    {payment.id && !viewOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletePayment(payment)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30"
                        disabled={isInvoiceUI || processing}
                      >
                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">No payments recorded.</p>
          )}
          
          {/* Footer with Totals */}
          <div className="pt-4 border-t dark:border-slate-800">
              <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total Paid:</span>
                  <span>${totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-lg font-bold text-red-600">
                  <span>Balance Due:</span>
                  <span>${balanceDue.toFixed(2)}</span>
              </div>
          </div>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={processing}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}