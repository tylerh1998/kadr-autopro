import React, { useState } from "react";
import { PayStub } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Ban, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CancelPaychequeModal({ payStub, employee, onComplete, onCancel }) {
  const [processing, setProcessing] = useState(false);

  const handleCancel = async () => {
    setProcessing(true);

    try {
      await PayStub.update(payStub.id, { is_cancelled: true });
      alert(`Paycheque cancelled successfully for ${employee.first_name} ${employee.last_name}!`);
      onComplete();
    } catch (error) {
      alert("Error cancelling paycheque. Please try again.");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <Ban className="w-5 h-5" />
            Cancel Paycheque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="dark:bg-slate-800 dark:border-slate-700">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="dark:text-slate-300">
              <strong>Warning:</strong> This action cannot be undone. This will permanently cancel the paycheque and lock it from further modifications.
            </AlertDescription>
          </Alert>

          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Paycheque Details</h3>
            <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p><span className="font-medium">Employee:</span> {employee.first_name} {employee.last_name}</p>
              <p><span className="font-medium">Pay Period:</span> {new Date(payStub.pay_period_start).toLocaleDateString('en-CA')} - {new Date(payStub.pay_period_end).toLocaleDateString('en-CA')}</p>
              <p><span className="font-medium">Gross Pay:</span> ${payStub.gross_pay?.toFixed(2)}</p>
              <p><span className="font-medium">Net Pay:</span> ${payStub.net_pay?.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onCancel} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={processing}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel Paycheque
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
