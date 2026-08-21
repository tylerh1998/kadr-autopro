import React, { useState } from "react";
import { Remittance } from "@/components/paypro/lib/payrollEntities";
import { supabase } from "@/lib/supabase";
import { checkFiscalPeriodStatus } from "@/components/utils/fiscalPeriodUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, X, Banknote, CalendarX2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const generateId = () => crypto.randomUUID().replace(/-/g, '').substring(0, 24);

// New component - no source equivalent. Built from Phase 6's paystub-level
// CancelPaymentModal.jsx pattern (O2/Option A): posts an exact-inverse GLTransaction set
// plus a reversing BankTransaction, matched against this remittance's *actual posted* rows
// via source_id/source_type - never a recomputation. Nothing is deleted; pay_stub_ids stays
// on the row for audit (D1/D2). PayPro_Remittance has no is_paid column - status flips to
// 'cancelled' instead (D1).
export default function CancelRemittanceModal({ remittance, onComplete, onCancel }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleCancel = async () => {
    setProcessing(true);
    setError('');

    try {
      // O-6: Fiscal Period gate before any write, gated on the cancellation's own date -
      // same choice Phase 6's paystub-level CancelPaymentModal made (today, not the
      // original remittance_date).
      const cancellationDate = new Date().toLocaleDateString('en-CA');
      const fiscalStatus = await checkFiscalPeriodStatus(cancellationDate);
      if (!fiscalStatus.isValid) {
        setError(fiscalStatus.message);
        setProcessing(false);
        return;
      }

      const { data: originalGlRows, error: glFetchError } = await supabase
        .from('GLTransaction')
        .select('*')
        .eq('source_type', 'payment')
        .eq('source_id', remittance.id);
      if (glFetchError) throw glFetchError;

      const { data: originalBankRows, error: bankFetchError } = await supabase
        .from('BankTransaction')
        .select('*')
        .eq('source_type', 'payment')
        .eq('source_id', remittance.id);
      if (bankFetchError) throw bankFetchError;

      // D6: expected to be empty for remittances imported before this phase shipped
      // (their real historical GL/Bank rows are keyed to a PayrollTransaction.id, not this
      // PayPro_Remittance.id) - fail clearly rather than silently doing nothing.
      if ((!originalGlRows || originalGlRows.length === 0) && (!originalBankRows || originalBankRows.length === 0)) {
        throw new Error('No original GL/Bank posting found for this remittance - nothing to reverse. Remittances processed before this phase shipped were never posted through this system and cannot be reversed here.');
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
          source_id: remittance.id,
        }));
        const { error: glInsertError } = await supabase.from('GLTransaction').insert(reversalGlRows);
        if (glInsertError) throw new Error(`GL reversal failed: ${glInsertError.message}`);
      }

      let touchedBankAccountId = null;
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
          source_id: remittance.id,
          gl_account: row.gl_account,
          created_date: mountainNow,
          updated_date: mountainNow,
        }));
        const { error: bankInsertError } = await supabase.from('BankTransaction').insert(reversalBankRows);
        if (bankInsertError) throw new Error(`Bank reversal failed: ${bankInsertError.message}`);
        touchedBankAccountId = originalBankRows[0].bank_account_id;
      }

      // D1: status, not is_paid - PayPro_Remittance has no is_paid column. pay_stub_ids is
      // deliberately left untouched (audit trail) - D2's follow-up filter on the reading
      // side (Remittances.jsx/PayStubs.jsx) is what actually un-locks these stubs.
      await Remittance.update(remittance.id, { status: 'cancelled' });

      if (touchedBankAccountId) {
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
          body: { bankAccountId: touchedBankAccountId },
        });
        if (balanceError) throw balanceError;
        if (balanceData?.error) throw new Error(balanceData.error);
      }

      onComplete();
    } catch (err) {
      console.error("Error cancelling remittance:", err);
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <XCircle className="w-5 h-5" />
            Cancel Remittance
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            You are about to reverse the GL/Bank posting for this remittance. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Banknote className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Paycheques Included</p>
                <p className="text-lg font-bold dark:text-slate-100">{remittance.pay_stub_ids?.length || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <CalendarX2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm text-red-800 dark:text-red-300">Total Remittance</p>
                <p className="text-lg font-bold text-red-900 dark:text-red-200">${(remittance.total_remittance || 0).toFixed(2)}</p>
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
            onClick={handleCancel}
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
