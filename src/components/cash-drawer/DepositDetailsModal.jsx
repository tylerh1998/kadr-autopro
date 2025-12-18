import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, DollarSign, Banknote, Building, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { CustomerPayments, CashDrawerAdjustment, Customer, WorkOrder } from '@/entities/all';

export default function DepositDetailsModal({ open, onClose, deposit, bankAccountName }) {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    const loadDetails = async () => {
      const batchId = deposit?.source_id || deposit?.reference;
      if (!open || !batchId) return;
      
      setLoading(true);
      try {
        // Fetch payments for this deposit batch
        const allPayments = await CustomerPayments.list();
        const batchPayments = allPayments.filter(p => p.deposit_batch_id === batchId);

        // Fetch adjustments for this deposit batch
        const allAdjustments = await CashDrawerAdjustment.list();
        const batchAdjustments = allAdjustments.filter(a => a.deposit_batch_id === batchId);

        // Get customer names
        const customerIds = [...new Set(batchPayments.map(p => p.customer_id))];
        const customers = await Promise.all(
          customerIds.map(id => Customer.get(id).catch(() => null))
        );
        const customerMap = customers.reduce((acc, customer) => {
          if (customer) {
            acc[customer.id] = customer.org_name || `${customer.first_name} ${customer.last_name}`;
          }
          return acc;
        }, {});

        // Fetch work orders for payments that have work_order_id
        const workOrderIds = [...new Set(batchPayments.filter(p => p.work_order_id).map(p => p.work_order_id))];
        const workOrders = await Promise.all(
          workOrderIds.map(id => WorkOrder.get(id).catch(() => null))
        );
        const workOrderMap = workOrders.reduce((acc, wo) => {
          if (wo) {
            acc[wo.id] = wo;
          }
          return acc;
        }, {});

        // Helper to resolve document number from work order
        const resolveDocNumber = (wo) => {
          if (!wo) return null;
          return wo.crinv_number || wo.inv_number || wo.wo_number || wo.est_number || wo.ro_number || null;
        };

        // Enrich payments with customer names and document references
        const enrichedPayments = batchPayments.map(p => {
          const wo = p.work_order_id ? workOrderMap[p.work_order_id] : null;
          const docRef = p.work_order_id ? resolveDocNumber(wo) : 'AR Payment';
          return {
            ...p,
            customerName: customerMap[p.customer_id] || 'Unknown',
            documentReference: docRef || 'AR Payment'
          };
        });

        setPayments(enrichedPayments);
        setAdjustments(batchAdjustments);
      } catch (error) {
        console.error('Error loading deposit details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [open, deposit]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const getMethodBadgeColor = (method) => {
    const colors = {
      cash: 'bg-green-100 text-green-800',
      cheque: 'bg-orange-100 text-orange-800',
      debit: 'bg-purple-100 text-purple-800',
      credit_card: 'bg-blue-100 text-blue-800',
      e_transfer: 'bg-indigo-100 text-indigo-800'
    };
    return colors[method] || 'bg-gray-100 text-gray-800';
  };

  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAdjustments = adjustments.reduce((sum, a) => sum + (a.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Deposit Details
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Deposit Summary Card */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Date</p>
                      <p className="font-medium">{formatDate(deposit?.transaction_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Building className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Bank Account</p>
                      <p className="font-medium">{bankAccountName || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Reference</p>
                      <p className="font-medium text-sm">{deposit?.reference || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Total Amount</p>
                      <p className="font-bold text-green-600">${(deposit?.credit_amount || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payments Table */}
            {payments.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Payments ({payments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.customerName}</TableCell>
                          <TableCell>
                            <Badge className={getMethodBadgeColor(payment.payment_method)}>
                              {payment.payment_method?.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {payment.documentReference}
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(payment.payment_date)}</TableCell>
                          <TableCell className="text-right font-medium">${(payment.amount || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end p-3 border-t bg-slate-50">
                    <span className="font-semibold">Subtotal: ${totalPayments.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Adjustments Table */}
            {adjustments.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    Adjustments ({adjustments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell>
                            <Badge className={adj.type === 'overage' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {adj.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{adj.description || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-600">{adj.reference || '-'}</TableCell>
                          <TableCell className="text-sm">{formatDate(adj.adjustment_date)}</TableCell>
                          <TableCell className={`text-right font-medium ${adj.amount < 0 ? 'text-red-600' : ''}`}>
                            ${(adj.amount || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end p-3 border-t bg-slate-50">
                    <span className="font-semibold">Subtotal: ${totalAdjustments.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {payments.length === 0 && adjustments.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No payment or adjustment details found for this deposit.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}