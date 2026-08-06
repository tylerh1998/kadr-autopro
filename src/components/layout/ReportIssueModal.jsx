import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCapturedLogs } from "@/lib/logCollector";

export default function ReportIssueModal({ isOpen, onClose, user, currentEmployeeData, isGloballyClockedIn }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const { error } = await supabase.from('IssueReport').insert([
        {
          id: crypto.randomUUID(),
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: currentEmployeeData?.email || user?.email || "Unknown User",
          created_by_id: user?.id || null,
          user_title: title,
          title: title,
          description,
          error_message: errorMessage,
          severity,
          status: 'new',
          url: window.location.href,
          console_logs: getCapturedLogs(),
          metadata: {
            browser: navigator.userAgent,
            screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
            employee_name: currentEmployeeData?.full_name || "Unknown",
            is_globally_clocked_in: !!isGloballyClockedIn
          }
        }
      ]);

      if (error) throw error;

      // Send email notification via Edge Function
      try {
        await supabase.functions.invoke('autopro-report-issue', {
          body: {
            title,
            description,
            errorMessage,
            severity,
            url: window.location.href,
            userEmail: currentEmployeeData?.email || user?.email || "Unknown User",
            employeeName: currentEmployeeData?.full_name || "Unknown",
            consoleLogs: getCapturedLogs()
          }
        });
      } catch (funcErr) {
        // Log edge function errors but do not block UI success since the database record succeeded
        console.error("Failed to trigger email notification:", funcErr);
      }

      setIsSubmitted(true);
    } catch (e) {
      console.error("Error submitting support ticket:", e);
      setErrorMsg("Failed to submit the issue report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setErrorMessage("");
    setSeverity("medium");
    setIsSubmitted(false);
    setErrorMsg("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[475px] bg-background text-foreground border border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            Report an Issue
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Tell us what's going on, and the program administrator will look into it.
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 animate-bounce" />
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Report Submitted</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Thank you! A notification has been made and we are looking into this.
            </p>
            <Button className="mt-4" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="issue-title" className="text-slate-700 dark:text-slate-300">Issue Name</Label>
              <Input
                id="issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="bg-transparent border-slate-200 dark:border-slate-700 text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-desc" className="text-slate-700 dark:text-slate-300">What were you working on, and what happened?</Label>
              <Textarea
                id="issue-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                required
                className="bg-transparent border-slate-200 dark:border-slate-700 text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-error" className="text-slate-700 dark:text-slate-300">Did the screen show any error alerts or messages?</Label>
              <Textarea
                id="issue-error"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                rows={2}
                className="bg-transparent border-slate-200 dark:border-slate-700 text-foreground"
              />
            </div>

            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <Label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Severity</Label>
              <RadioGroup value={severity} onValueChange={setSeverity} className="grid grid-cols-3 gap-2 mt-1">
                <div>
                  <RadioGroupItem value="low" id="sev-low" className="peer sr-only" />
                  <Label
                    htmlFor="sev-low"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted dark:border-slate-700 bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 dark:peer-data-[state=checked]:border-blue-500 [&:has([data-state=checked])]:border-blue-600 dark:[&:has([data-state=checked])]:border-blue-500 cursor-pointer text-xs transition-colors"
                  >
                    <span className="text-slate-900 dark:text-slate-100">🟢 Low</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Suggestion</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="medium" id="sev-medium" className="peer sr-only" />
                  <Label
                    htmlFor="sev-medium"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted dark:border-slate-700 bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 dark:peer-data-[state=checked]:border-blue-500 [&:has([data-state=checked])]:border-blue-600 dark:[&:has([data-state=checked])]:border-blue-500 cursor-pointer text-xs transition-colors"
                  >
                    <span className="text-slate-900 dark:text-slate-100">🟡 Medium</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Workaround</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="critical" id="sev-critical" className="peer sr-only" />
                  <Label
                    htmlFor="sev-critical"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted dark:border-slate-700 bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 dark:peer-data-[state=checked]:border-blue-500 [&:has([data-state=checked])]:border-blue-600 dark:[&:has([data-state=checked])]:border-blue-500 cursor-pointer text-xs transition-colors"
                  >
                    <span className="text-slate-900 dark:text-slate-100">🔴 Critical</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">I'm Blocked</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {errorMsg && <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{errorMsg}</p>}

            <DialogFooter className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting} className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
