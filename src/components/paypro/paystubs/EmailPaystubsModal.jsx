import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function EmailPaystubsModal({ stubs, employees, onComplete, onCancel }) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  const getEmployee = (id) => employees.find((e) => e.employee_id === id);

  const stubsWithEmployees = stubs.map(stub => ({
      stub,
      employee: getEmployee(stub.employee_id)
  }));

  const missingEmails = stubsWithEmployees.filter(({ employee }) => !employee?.email);
  const validStubs = stubsWithEmployees.filter(({ employee }) => employee?.email);

  const handleSend = async () => {
    if (validStubs.length === 0) return;
    setIsSending(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("paypro-emailPaystubs", {
        body: { payStubIds: validStubs.map(s => s.stub.id) }
      });
      if (invokeError) throw invokeError;
      if (data?.error) {
        throw new Error(data.error);
      }
      // Fixes the source bug where only the top-level error was ever checked - the
      // per-item failed/errors results the function already computes were never surfaced.
      if (data?.data?.failed > 0) {
        setError(`${data.data.sent} sent, ${data.data.failed} failed: ${data.data.errors.join('; ')}`);
        setIsSending(false);
        return;
      }
      onComplete();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to send emails. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && !isSending && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Email Paystubs</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Preview the paystubs that will be emailed as PDF attachments.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
            {missingEmails.length > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Missing Email Addresses</AlertTitle>
                    <AlertDescription>
                        The following employees do not have an email address on file and will be skipped:
                        <ul className="list-disc pl-5 mt-2 text-sm">
                            {missingEmails.map(({ employee, stub }) => (
                                <li key={stub.id}>
                                    {employee ? `${employee.first_name} ${employee.last_name}` : `Unknown Employee (${stub.employee_id})`}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {validStubs.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                    <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Will be sent to:</h4>
                    <div className="space-y-3">
                        {validStubs.map(({ stub, employee }) => (
                            <div key={stub.id} className="flex justify-between items-center text-sm border-b dark:border-slate-700 pb-2 last:border-0 last:pb-0">
                                <div>
                                    <p className="font-medium dark:text-slate-100">{employee.first_name} {employee.last_name}</p>
                                    <p className="text-slate-500 dark:text-slate-400">{employee.email}</p>
                                </div>
                                <div className="text-right">
                                    <p className="dark:text-slate-100">Paycheque #{stub.paycheque_number || 'N/A'}</p>
                                    <p className="text-slate-500 dark:text-slate-400">${(stub.net_pay || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded">{error}</p>
            )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSending} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending || validStubs.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send {validStubs.length} Email{validStubs.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
