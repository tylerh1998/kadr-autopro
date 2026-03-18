import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function SupplierTxInvoiceSummaryTab({ conceptualInvoices, expandedInvoices, toggleInvoiceExpansion, safeFormatDate }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="summary-print-table">
          <thead>
            <tr>
              <th>Invoice #</th><th>Date</th><th>Lines</th><th>Total Charge</th><th>Total GST</th><th>Total Amount</th><th>Payments</th><th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {conceptualInvoices.map((invoice) => (
              <tr key={`${invoice.supplier_id}_${invoice.invoice_number}_${invoice.invoice_date}_print`}>
                <td>{invoice.invoice_number}</td>
                <td>{safeFormatDate(invoice.invoice_date, 'MMM dd, yyyy')}</td>
                <td>{invoice.line_count}</td>
                <td>${invoice.subtotal.toFixed(2)}</td>
                <td>${invoice.tax_amount.toFixed(2)}</td>
                <td>${invoice.total_amount.toFixed(2)}</td>
                <td>${invoice.amount_paid.toFixed(2)}</td>
                <td>${invoice.balance_due.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3} className="text-right">Totals:</th>
              <th>${conceptualInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0).toFixed(2)}</th>
              <th>${conceptualInvoices.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0).toFixed(2)}</th>
              <th>${conceptualInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toFixed(2)}</th>
              <th>${conceptualInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0).toFixed(2)}</th>
              <th>${conceptualInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0).toFixed(2)}</th>
            </tr>
          </tfoot>
        </table>

        <div className="divide-y divide-slate-200 summary-screen-list">
          {conceptualInvoices.length > 0 ? conceptualInvoices.map((invoice, index) => {
            const invoiceKey = `${invoice.supplier_id}_${invoice.invoice_number}_${invoice.invoice_date}`;
            const isExpanded = expandedInvoices[invoiceKey];
            return (
              <div key={invoiceKey} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <div className="flex items-center justify-between p-4 hover:bg-slate-100 cursor-pointer transition-colors" onClick={() => toggleInvoiceExpansion(invoiceKey)}>
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-slate-400">{isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}</div>
                    <div className="flex-1 grid grid-cols-8 gap-4">
                      <div><p className="text-sm text-slate-500">Invoice #</p><p className="font-extrabold text-xl text-slate-900 invoice-summary-print-text">{invoice.invoice_number}</p></div>
                      <div><p className="text-sm text-slate-500">Date</p><p className="font-medium text-slate-900">{safeFormatDate(invoice.invoice_date, 'MMM dd, yyyy')}</p></div>
                      <div><p className="text-sm text-slate-500">Lines</p><p className="font-medium text-slate-900">{invoice.line_count}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500">Total Charge</p><p className="font-medium text-slate-900">${invoice.subtotal.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500">Total GST</p><p className="font-medium text-slate-900">${invoice.tax_amount.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500">Total Amount</p><p className="font-extrabold text-xl text-slate-900 invoice-summary-print-text">${invoice.total_amount.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500">Payments</p><p className="font-medium text-green-600">${invoice.amount_paid.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500">Balance</p><p className="font-bold text-red-600">${invoice.balance_due.toFixed(2)}</p></div>
                    </div>
                  </div>
                </div>
                {isExpanded && invoice.lines && invoice.lines.length > 0 && (
                  <div className="border-t border-slate-200 bg-slate-50">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100">
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[150px] text-right">Charge</TableHead>
                            <TableHead className="w-[150px] text-right">GST</TableHead>
                            <TableHead className="w-[150px] text-right">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.lines.map((line, idx) => (
                            <TableRow key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <TableCell>{line.description || '-'}</TableCell>
                              <TableCell className="text-right">${parseFloat(line.purchase_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">${parseFloat(line.gst_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold">${(parseFloat(line.purchase_amount || 0) + parseFloat(line.gst_amount || 0)).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                {isExpanded && (!invoice.lines || invoice.lines.length === 0) && <div className="p-4 border-t border-slate-200 bg-slate-50"><p className="text-sm text-slate-500 text-center">No invoice lines found.</p></div>}
              </div>
            );
          }) : <div className="p-12 text-center"><p className="text-slate-500">No invoices found in the selected date range</p></div>}
          {conceptualInvoices.length > 0 && (
            <div className="invoice-summary-total-row p-4 bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 grid grid-cols-8 gap-4">
                  <div className="col-span-3 text-right font-bold">Totals:</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${conceptualInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0).toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${conceptualInvoices.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0).toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${conceptualInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toFixed(2)}</div>
                  <div className="text-right font-bold text-green-600 text-xs print:text-[10px] print:text-black">${conceptualInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0).toFixed(2)}</div>
                  <div className="text-right font-bold text-red-600 text-xs print:text-[10px] print:text-black">${conceptualInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}