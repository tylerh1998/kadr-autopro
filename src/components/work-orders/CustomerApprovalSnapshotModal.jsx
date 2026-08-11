import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Printer } from "lucide-react";
import { supabase } from '@/lib/supabase';
import ModalCloseButton from '@/components/ui/modal-close-button';
import CustomerApprovalSnapshotReport from './CustomerApprovalSnapshotReport';

// Live, in-app reconstruction of a CustomerPortalWorkOrder snapshot (what the
// customer actually saw) plus its Approvals decision record — no dependency
// on the external customer-portal app being reachable. Also printable via the
// same on-screen-DOM + @media print pattern used by the vehicle history modal.
export default function CustomerApprovalSnapshotModal({ open, onClose, cpId, approval: approvalProp }) {
  const [snapshot, setSnapshot] = useState(null);
  const [approval, setApproval] = useState(approvalProp || null);
  const [wipLegal, setWipLegal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!cpId) {
      setError('No portal snapshot ID is available for this approval.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: snapshotRow, error: snapshotError } = await supabase
        .from('CustomerPortalWorkOrder')
        .select('*')
        .eq('cp_id', cpId)
        .maybeSingle();

      if (snapshotError) throw new Error(snapshotError.message || 'Failed to fetch portal snapshot');
      if (!snapshotRow) throw new Error('The customer portal snapshot for this approval could not be found. It may have been removed.');
      setSnapshot(snapshotRow);

      if (!approvalProp) {
        const { data: approvalRow, error: approvalError } = await supabase
          .from('Approvals')
          .select('*')
          .eq('cp_id', cpId)
          .order('created_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (approvalError) throw new Error(approvalError.message || 'Failed to fetch approval decision');
        setApproval(approvalRow || null);
      }

      const { data: settings, error: settingsError } = await supabase.from('SystemSettings').select('wip_legal').limit(1);
      if (!settingsError && settings && settings.length > 0) {
        setWipLegal(settings[0].wip_legal || '');
      }
    } catch (err) {
      console.error('Error loading customer approval snapshot:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cpId, approvalProp]);

  useEffect(() => {
    if (open && cpId) {
      fetchData();
    }
  }, [open, cpId, fetchData]);

  useEffect(() => {
    if (approvalProp) setApproval(approvalProp);
  }, [approvalProp]);

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto customer-approval-dialog [&>button:last-child]:hidden dark:bg-slate-950 dark:border-slate-800">
        <ModalCloseButton onClick={onClose} />
        <DialogHeader className="no-print">
          <div className="flex items-start justify-between gap-4 pr-16">
            <div>
              <DialogTitle>Approved Work Order Snapshot</DialogTitle>
              <DialogDescription>
                Live in-app view of exactly what the customer was shown and their decision, reconstructed from the customer portal record.
              </DialogDescription>
            </div>
            {snapshot && !loading && !error && (
              <Button onClick={handlePrint} size="sm" className="shrink-0">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="customer-approval-content">
          {loading ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 m-1 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" />
              <span className="text-red-700 dark:text-red-300">{error}</span>
            </div>
          ) : (
            <CustomerApprovalSnapshotReport snapshot={snapshot} approval={approval} wipLegal={wipLegal} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
