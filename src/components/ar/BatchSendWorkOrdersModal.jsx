import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Copy, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function getStageTitle(workOrder) {
  if (workOrder?.stage === 'estimate') return 'Estimate';
  if (workOrder?.stage === 'invoice') return 'Invoice';
  return 'Work Order';
}

function getWorkOrderNumber(workOrder) {
  return workOrder?.inv_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.ro_number || '';
}

function getPaidAmount(workOrder) {
  let paid = 0;
  try {
    if (workOrder?.payments) {
      const paymentsList = typeof workOrder.payments === 'string' ? JSON.parse(workOrder.payments) : workOrder.payments;
      if (Array.isArray(paymentsList)) {
        paid = paymentsList.reduce((sum, p) => {
          const method = p.payment_method || p.method;
          if (method === 'on_account') return sum;
          return sum + (Number(p.amount) || 0);
        }, 0);
      }
    }
  } catch {
    paid = workOrder?.amount_paid || 0;
  }
  return paid;
}

export default function BatchSendWorkOrdersModal({ open, onClose, customer, selectedWorkOrders, onSent }) {
  const [emailTo, setEmailTo] = useState('');
  const [portalLinks, setPortalLinks] = useState({});
  const [snapshotErrors, setSnapshotErrors] = useState({});
  const [creatingSnapshots, setCreatingSnapshots] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]);

  const selectedIds = useMemo(() => selectedWorkOrders.map((item) => item.id), [selectedWorkOrders]);

  useEffect(() => {
    if (!open) return;
    setEmailTo(customer?.email || '');
    setResults([]);
  }, [open, customer, selectedWorkOrders]);

  useEffect(() => {
    if (!open || selectedIds.length === 0) return;

    let cancelled = false;

    const loadSnapshots = async () => {
      setCreatingSnapshots(true);
      setSnapshotErrors({});
      const nextLinks = {};
      const nextErrors = {};

      for (const workOrder of selectedWorkOrders) {
        try {
          const { data, error: invokeError } = await supabase.functions.invoke('autopro-createPortalSnapshot', {
            body: { work_order_id: workOrder.id }
          });
          if (invokeError) throw invokeError;
          if (data?.success) {
            nextLinks[workOrder.id] = data.portal_url || `https://portal.kensauto.ca/WorkOrder?cp_id=${data.cp_id}`;
          } else {
            nextErrors[workOrder.id] = data?.error || 'Failed to create portal link';
          }
        } catch (error) {
          nextErrors[workOrder.id] = error.message || 'Failed to create portal link';
        }
      }

      if (!cancelled) {
        setPortalLinks(nextLinks);
        setSnapshotErrors(nextErrors);
        setCreatingSnapshots(false);
      }
    };

    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [open, selectedIds, selectedWorkOrders]);

  const handleCopyUrl = async (url) => {
    await navigator.clipboard.writeText(url);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('autopro-sendBatchWorkOrderEmails', {
        body: {
          to: emailTo,
          customer,
          workOrders: selectedWorkOrders.map((workOrder) => ({
            id: workOrder.id,
            customer_id: workOrder.customer_id,
            stage: workOrder.stage,
            ro_number: workOrder.ro_number,
            wo_number: workOrder.wo_number,
            est_number: workOrder.est_number,
            inv_number: workOrder.inv_number,
            total_amount: workOrder.total_amount || 0,
            amount_paid: getPaidAmount(workOrder),
            portal_url: portalLinks[workOrder.id] || null
          }))
        }
      });
      if (invokeError) throw invokeError;

      const nextResults = data?.results || [];
      setResults(nextResults);
      if (nextResults.some((item) => item.success)) {
        onSent?.(nextResults);
      }
    } finally {
      setSending(false);
    }
  };

  const readyCount = selectedWorkOrders.filter((workOrder) => portalLinks[workOrder.id]).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send Selected Work Orders</DialogTitle>
          <DialogDescription>Send one email per selected work order using the customer portal links below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch-email">Email Address</Label>
              <Input id="batch-email" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Customer Portal URLs</Label>
              <Badge variant="outline">{readyCount} / {selectedWorkOrders.length} ready</Badge>
            </div>

            {creatingSnapshots && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                <span className="text-sm text-blue-800 dark:text-blue-300">Creating customer portal links...</span>
              </div>
            )}

            <ScrollArea className="h-64 rounded-md border p-3">
              <div className="space-y-3">
                {selectedWorkOrders.map((workOrder) => {
                  const url = portalLinks[workOrder.id];
                  const error = snapshotErrors[workOrder.id];
                  const label = `${getStageTitle(workOrder)} #${getWorkOrderNumber(workOrder)}`;

                  return (
                    <div key={workOrder.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{label}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">${(workOrder.total_amount || 0).toFixed(2)}</p>
                        </div>
                        {url && <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
                      </div>

                      {url && (
                        <div className="flex gap-2">
                          <Input value={url} readOnly className="flex-1" />
                          <Button type="button" variant="outline" onClick={() => handleCopyUrl(url)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      )}

                      {error && (
                        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3 flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              <Label>Send Status</Label>
              <div className="rounded-md border divide-y">
                {results.map((result) => (
                  <div key={result.work_order_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{result.label}</p>
                      <p className="text-slate-500 dark:text-slate-400">{result.message}</p>
                    </div>
                    <Badge className={result.success ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}>
                      {result.success ? 'Sent' : 'Failed'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || creatingSnapshots || !emailTo || readyCount !== selectedWorkOrders.length}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? 'Sending...' : `Send ${selectedWorkOrders.length} Email${selectedWorkOrders.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}