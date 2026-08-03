import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Banknote, Receipt, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function DepositSlipBreakdownModal({
  open,
  onClose,
  forDepositItems,
  selectedBankAccount,
  depositDate,
  depositBatchId,
  bankTransactionId,
  onGenerateSlip,
  existingBreakdown,
}) {
  const { employee } = useAuth();
  const [cashBreakdown, setCashBreakdown] = useState({
    bills_100: 0,
    bills_50: 0,
    bills_20: 0,
    bills_10: 0,
    bills_5: 0,
    coins_200: 0,
    coins_100: 0,
    coins_25: 0,
    coins_10: 0,
    coins_5: 0,
    rolled_coin: 0,
  });
  const [processing, setProcessing] = useState(false);

  const cheques = useMemo(() => {
    const chequeItems = forDepositItems?.cheque || [];
    // Map cheques to use cheque_name if available, otherwise fall back to customerName
    return chequeItems.map(cheque => ({
      ...cheque,
      displayName: cheque.cheque_name || cheque.customerName || 'Unknown'
    }));
  }, [forDepositItems]);
  const hasCash = useMemo(() => (forDepositItems?.cash?.length || 0) > 0, [forDepositItems]);

  const updateCashBreakdown = (denomination, value) => {
    setCashBreakdown(prev => ({
      ...prev,
      [denomination]: Math.max(0, parseInt(value, 10) || 0)
    }));
  };

  const updateRolledCoin = (value) => {
    setCashBreakdown(prev => ({
      ...prev,
      rolled_coin: Math.max(0, parseFloat(value) || 0)
    }));
  };

  const calculateCashTotals = useMemo(() => {
    const billsTotal = (cashBreakdown.bills_100 * 100) +
                       (cashBreakdown.bills_50 * 50) +
                       (cashBreakdown.bills_20 * 20) +
                       (cashBreakdown.bills_10 * 10) +
                       (cashBreakdown.bills_5 * 5);

    const coinsTotal = (cashBreakdown.coins_200 * 2) +
                       (cashBreakdown.coins_100 * 1) +
                       (cashBreakdown.coins_25 * 0.25) +
                       (cashBreakdown.coins_10 * 0.10) +
                       (cashBreakdown.coins_5 * 0.05) +
                       (cashBreakdown.rolled_coin);
    
    return {
      billsTotal,
      coinsTotal,
      total: billsTotal + coinsTotal
    };
  }, [cashBreakdown]);

  const totalCheques = useMemo(() => {
    return cheques.reduce((sum, cheque) => sum + (cheque.amount || 0), 0);
  }, [cheques]);

  const depositAmount = calculateCashTotals.total + totalCheques;

  const expectedCashTotal = useMemo(() => {
    return forDepositItems?.cash?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
  }, [forDepositItems]);

  const cashMismatch = hasCash && Math.abs(calculateCashTotals.total - expectedCashTotal) > 0.01;

  const handleGenerateSlip = async () => {
    if (cashMismatch) {
      alert("Cash breakdown total does not match expected. Please adjust.");
      return;
    }
    setProcessing(true);
    try {
      // Save breakdown to entity (only if we have a depositBatchId - new deposits)
      if (depositBatchId) {
        const parsedAccountNumber = Number(selectedBankAccount?.account_number);
        const currentUser = employee;
        const creatorName = currentUser?.User_name || currentUser?.full_name || currentUser?.email || currentUser?.id;
        const nowIso = new Date().toISOString();
        const breakdownData = {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          created_date: nowIso,
          updated_date: nowIso,
          created_by: creatorName,
          created_by_id: currentUser?.id,
          deposit_batch_id: depositBatchId,
          bank_transaction_id: bankTransactionId || '',
          deposit_date: depositDate,
          ...cashBreakdown,
          total_cash: calculateCashTotals.total,
          total_cheques: totalCheques,
          deposit_amount: depositAmount,
          cheques_data: JSON.stringify(cheques.map(c => ({
            customerName: c.displayName, // Use displayName which prefers cheque_name
            amount: c.amount,
            cheque_number: c.cheque_number || ''
          }))),
          bank_account_number: Number.isFinite(parsedAccountNumber) ? parsedAccountNumber : null,
          bank_account_name: selectedBankAccount?.name || '',
        };
        const { error: breakdownError } = await supabase.from('DepositSlipBreakdown').insert(breakdownData);
        if (breakdownError) throw new Error(breakdownError.message);
      }

      // Map cheques to use displayName (cheque_name or customerName) for the slip
      const chequesForSlip = cheques.map(c => ({
        customerName: c.displayName, // Use displayName which prefers cheque_name
        amount: c.amount,
        cheque_number: c.cheque_number || ''
      }));
      
      await onGenerateSlip({
        cashBreakdown,
        cheques: chequesForSlip,
        selectedBankAccount,
        depositDate,
        totalCash: calculateCashTotals.total,
        totalCheques,
        depositAmount,
      });
      onClose();
    } catch (error) {
      console.error("Error generating deposit slip:", error);
      alert("Failed to generate deposit slip.");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (existingBreakdown) {
        // Load existing breakdown data for reprints
        setCashBreakdown({
          bills_100: existingBreakdown.bills_100 || 0,
          bills_50: existingBreakdown.bills_50 || 0,
          bills_20: existingBreakdown.bills_20 || 0,
          bills_10: existingBreakdown.bills_10 || 0,
          bills_5: existingBreakdown.bills_5 || 0,
          coins_200: existingBreakdown.coins_200 || 0,
          coins_100: existingBreakdown.coins_100 || 0,
          coins_25: existingBreakdown.coins_25 || 0,
          coins_10: existingBreakdown.coins_10 || 0,
          coins_5: existingBreakdown.coins_5 || 0,
          rolled_coin: existingBreakdown.rolled_coin || 0,
        });
      } else {
        // Reset for new deposits
        setCashBreakdown({
          bills_100: 0, bills_50: 0, bills_20: 0, bills_10: 0, bills_5: 0,
          coins_200: 0, coins_100: 0, coins_25: 0, coins_10: 0, coins_5: 0,
          rolled_coin: 0,
        });
      }
    }
  }, [open, existingBreakdown]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Deposit Slip - {depositDate ? format(new Date(depositDate + 'T00:00:00'), 'MMM d, yyyy') : ''}
          </DialogTitle>
          <p className="text-sm text-slate-500">Enter cash breakdown and confirm cheque details.</p>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto p-4 border-t border-b">
          {/* Cash Breakdown */}
          <div className="space-y-4 pr-4 md:border-r">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Cash Breakdown
              {hasCash && <span className="text-sm font-normal text-slate-500">(Expected: ${expectedCashTotal.toFixed(2)})</span>}
            </h3>
            {!hasCash && <p className="text-sm text-slate-500">No cash in this deposit.</p>}
            {hasCash && (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[100, 50, 20, 10, 5].map(bill => (
                    <div key={`bills_${bill}`} className="flex items-center gap-2">
                      <Label htmlFor={`bills_${bill}`} className="w-12 text-right">${bill}</Label>
                      <Input
                        id={`bills_${bill}`}
                        type="number"
                        min="0"
                        value={cashBreakdown[`bills_${bill}`]}
                        onChange={(e) => updateCashBreakdown(`bills_${bill}`, e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                  <Label className="col-span-2 font-semibold">Coins</Label>
                  {[{key: 'coins_200', label: '$2'}, {key: 'coins_100', label: '$1'}, {key: 'coins_25', label: '25c'}, {key: 'coins_10', label: '10c'}, {key: 'coins_5', label: '5c'}].map(coin => (
                    <div key={coin.key} className="flex items-center gap-2">
                      <Label htmlFor={coin.key} className="w-12 text-right">{coin.label}</Label>
                      <Input
                        id={coin.key}
                        type="number"
                        min="0"
                        value={cashBreakdown[coin.key]}
                        onChange={(e) => updateCashBreakdown(coin.key, e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Label htmlFor="rolled_coin" className="w-24">Rolled Coin</Label>
                  <Input
                    id="rolled_coin"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashBreakdown.rolled_coin}
                    onChange={(e) => updateRolledCoin(e.target.value)}
                    className="flex-1"
                    placeholder="$ amount"
                  />
                </div>
              </>
            )}
            <div className="flex justify-between items-center text-lg font-bold pt-4 border-t">
              <span>Total Cash:</span>
              <span className={cashMismatch ? 'text-red-600' : ''}>${calculateCashTotals.total.toFixed(2)}</span>
            </div>
            {cashMismatch && (
              <p className="text-sm text-red-500">
                Mismatch: Expected ${expectedCashTotal.toFixed(2)}, entered ${calculateCashTotals.total.toFixed(2)}
              </p>
            )}
          </div>

          {/* Cheque Details */}
          <div className="space-y-4 pl-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5" /> Cheque Details
            </h3>
            {cheques.length === 0 && <p className="text-sm text-slate-500">No cheques in this deposit.</p>}
            {cheques.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <div className="grid grid-cols-3 font-medium text-slate-700 border-b pb-1">
                  <span>Cheque Name</span>
                  <span className="text-center">Cheque #</span>
                  <span className="text-right">Amount</span>
                </div>
                {cheques.map((cheque, index) => (
                  <div key={cheque.id || `cheque-${index}`} className="grid grid-cols-3 text-sm py-1">
                    <span>{cheque.displayName}</span>
                    <span className="text-center text-slate-600">{cheque.cheque_number || '-'}</span>
                    <span className="text-right">${(cheque.amount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-bold pt-4 border-t">
              <span>Total Cheques:</span>
              <span>${totalCheques.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col items-stretch gap-2 px-6 py-4">
          <div className="flex justify-between items-center text-xl font-bold">
            <span>DEPOSIT AMOUNT:</span>
            <span>${depositAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleGenerateSlip} disabled={processing || (hasCash && cashMismatch)}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
              {processing ? 'Generating...' : 'Generate Deposit Slip'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}