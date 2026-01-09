import React, { useState, useEffect, useMemo } from 'react';
import { LinesOfCreditTransaction, BankAccount, LinesOfCredit } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { checkEntityLock } from '../utils/mountainTimeUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarIcon, DollarSign, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

export default function LineOfCreditPaymentModal({ open, onClose, lineOfCredit, onPaymentMade, currentUser }) {
  const [paymentData, setPaymentData] = useState({
    payment_method: 'bank_account',
    from_account_id: '',
    payment_date: new Date(),
  });
  const [amount, setAmount] = useState('');
  const [activeTab, setActiveTab] = useState('pay_charges'); // Changed initial activeTab
  const [bankAccounts, setBankAccounts] = useState([]);
  const [otherLinesOfCredit, setOtherLinesOfCredit] = useState([]);
  const [outstandingCharges, setOutstandingCharges] = useState([]);
  const [selectedCharges, setSelectedCharges] = useState({});
  const [showPaymentDetailsDialog, setShowPaymentDetailsDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (open && lineOfCredit && currentUser) {
        try {
          // Always fetch the latest account data to check lock status
          const account = await LinesOfCredit.get(lineOfCredit.id);
          const lockStatus = checkEntityLock(account, currentUser.email);

          if (lockStatus.isLocked) {
            setIsLocked(true);
            setLockMessage(`This account is currently locked by ${lockStatus.lockedByUser}. Please try again later.`);
            return;
          }

          // Acquire lock
          await LinesOfCredit.update(lineOfCredit.id, {
            locked_by_user: currentUser.email,
            locked_timestamp: new Date().toISOString()
          });
          
          setLockAcquired(true);
          setIsLocked(false);
          setLockMessage('');

          // Reset state when opening
          setPaymentData({ payment_method: 'bank_account', from_account_id: '', payment_date: new Date() });
          setAmount('');
          setActiveTab('pay_charges');
          setSelectedCharges({});
          setShowPaymentDetailsDialog(false);

          const [bankAccountsData, otherLOCData, transactionsData] = await Promise.all([
            BankAccount.list(),
            LinesOfCredit.filter({ is_active: true }),
            LinesOfCreditTransaction.filter({ line_of_credit_id: lineOfCredit.id })
          ]);

          setBankAccounts(bankAccountsData);
          
          // Set primary account as default if available
          const primaryAccount = bankAccountsData.find(acc => acc.primary);
          if (primaryAccount) {
            setPaymentData(prev => ({ ...prev, from_account_id: primaryAccount.id }));
          }

          // Filter out the current line of credit from other options
          setOtherLinesOfCredit(otherLOCData.filter(loc => loc.id !== lineOfCredit.id));

          // Group transactions that represent "charges" (positive amounts that need payment)
          // Filter out fully paid charges (where payment_amount >= charge_amount)
          // Also exclude payment_made records themselves
          const charges = transactionsData
            .filter(tx => 
              tx.charge_amount > 0 && 
              tx.source_type !== 'payment_made' && 
              (tx.payment_amount || 0) < tx.charge_amount
            )
            .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

          setOutstandingCharges(charges);
          
        } catch (error) {
          console.error('Error loading payment modal data:', error);
        }
      }
    };
    loadData();
  }, [open, lineOfCredit, currentUser]);

  // Release lock on close
  useEffect(() => {
    return () => {
      if (!open && lockAcquired && currentUser && lineOfCredit) {
        // Release lock when modal closes
        LinesOfCredit.update(lineOfCredit.id, {
          locked_by_user: null,
          locked_timestamp: null
        }).catch(error => {
          console.error('Error releasing lock:', error);
        });
        setLockAcquired(false);
      }
    };
  }, [open, lockAcquired, currentUser, lineOfCredit]);

  const handleClose = () => {
    // Release lock before closing
    if (lockAcquired && currentUser && lineOfCredit) {
      LinesOfCredit.update(lineOfCredit.id, {
        locked_by_user: null,
        locked_timestamp: null
      }).catch(error => {
        console.error('Error releasing lock on close:', error);
      });
      setLockAcquired(false);
    }
    onClose();
  };

  const totalSelectedAmount = useMemo(() => {
    return outstandingCharges
      .filter(charge => selectedCharges[charge.id])
      .reduce((total, charge) => total + charge.charge_amount, 0);
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
    const paymentAmount = activeTab === 'pay_charges' ? totalSelectedAmount : parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter or select a valid payment amount.');
      return;
    }

    setShowPaymentDetailsDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const paymentAmount = activeTab === 'pay_charges' ? totalSelectedAmount : parseFloat(amount);

    if (!paymentData.from_account_id) {
      alert('Please select an account to pay from.');
      return;
    }

    setIsProcessing(true);
    try {
      // Prepare applied charges list if paying specific charges
      let appliedCharges = [];
      if (activeTab === 'pay_charges') {
        appliedCharges = outstandingCharges
          .filter(charge => selectedCharges[charge.id])
          .map(charge => ({
            id: charge.id,
            amount: charge.charge_amount - (charge.payment_amount || 0) // Pay the remaining balance
          }));
      }

      const response = await base44.functions.invoke('processLineOfCreditPayment', {
        line_of_credit_id: lineOfCredit.id,
        payment_date: format(paymentData.payment_date, 'yyyy-MM-dd'),
        payment_amount: paymentAmount,
        payment_method: paymentData.payment_method,
        from_account_id: paymentData.from_account_id,
        applied_charges: appliedCharges
      });

      if (response.data && response.data.success) {
        setShowPaymentDetailsDialog(false);
        onPaymentMade();
        onClose();
      } else {
        const errorMessage = response.data?.error || 'Failed to process payment';
        alert(errorMessage);
        console.error('Payment failed:', response.data);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert(error.message || 'Failed to process payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getFromAccountOptions = () => {
    switch (paymentData.payment_method) {
      case 'bank_account':
      case 'cheque':
        return bankAccounts.map(account => ({ 
          value: account.id, 
          label: `${account.name} - ${account.bank_name || 'Bank'}` 
        }));
      case 'other_line_of_credit':
        return otherLinesOfCredit.map(loc => ({ 
          value: loc.id, 
          label: `${loc.name} - Available: $${(loc.available_credit || 0).toFixed(2)}` 
        }));
      default:
        return [];
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make Payment - {lineOfCredit?.name}</DialogTitle>
          <DialogDescription>
            Current Balance: ${(lineOfCredit?.current_balance || 0).toFixed(2)} | 
            Available Credit: ${(lineOfCredit?.available_credit || 0).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {isLocked ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lockMessage}</AlertDescription>
          </Alert>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pay_charges">Pay Specific Charges</TabsTrigger>
              <TabsTrigger value="pay_balance">Pay Amount</TabsTrigger>
            </TabsList>

            <TabsContent value="pay_charges" className="py-4 space-y-4">
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Days Old</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
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
                          <TableCell>{format(parseISO(charge.transaction_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>{charge.description}</TableCell>
                          <TableCell>{differenceInDays(new Date(), parseISO(charge.transaction_date))} days</TableCell>
                          <TableCell className="text-right">${charge.charge_amount.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24">No outstanding charges.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                <span className="font-semibold">Selected Amount:</span>
                <span className="text-xl font-bold">${totalSelectedAmount.toFixed(2)}</span>
              </div>
            </TabsContent>

            <TabsContent value="pay_balance" className="py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Payment Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder={`Current balance: $${(lineOfCredit?.current_balance || 0).toFixed(2)}`}
                  required
                />
              </div>
            </TabsContent>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={handleProceedToPaymentDetails} 
                disabled={(activeTab === 'pay_charges' && totalSelectedAmount === 0) || (activeTab === 'pay_balance' && (!amount || parseFloat(amount) <= 0))}
              >
                Next: Payment Details (${(activeTab === 'pay_charges' ? totalSelectedAmount : (parseFloat(amount) || 0)).toFixed(2)})
              </Button>
            </DialogFooter>
          </Tabs>
        )}
      </DialogContent>

      <Dialog open={showPaymentDetailsDialog} onOpenChange={(open) => { if (!open) setShowPaymentDetailsDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Payment Amount:</p>
              <p className="text-xl font-bold">${(activeTab === 'pay_charges' ? totalSelectedAmount : (parseFloat(amount) || 0)).toFixed(2)}</p>
            </div>

            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentData.payment_date ? format(paymentData.payment_date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar 
                    mode="single" 
                    selected={paymentData.payment_date} 
                    onSelect={(d) => setPaymentData(prev => ({ ...prev, payment_date: d }))} 
                    initialFocus 
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'bank_account', label: 'Bank Account' },
                  { value: 'cheque', label: 'Cheque' },
                  { value: 'other_line_of_credit', label: 'Other LOC' }
                ].map(method => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentData(prev => ({ ...prev, payment_method: method.value, from_account_id: '' }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      paymentData.payment_method === method.value
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
              <Label>From Account</Label>
              <Select 
                value={paymentData.from_account_id} 
                onValueChange={(value) => setPaymentData(prev => ({ ...prev, from_account_id: value }))}
              >
                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {getFromAccountOptions().length > 0 ? (
                    getFromAccountOptions().map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))
                  ) : (
                    <p className="p-2 text-sm text-gray-500">No accounts available</p>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowPaymentDetailsDialog(false)} disabled={isProcessing}>
                Back
              </Button>
              <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700" disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4 mr-2" />
                )}
                {isProcessing ? 'Processing...' : 'Process Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}