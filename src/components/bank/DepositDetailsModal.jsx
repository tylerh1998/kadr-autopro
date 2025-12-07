
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  FileText,
  DollarSign,
  CheckCircle2,
  XCircle,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';

export default function DepositDetailsModal({ open, onClose, deposit }) {
  if (!deposit) return null;

  // Calculate expected balance for display (frontend calculation)
  const expectedBalance = (deposit.credit_amount || 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Deposit Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transaction Amount */}
          <div className="text-center py-4 bg-green-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">Deposit Amount</p>
            <p className="text-3xl font-bold text-green-700">
              ${(deposit.credit_amount || 0).toFixed(2)}
            </p>
          </div>

          <Separator />

          {/* Transaction Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">Transaction Date</span>
              </div>
              <p className="text-slate-900 font-semibold pl-6">
                {format(new Date(deposit.transaction_date), 'MMMM d, yyyy')}
              </p>
            </div>

            {deposit.reference && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Hash className="w-4 h-4" />
                  <span className="font-medium">Reference</span>
                </div>
                <p className="text-slate-900 font-semibold pl-6">
                  {deposit.reference}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileText className="w-4 h-4" />
                <span className="font-medium">Source Type</span>
              </div>
              <Badge variant="outline" className="ml-6 capitalize">
                {deposit.source_type?.replace('_', ' ') || 'Manual'}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                {deposit.cleared ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-medium">Status</span>
              </div>
              <div className="pl-6">
                {deposit.cleared ? (
                  <Badge className="bg-green-100 text-green-800">Cleared</Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500">Uncleared</Badge>
                )}
                {deposit.reconciled && (
                  <Badge className="bg-blue-100 text-blue-800 ml-2">Reconciled</Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileText className="w-4 h-4" />
              <span className="font-medium">Description</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-slate-900">
                {deposit.description || 'No description provided'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
