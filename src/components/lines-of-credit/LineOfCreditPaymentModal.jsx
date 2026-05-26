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
import { Calendar as CalendarIcon, DollarSign, Loader2, Upload } from 'lucide-react';
import { format, parseISO, differenceInDays, parse, isValid, endOfMonth } from 'date-fns';
import AddToSheetModal from '../suppliers/AddToSheetModal';

const SERVUS_ID = '68cbcdf3f171308eee277c73';
const ATB_ID = '695c358b0d127adfb929951e';

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
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);
  const [showAddToSheetModal, setShowAddToSheetModal] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      processCSV(text);
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    event.target.value = '';
  };

  const processCSV = (text) => {
    const lines = text.split('\n');
    const clean = (str) => str ? str.replace(/^"|"$/g, '').trim() : '';
    const csvAmounts = [];

    // Specific parsing for Servus and ATB
    if (lineOfCredit?.id === SERVUS_ID || lineOfCredit?.id === ATB_ID) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // SERVUS Parsing
        if (lineOfCredit?.id === SERVUS_ID) {
            // Skip header if it exists
            if (i === 0 && line.toLowerCase().includes('card number')) continue;

            const parts = line.split(';');
            if (parts.length >= 5) {
                const amountStr = clean(parts[4]);
                // Parse Amount: "$66.58"
                const amountClean = amountStr.replace(/[$,]/g, '');
                const amount = parseFloat(amountClean);

                if (!isNaN(amount) && amount !== 0) {
                    csvAmounts.push(Math.abs(amount));
                }
            }
        }
        // ATB Parsing
        else if (lineOfCredit?.id === ATB_ID) {
            // Skip header
            if (i === 0) continue; 
            const parts = line.split(','); 
            
            // Indices: 0=Date, 5=Debit, 6=Credit, 7=Extended Text
            if (parts.length >= 8) {
                const debitStr = clean(parts[5]);
                const creditStr = clean(parts[6]);

                let amount = 0;
                if (debitStr && parseFloat(debitStr) !== 0) {
                    amount = parseFloat(debitStr); 
                } else if (creditStr && parseFloat(creditStr) !== 0) {
                    amount = parseFloat(creditStr); 
                }

                if (!isNaN(amount) && amount !== 0) {
                    csvAmounts.push(Math.abs(amount));
                }
            }
        }
      }
    } else {
      // Fallback Generic Parsing (similar to what we had, or simplified)
      const parseCSVLine = (line) => {
        const result = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { result.push(cell); cell = ''; }
          else cell += char;
        }
        result.push(cell);
        return result;
      };

      const rows = lines;
      if (rows.length < 2) {
        alert("CSV file seems empty or invalid.");
        return;
      }
      
      const headerRow = rows[0];
      const headers = parseCSVLine(headerRow).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
      
      // Try to find amount columns
      const debitIdx = headers.indexOf('debitamount');
      const creditIdx = headers.indexOf('creditamount');
      let amountIdx = -1;
      if (debitIdx === -1 && creditIdx === -1) {
        amountIdx = headers.findIndex(h => h === 'amount' || h.includes('amount') || h === 'debit' || h === 'credit');
      }

      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue;
        const cols = parseCSVLine(rows[i]);
        const parseAmount = (str) => {
          if (!str) return 0;
          const clean = str.replace(/[$,\s"]/g, '');
          const float = parseFloat(clean);
          return isNaN(float) ? 0 : float;
        };

        let amount = 0;
        if (debitIdx !== -1 || creditIdx !== -1) {
          const debit = debitIdx !== -1 && cols[debitIdx] ? parseAmount(cols[debitIdx]) : 0;
          const credit = creditIdx !== -1 && cols[creditIdx] ? parseAmount(cols[creditIdx]) : 0;
          amount = Math.max(Math.abs(debit), Math.abs(credit));
        } else if (amountIdx !== -1 && cols[amountIdx]) {
          amount = Math.abs(parseAmount(cols[amountIdx]));
        }

        if (amount > 0) csvAmounts.push(amount);
      }
    }

    if (csvAmounts.length === 0) {
      alert("No valid amounts found in the CSV.");
      return;
    }

    const newSelected = {};
    const matchedIndices = new Set();
    let matchCount = 0;

    if (activeTab !== 'pay_charges') {
      setActiveTab('pay_charges');
    }

    csvAmounts.forEach(amt => {
      const idx = outstandingCharges.findIndex((charge, index) => {
        if (matchedIndices.has(index)) return false;
        
        let remaining = 0;
        if (charge.charge_amount > 0) {
           remaining = charge.charge_amount - (charge.payment_amount || 0);
        } else if (charge.credit_amount > 0) {
           remaining = charge.credit_amount + (charge.payment_amount || 0);
        }
        
        return Math.abs(remaining - amt) < 0.01;
      });

      if (idx !== -1) {
        newSelected[outstandingCharges[idx].id] = true;
        matchedIndices.add(idx);
        matchCount++;
      }
    });

    if (matchCount > 0) {
      setSelectedCharges(newSelected);
      alert(`Matched and selected ${matchCount} items based on the uploaded CSV.`);
    } else {
      alert("No matching charges found for the amounts in the CSV. Checked " + csvAmounts.length + " transactions.");
    }
  };

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
          setCalculating(false);
          setCalculationResult(null);

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

          // Group transactions that represent "charges" and "credits"
          // Filter out fully paid charges and fully applied credits
          // Also exclude payment_made records themselves
          const charges = transactionsData
            .filter(tx => {
              if (tx.source_type === 'payment_made') return false;
              if (tx.is_reversed) return false;

              if (tx.charge_amount > 0) {
                // Outstanding Charge: payment_amount (paid so far) < charge_amount
                return (tx.payment_amount || 0) < tx.charge_amount;
              } else if (tx.credit_amount > 0) {
                // Outstanding Credit: payment_amount (applied so far, stored as negative) > -credit_amount
                // Example: Credit 100. Applied -100. payment_amount = -100. -100 > -100 is False (fully applied).
                return (tx.payment_amount || 0) > -tx.credit_amount;
              }
              return false;
            })
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
      .reduce((total, charge) => {
        if (charge.charge_amount > 0) {
          // Add remaining charge amount
          const remainingCharge = charge.charge_amount - (charge.payment_amount || 0);
          return total + remainingCharge;
        } else if (charge.credit_amount > 0) {
          // Subtract remaining credit amount (stored as negative addition to payment)
          const remainingCredit = charge.credit_amount + (charge.payment_amount || 0);
          return total - remainingCredit;
        }
        return total;
      }, 0);
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

  const handleCalculatePayment = async () => {
    const paymentAmount = parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    setCalculating(true);
    setCalculationResult(null);

    try {
      const response = await base44.functions.invoke('calculateLineOfCreditPaymentBreakdown', {
        lineOfCreditId: lineOfCredit.id,
        paymentAmount
      });

      if (response.data?.success) {
        setCalculationResult(response.data.breakdown);
      } else {
        alert(response.data?.error || 'Failed to calculate payment breakdown.');
      }
    } catch (error) {
      console.error('Error calculating payment breakdown:', error);
      alert(error.message || 'Failed to calculate payment breakdown.');
    } finally {
      setCalculating(false);
    }
  };

  const handleProceedToPaymentDetails = () => {
    const paymentAmount = activeTab === 'pay_charges' ? totalSelectedAmount : parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter or select a valid payment amount.');
      return;
    }

    if (activeTab === 'pay_balance' && !calculationResult) {
      alert('Please calculate the payment breakdown before continuing.');
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
          .map(charge => {
            if (charge.charge_amount > 0) {
              return {
                id: charge.id,
                amount: charge.charge_amount - (charge.payment_amount || 0)
              };
            } else {
              return {
                id: charge.id,
                amount: -(charge.credit_amount + (charge.payment_amount || 0))
              };
            }
          });
      } else if (activeTab === 'pay_balance') {
        appliedCharges = calculationResult?.appliedCharges || [];
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-hidden">
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 min-w-0 overflow-hidden">
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
                          <TableCell className={`text-right ${charge.credit_amount > 0 ? 'text-green-600' : ''}`}>
                            {charge.credit_amount > 0 ? '-' : ''}${((charge.charge_amount || charge.credit_amount) - Math.abs(charge.payment_amount || 0)).toFixed(2)}
                          </TableCell>
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Payment Amount</Label>
                  <div className="flex gap-2">
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={e => {
                        setAmount(e.target.value);
                        if (calculationResult) setCalculationResult(null);
                      }}
                      placeholder={`Current balance: $${(lineOfCredit?.current_balance || 0).toFixed(2)}`}
                      required
                    />
                    <Button type="button" onClick={handleCalculatePayment} disabled={calculating || !amount}>
                      {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Calculate'}
                    </Button>
                  </div>
                </div>

                {calculationResult && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-4 py-2 font-medium border-b flex justify-between">
                      <span>Proposed Application</span>
                      <span>${(calculationResult.totalApplied || 0).toFixed(2)}</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Applied</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calculationResult.appliedCharges.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground">No transactions applied</TableCell>
                            </TableRow>
                          ) : (
                            calculationResult.appliedCharges.map((item) => {
                              const tx = outstandingCharges.find(charge => charge.id === item.id);
                              return (
                                <TableRow key={item.id}>
                                  <TableCell>{tx?.description || item.id}</TableCell>
                                  <TableCell className={`text-right ${item.amount < 0 ? 'text-green-600' : ''}`}>
                                    ${Math.abs(item.amount).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                          {(calculationResult.unappliedAmount || 0) > 0.00001 && (
                            <TableRow className="bg-amber-50">
                              <TableCell className="font-medium text-amber-800">Unapplied</TableCell>
                              <TableCell className="text-right font-medium text-amber-800">
                                ${calculationResult.unappliedAmount.toFixed(2)}
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

            <DialogFooter className="sm:justify-between flex-col sm:flex-row gap-2">
              <div className="flex items-center">
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Upload className="w-4 h-4" />
                  Upload CSV
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button 
                  type="button" 
                  onClick={() => setShowAddToSheetModal(true)}
                  disabled={(activeTab === 'pay_charges' && totalSelectedAmount === 0) || (activeTab === 'pay_balance' && (!amount || parseFloat(amount) <= 0))}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Next: Add to Cash Flow
                </Button>
                <Button 
                  onClick={handleProceedToPaymentDetails} 
                  disabled={(activeTab === 'pay_charges' && totalSelectedAmount === 0) || (activeTab === 'pay_balance' && (!amount || parseFloat(amount) <= 0))}
                >
                  Next: Payment Details (${(activeTab === 'pay_charges' ? totalSelectedAmount : (parseFloat(amount) || 0)).toFixed(2)})
                </Button>
              </div>
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

      <AddToSheetModal
        open={showAddToSheetModal}
        onClose={() => setShowAddToSheetModal(false)}
        initialValues={{
          supplierName: lineOfCredit?.name,
          locId: lineOfCredit?.id,
          amount: activeTab === 'pay_charges' ? totalSelectedAmount : (parseFloat(amount) || 0),
          dueDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
        }}
        onSuccess={handleClose}
      />
    </Dialog>
  );
}