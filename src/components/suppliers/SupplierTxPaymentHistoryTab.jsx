import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, FileText, Loader2, Trash2 } from 'lucide-react';
import { parseSupplierPaymentInvoices } from './utils/parseSupplierPaymentInvoices';

export default function SupplierTxPaymentHistoryTab({ loading, payments, expandedPayments, togglePaymentExpansion, safeFormatDate, handlePrintCheque, handleCancelPayment, sourceMap, isLockedByOtherUser, lockAcquired }) {
  return (
    <Card>
      <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12"><FileText className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-500 mb-4" /><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Payments</h3><p className="text-slate-600 dark:text-slate-400">No payment history found for this supplier.</p></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800">
                  <TableHead className="font-semibold w-8"></TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Method</TableHead>
                  <TableHead className="font-semibold">Reference</TableHead>
                  <TableHead className="font-semibold">Source</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const isExpanded = expandedPayments.has(payment.id);
                  const appliedInvoices = parseSupplierPaymentInvoices(payment.invoice_number, payment.amount);
                  return (
                    <React.Fragment key={payment.id}>
                      <TableRow className={`hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer ${payments.indexOf(payment) % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}`} onClick={() => togglePaymentExpansion(payment.id)}>
                        <TableCell className="w-8">{appliedInvoices.length > 0 && (isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />)}</TableCell>
                        <TableCell>{safeFormatDate(payment.payment_date, 'MMM dd, yyyy', true)}</TableCell>
                        <TableCell>
                          {payment.payment_method === 'Cheque' && payment.cheque_number ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handlePrintCheque(payment.cheque_number); }} className="font-medium text-blue-600 hover:text-blue-800 hover:underline bg-transparent border-none p-0 cursor-pointer">{payment.payment_method}</button>
                          ) : <span className="capitalize">{payment.payment_method?.replace(/_/g, ' ') || 'N/A'}</span>}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">{payment.cheque_number || payment.bank_transaction_id || '-'}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">{payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque' ? (payment.bank_account_name || '-') : (sourceMap[payment.source] || '-')}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">${payment.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={(e) => { e.stopPropagation(); handleCancelPayment(payment); }} disabled={isLockedByOtherUser || !lockAcquired} title="Cancel Payment"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && appliedInvoices.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-slate-50 dark:bg-slate-800 p-0">
                            <div className="p-4 pl-12">
                              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Invoices Paid:</h4>
                              <div className="bg-white dark:bg-slate-900 rounded border dark:border-slate-700">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-100 dark:bg-slate-700"><TableHead className="text-xs">Invoice Number</TableHead><TableHead className="text-xs text-right">Amount Applied</TableHead></TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {appliedInvoices.map((inv, idx) => (
                                      <TableRow key={idx} className="text-sm"><TableCell>{inv.invoice_number}</TableCell><TableCell className="text-right font-medium">${(typeof inv.amount_applied === 'number' ? inv.amount_applied : parseFloat(inv.amount_applied || 0)).toFixed(2)}</TableCell></TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {isExpanded && appliedInvoices.length === 0 && payment.invoice_number === 'On Account' && (
                        <TableRow><TableCell colSpan={7} className="bg-slate-50 dark:bg-slate-800 p-0"><div className="p-4 pl-12 text-sm text-slate-600 dark:text-slate-400">This payment was applied "On Account" and not allocated to specific invoices.</div></TableCell></TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}