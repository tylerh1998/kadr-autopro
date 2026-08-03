import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  try {
    const cleanDateString = dateString.includes('T') ? dateString.split('T')[0] : dateString;
    const parts = cleanDateString.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) return date;
      }
    }
    const fallbackDate = new Date(dateString);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  } catch (e) {
    return null;
  }
};

const formatDateSafe = (dateString) => {
  const date = parseLocalDate(dateString);
  if (!date) return '-';
  try {
    return format(date, 'MMM d, yyyy');
  } catch (e) {
    return '-';
  }
};

export default function PaymentTransactionItem({ payment, allTransactions, onPaymentCancelled }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const appliedData = payment.payment_applied_data 
    ? JSON.parse(payment.payment_applied_data) 
    : [];

  const appliedDetails = appliedData.map(item => {
    const originalTx = allTransactions.find(tx => tx.id === item.id);
    return {
      ...item,
      date: originalTx ? originalTx.transaction_date : null,
      description: originalTx ? originalTx.description : 'Unknown Transaction',
    };
  });

  const handleCancelPayment = async () => {
    setIsCancelling(true);
    try {
      await supabase.functions.invoke('autopro-cancelLineOfCreditPayment', {
        body: { transactionId: payment.id },
      });
      await onPaymentCancelled?.();
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Card className={`mb-2 border transition-colors ${isExpanded ? 'border-blue-300 ring-1 ring-blue-300' : 'hover:border-slate-300'}`}>
      <div 
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-6">
          <div className="w-32 font-medium text-slate-700">
            {formatDateSafe(payment.transaction_date)}
          </div>
          <div className="flex-1 font-medium text-slate-900">
            {payment.description}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="font-bold text-green-600">
            ${(payment.payment_amount || 0).toFixed(2)}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={(e) => e.stopPropagation()}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Payment'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel payment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel this LOC payment and refresh the balances immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Payment</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={handleCancelPayment}
                >
                  Confirm Cancel
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 bg-slate-50 border-t pt-4 rounded-b-lg">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Payment Applied To</h4>
          {appliedDetails.length > 0 ? (
            <div className="bg-white rounded border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="text-left py-2 px-3 font-medium w-32">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Description</th>
                    <th className="text-right py-2 px-3 font-medium w-32">Applied Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {appliedDetails.map((detail, index) => (
                    <tr key={index} className="border-b last:border-0 border-slate-100">
                      <td className="py-2 px-3 text-slate-600">
                        {formatDateSafe(detail.date)}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{detail.description}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-700">
                        ${(detail.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
             <p className="text-sm text-slate-500 italic">No application details available.</p>
          )}
        </div>
      )}
    </Card>
  );
}