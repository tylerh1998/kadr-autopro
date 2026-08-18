import React, { useState } from "react";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { supabase } from "@/lib/supabase";
import { checkFiscalPeriodStatus } from "@/components/utils/fiscalPeriodUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, X, Banknote, CalendarX2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const generateId = () => crypto.randomUUID().replace(/-/g, '').substring(0, 24);

// Q1/Option A: full reversal. Posts an exact-inverse GLTransaction set (every debit
// becomes a credit and vice versa) plus a reversing BankTransaction, reversing the
// *actual posted* rows from BatchPaymentModal (matched via source_id/source_type) -
// not a recomputation from the stub's current field values. Nothing is deleted;
// originals stay for audit, the reversal stands alongside them. PayStub.is_paid flips
// back to false but pay_date is kept (not nulled), per Q1's resolution.
export default function CancelPaymentModal({ stubs, onComplete, onCancel }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleCancelPayment = async () => {
    setProcessing(true);
    setError('');

    try {
      // O-10: the Fiscal Period gate applies to every GL/Bank-writing action in this
      // phase, including a reversal - gated on the date the reversal itself is posted.
      const cancellationDate = new Date().toLocaleDateString('en-CA');
      const fiscalStatus = await checkFiscalPeriodStatus(cancellationDate);
      if (!fiscalStatus.isValid) {
        setError(fiscalStatus.message);
        setProcessing(false);
        return;
      }

      const touchedBankAccountIds = new Set();

      // Sequential per-stub loop, matching BatchPaymentModal's own pattern - not
      // Promise.all, awaited in order.
      for (const stub of stubs) {
        const { data: originalGlRows, error: glFetchError } = await supabase
          .from('GLTransaction')
          .select('*')
          .eq('source_type', 'payment')
          .eq('source_id', stub.id);
        if (glFetchError) throw glFetchError;

        const { data: originalBankRows, error: bankFetchError } = await supabase
          .from('BankTransaction')
          .select('*')
          .eq('source_type', 'payment')
          .eq('source_id', stub.id);
        if (bankFetchError) throw bankFetchError;

        if ((!originalGlRows || originalGlRows.length === 0) && (!originalBankRows || originalBankRows.length === 0)) {
          throw new Error(`No original GL/Bank posting found for paycheque ${stub.paycheque_number || stub.id} - nothing to reverse.`);
        }

        if (originalGlRows && originalGlRows.length > 0) {
          const reversalGlRows = originalGlRows.map((row) => ({
            id: generateId(),
            account_number: row.account_number,
            transaction_date: cancellationDate,
            description: `Reversal - ${row.description}`,
            reference: row.reference,
            debit_amount: row.credit_amount || 0,
            credit_amount: row.debit_amount || 0,
            source_type: 'payment_reversal',
            source_id: stub.id,
          }));
          const { error: glInsertError } = await supabase.from('GLTransaction').insert(reversalGlRows);
          if (glInsertError) throw new Error(`GL reversal failed for paycheque ${stub.paycheque_number || stub.id}: ${glInsertError.message}`);
        }

        if (originalBankRows && originalBankRows.length > 0) {
          const mountainNow = new Date().toISOString();
          const reversalBankRows = originalBankRows.map((row) => ({
            id: generateId(),
            bank_account_id: row.bank_account_id,
            transaction_date: cancellationDate,
            description: `Reversal - ${row.description}`,
            reference: row.reference,
            debit_amount: row.credit_amount || 0,
            credit_amount: row.debit_amount || 0,
            cleared: false,
            source_type: 'payment_reversal',
            source_id: stub.id,
            gl_account: row.gl_account,
            created_date: mountainNow,
            updated_date: mountainNow,
          }));
          const { error: bankInsertError } = await supabase.from('BankTransaction').insert(reversalBankRows);
          if (bankInsertError) throw new Error(`Bank reversal failed for paycheque ${stub.paycheque_number || stub.id}: ${bankInsertError.message}`);

          originalBankRows.forEach((row) => {
            if (row.bank_account_id) touchedBankAccountIds.add(row.bank_account_id);
          });
        }

        // lesson 6: PayStub writes go through the shim. pay_date is deliberately kept
        // (not nulled) so the reversal's own GL/Bank rows have a real paid record to
        // trace back to (Q1).
        await PayStub.update(stub.id, { is_paid: false });
      }

      for (const bankAccountId of touchedBankAccountIds) {
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
          body: { bankAccountId },
        });
        if (balanceError) throw balanceError;
        if (balanceData?.error) throw new Error(balanceData.error);
      }

      onComplete();
    } catch (err) {
      console.error("Error cancelling payments:", err);
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const totalPay = stubs.reduce((acc, stub) => acc + (stub.net_pay || 0), 0);

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <XCircle className="w-5 h-5" />
            Cancel Batch Payment
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            You are about to reverse the GL/Bank posting for {stubs.length} paycheque(s) and revert them to "Unpaid" status. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Banknote className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Paycheques</p>
                <p className="text-lg font-bold dark:text-slate-100">{stubs.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <CalendarX2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm text-red-800 dark:text-red-300">Total Net Pay</p>
                <p className="text-lg font-bold text-red-900 dark:text-red-200">${totalPay.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
          <Button variant="outline" onClick={onCancel} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <X className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button
            onClick={handleCancelPayment}
            disabled={processing}
            variant="destructive"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Confirm Cancellation
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
