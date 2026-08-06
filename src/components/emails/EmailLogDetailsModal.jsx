import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { Mail, User, FileText, Calendar, CheckCircle, XCircle, Copy, AlertTriangle, Clock, Ban, Eye, MousePointerClick } from 'lucide-react';

export default function EmailLogDetailsModal({ log, customer, workOrder, open, onClose }) {
  if (!log) return null;

  const StatusBadge = ({ status }) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case 'opened':
        return <Badge className="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"><Eye className="w-3 h-3 mr-1" />Opened</Badge>;
      case 'clicked':
        return <Badge className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800"><MousePointerClick className="w-3 h-3 mr-1" />Clicked</Badge>;
      case 'bounced':
        return <Badge className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"><XCircle className="w-3 h-3 mr-1" />Bounced</Badge>;
      case 'complained':
        return <Badge className="bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800"><AlertTriangle className="w-3 h-3 mr-1" />Complained</Badge>;
      case 'delivery_delayed':
        return <Badge className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"><Ban className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };



  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email Details</DialogTitle>
          <DialogDescription>
            Complete details for the email sent on {log.sent_date ? format(new Date(log.sent_date), 'PPP') : 'N/A'}.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Main Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>To:</strong> <span>{log.to_email}</span></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>From:</strong> <span>{log.from_email}</span></div>
              {customer && <div className="flex items-center gap-2"><User className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>Customer:</strong> <span>{customer.first_name} {customer.last_name}</span></div>}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>Sent:</strong> <span>{log.sent_date ? format(new Date(log.sent_date), 'MMM d, yyyy h:mm a') : 'N/A'}</span></div>
              <div className="flex items-center gap-2"><StatusBadge status={log.status} /></div>
              {log.status_message && <div className="text-sm text-slate-600 dark:text-slate-400 italic">{log.status_message}</div>}
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold">Subject</h3>
            <p className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md border">{log.subject}</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Message Body</h3>
            {/* Intentionally forced light — renders raw, uncontrolled email HTML that has no dark-mode-aware text color of its own */}
            <div
              className="p-3 bg-white text-black rounded-md border h-48 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: log.body || 'No message body recorded.' }}
            />
          </div>
          
          {log.portal_url && (
            <div className="space-y-2">
              <h3 className="font-semibold">Customer Portal Link</h3>
              <div className="flex items-center gap-2">
                <Input readOnly value={log.portal_url} className="flex-1 bg-white dark:bg-slate-900" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(log.portal_url);
                    alert('URL copied to clipboard!');
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <a href={log.portal_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">Open</Button>
                </a>
              </div>
            </div>
          )}

          {(log.work_order_id || log.tracking_id) && (
            <div className="space-y-2">
              <h3 className="font-semibold">Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm p-3 bg-slate-50 dark:bg-slate-800 rounded-md border">
                {log.work_order_id && <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>WO Number:</strong> <span>{workOrder ? workOrder.ro_number : log.work_order_id}</span></div>}
                {log.tracking_id && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" /> <strong>Tracking ID:</strong> <span className="font-mono text-xs">{log.tracking_id}</span></div>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}