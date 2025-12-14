import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Customer, CustomerPayments, CustomerARAdjustment } from '@/entities/all';
import { differenceInDays, differenceInMonths, addDays, format } from 'date-fns';
import { Calculator, DollarSign, AlertTriangle } from 'lucide-react';

export default function InterestCalculationModal({ open, onClose, customers, onInterestCalculated }) {
  const [selectedCustomers, setSelectedCustomers] = useState({});
  const [interestCalculations, setInterestCalculations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Helper function to format customer name
  const formatCustomerName = (customer) => {
    if (!customer) return '';
    if (customer.org_name) {
      const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
    }
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  };

  const calculateInterest = useCallback(async () => {
    setCalculating(true);
    try {
      const today = new Date();
      const calculations = [];

      for (const customer of customers) {
        // Get all payments and adjustments for this customer
        const [allPayments, adjustments] = await Promise.all([
          CustomerPayments.filter({ customer_id: customer.id }),
          CustomerARAdjustment.filter({ customer_id: customer.id })
        ]);

        // Filter payments to only include On Account charges and AR payments
        const onAccountCharges = allPayments.filter(p => p.payment_method === 'on_account');
        const actualPayments = allPayments.filter(p => p.ar_pmt && p.payment_method !== 'on_account');

        // Get charge items (on_account + positive adjustments)
        const chargeItems = [];
        
        onAccountCharges.forEach(charge => {
          if (charge.payment_date) {
            const chargeDate = new Date(charge.payment_date);
            const gracePeriodEnd = addDays(chargeDate, 30);
            const interestStartDate = gracePeriodEnd;
            
            chargeItems.push({
              date: chargeDate,
              interestStartDate,
              amount: charge.amount || 0,
              description: `Invoice ${charge.invoice_number || 'N/A'}`,
              type: 'charge'
            });
          }
        });

        adjustments.forEach(adj => {
          if (adj.amount > 0) {
            const adjDate = new Date(adj.adjustment_date);
            const gracePeriodEnd = addDays(adjDate, 30);
            const interestStartDate = gracePeriodEnd;
            
            chargeItems.push({
              date: adjDate,
              interestStartDate,
              amount: adj.amount,
              description: adj.description || 'Adjustment',
              type: 'adjustment'
            });
          }
        });

        // Sort charge items by date
        chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Calculate total credits
        const totalCredits = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
                           adjustments.reduce((sum, adj) => sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0), 0);

        // Apply credits to charges in chronological order to determine outstanding amounts
        let remainingCredits = totalCredits;
        const outstandingCharges = [];

        for (const charge of chargeItems) {
          let outstandingAmount = charge.amount;
          
          if (remainingCredits > 0) {
            const creditApplied = Math.min(remainingCredits, charge.amount);
            outstandingAmount = charge.amount - creditApplied;
            remainingCredits -= creditApplied;
          }
          
          if (outstandingAmount > 0) {
            outstandingCharges.push({
              ...charge,
              outstandingAmount
            });
          }
        }

        // Calculate interest on outstanding charges
        let totalInterest = 0;
        const interestDetails = [];

        for (const charge of outstandingCharges) {
          if (today > charge.interestStartDate) {
            const monthsOverdue = differenceInMonths(today, charge.interestStartDate);
            
            if (monthsOverdue > 0) {
              // Calculate compound interest: A = P(1 + r/n)^(nt)
              // Where: P = principal, r = 0.24 (24%), n = 12 (monthly), t = monthsOverdue/12
              const monthlyRate = 0.24 / 12; // 2% per month
              const compoundFactor = Math.pow(1 + monthlyRate, monthsOverdue);
              const totalWithInterest = charge.outstandingAmount * compoundFactor;
              const interestAmount = totalWithInterest - charge.outstandingAmount;

              if (interestAmount > 0.01) { // Only include if interest is at least 1 cent
                totalInterest += interestAmount;
                interestDetails.push({
                  description: charge.description,
                  principal: charge.outstandingAmount,
                  monthsOverdue,
                  interestAmount,
                  interestStartDate: charge.interestStartDate
                });
              }
            }
          }
        }

        if (totalInterest > 0.01) {
          calculations.push({
            customer,
            totalInterest,
            interestDetails,
            currentBalance: outstandingCharges.reduce((sum, c) => sum + c.outstandingAmount, 0)
          });
        }
      }

      setInterestCalculations(calculations);
    } catch (error) {
      console.error('Error calculating interest:', error);
      alert('Failed to calculate interest. Please try again.');
    } finally {
      setCalculating(false);
    }
  }, [customers]);

  useEffect(() => {
    if (open) {
      calculateInterest();
    }
  }, [open, calculateInterest]);

  const handleSelectAll = (checked) => {
    const newSelection = {};
    if (checked) {
      interestCalculations.forEach(calc => {
        newSelection[calc.customer.id] = true;
      });
    }
    setSelectedCustomers(newSelection);
  };

  const handleCustomerSelect = (customerId, checked) => {
    setSelectedCustomers(prev => ({
      ...prev,
      [customerId]: checked
    }));
  };

  const selectedCalculations = interestCalculations.filter(calc => 
    selectedCustomers[calc.customer.id]
  );

  const totalInterestToApply = selectedCalculations.reduce((sum, calc) => 
    sum + calc.totalInterest, 0
  );

  const handleApplyInterest = async () => {
    if (selectedCalculations.length === 0) {
      alert('Please select at least one customer to apply interest to.');
      return;
    }

    const confirmed = confirm(
      `Apply interest charges totaling $${totalInterestToApply.toFixed(2)} to ${selectedCalculations.length} customer(s)?`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const adjustments = [];
      
      for (const calc of selectedCalculations) {
        adjustments.push({
          customer_id: calc.customer.id,
          adjustment_date: format(new Date(), 'yyyy-MM-dd'),
          amount: calc.totalInterest,
          gl_account: '4100',
          description: `Interest charge - 24% APR (${calc.interestDetails.length} item(s))`,
          reference: `INT-${format(new Date(), 'yyyyMMdd')}`
        });
      }

      // Create all interest adjustments
      for (const adjustment of adjustments) {
        await CustomerARAdjustment.create(adjustment);
      }

      alert(`Successfully applied interest charges to ${selectedCalculations.length} customer(s).`);
      onInterestCalculated();
      onClose();
      
    } catch (error) {
      console.error('Error applying interest:', error);
      alert('Failed to apply interest charges. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const allSelected = interestCalculations.length > 0 && 
    interestCalculations.every(calc => selectedCustomers[calc.customer.id]);
  
  const someSelected = interestCalculations.some(calc => selectedCustomers[calc.customer.id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Calculate Interest (24% APR)
          </DialogTitle>
        </DialogHeader>

        {calculating ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Calculating interest for all customers...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {interestCalculations.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Interest Due</h3>
                  <p className="text-slate-600">No customers have outstanding balances with accrued interest.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">
                        Select All ({interestCalculations.length} customers)
                      </span>
                    </div>
                    {someSelected && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Selected: ${totalInterestToApply.toFixed(2)}
                      </Badge>
                    )}
                  </div>

                  <ScrollArea className="h-96 border rounded-lg">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Current Balance</TableHead>
                          <TableHead className="text-right">Interest Due</TableHead>
                          <TableHead className="text-center">Items</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {interestCalculations.map((calc) => {
                          const isSelected = !!selectedCustomers[calc.customer.id];
                          return (
                            <TableRow 
                              key={calc.customer.id}
                              onClick={() => handleCustomerSelect(calc.customer.id, !isSelected)}
                              className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleCustomerSelect(calc.customer.id, checked)}
                                  className="h-4 w-4"
                                />
                              </TableCell>
                              <TableCell>
                                <p className="font-medium">
                                  {formatCustomerName(calc.customer)}
                                </p>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                ${calc.currentBalance.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-red-600">
                                ${calc.totalInterest.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{calc.interestDetails.length}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  <div className="text-xs text-slate-500 space-y-1">
                    <p>• Interest starts accruing 30 days after invoice/transaction date</p>
                    <p>• 24% Annual Percentage Rate, compounded monthly (2% per month)</p>
                    <p>• Interest will be posted to GL Account 4100</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {interestCalculations.length > 0 && (
            <Button 
              onClick={handleApplyInterest} 
              disabled={loading || selectedCalculations.length === 0}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Applying Interest...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4 mr-2" />
                  Apply Interest (${totalInterestToApply.toFixed(2)})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}