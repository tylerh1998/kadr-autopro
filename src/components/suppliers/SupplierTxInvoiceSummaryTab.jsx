import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const getInvoiceKey = (invoice) => `${invoice.supplier_id}_${invoice.invoice_number}_${invoice.invoice_date}`;
const getLineCharge = (line) => parseFloat(line.charge ?? line.purchase_amount ?? 0) || 0;
const getLineGst = (line) => parseFloat(line.gst ?? line.gst_amount ?? 0) || 0;
const getLineTotal = (line) => {
  const explicit = parseFloat(line.line_total);
  if (!Number.isNaN(explicit)) return explicit;
  return getLineCharge(line) + getLineGst(line);
};

export default function SupplierTxInvoiceSummaryTab({
  conceptualInvoices,
  expandedInvoices,
  toggleInvoiceExpansion,
  safeFormatDate,
  isLockedByOtherUser,
  lockAcquired,
  chartOfAccounts,
  handleLineChange,
  handleDateBlur,
  formatDateForInput,
  handleValueBlur,
  handleGlAccountChange,
  handleDeleteLine,
  isLineLocked,
}) {
  const isReadOnly = isLockedByOtherUser || !lockAcquired;
  const totals = conceptualInvoices.reduce((acc, inv) => {
    acc.subtotal += inv.subtotal || 0;
    acc.tax_amount += inv.tax_amount || 0;
    acc.total_amount += inv.total_amount || 0;
    acc.amount_paid += inv.amount_paid || 0;
    acc.balance_due += inv.balance_due || 0;
    return acc;
  }, { subtotal: 0, tax_amount: 0, total_amount: 0, amount_paid: 0, balance_due: 0 });

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
              <tr key={`${getInvoiceKey(invoice)}_print`}>
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
              <th>${totals.subtotal.toFixed(2)}</th>
              <th>${totals.tax_amount.toFixed(2)}</th>
              <th>${totals.total_amount.toFixed(2)}</th>
              <th>${totals.amount_paid.toFixed(2)}</th>
              <th>${totals.balance_due.toFixed(2)}</th>
            </tr>
          </tfoot>
        </table>

        <div className="divide-y divide-slate-200 summary-screen-list">
          {conceptualInvoices.length > 0 ? conceptualInvoices.map((invoice, index) => {
            const invoiceKey = getInvoiceKey(invoice);
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
                            <TableHead className="w-[160px]">Invoice #</TableHead>
                            <TableHead className="w-[140px]">Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[180px]">GL</TableHead>
                            <TableHead className="w-[130px] text-right">Charge</TableHead>
                            <TableHead className="w-[130px] text-right">GST</TableHead>
                            <TableHead className="w-[130px] text-right">Line Total</TableHead>
                            <TableHead className="w-[72px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.lines.map((line, idx) => {
                            const locked = isLineLocked(line);
                            const disabled = isReadOnly || locked || line.inventory;
                            return (
                              <TableRow key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <TableCell>
                                  <Input
                                    value={line.invoice_number || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleLineChange(line.id, 'invoice_number', e.target.value)}
                                    disabled={disabled}
                                    className="bg-white"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={formatDateForInput(line.invoice_date)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleLineChange(line.id, 'invoice_date', e.target.value)}
                                    onBlur={(e) => handleDateBlur(line.id, e.target.value)}
                                    disabled={disabled}
                                    className="bg-white"
                                  />
                                  {line.dateError ? <p className="mt-1 text-xs text-red-600">{line.dateError}</p> : null}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={line.description || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                                    disabled={disabled}
                                    className="bg-white"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={line.gl_account ? String(line.gl_account) : ''}
                                    onValueChange={(value) => handleGlAccountChange(line, value)}
                                    disabled={isReadOnly || locked || line.inventory}
                                  >
                                    <SelectTrigger className="bg-white">
                                      <SelectValue placeholder="Select GL" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {chartOfAccounts.map((account) => (
                                        <SelectItem key={account.id || account.account_number} value={String(account.account_number)}>
                                          {account.account_number} - {account.account_name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    value={line.charge ?? ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleLineChange(line.id, 'charge', e.target.value)}
                                    onBlur={(e) => handleValueBlur(line.id, 'charge', e.target.value)}
                                    disabled={isReadOnly || locked}
                                    className="bg-white text-right"
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    value={line.gst ?? ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleLineChange(line.id, 'gst', e.target.value)}
                                    onBlur={(e) => handleValueBlur(line.id, 'gst', e.target.value)}
                                    disabled={isReadOnly || locked || (line.inventory && !line.gst_override)}
                                    className="bg-white text-right"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold">${getLineTotal(line).toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteLine(line.id);
                                    }}
                                    disabled={isReadOnly || locked || line.inventory}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
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
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.subtotal.toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.tax_amount.toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.total_amount.toFixed(2)}</div>
                  <div className="text-right font-bold text-green-600 text-xs print:text-[10px] print:text-black">${totals.amount_paid.toFixed(2)}</div>
                  <div className="text-right font-bold text-red-600 text-xs print:text-[10px] print:text-black">${totals.balance_due.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}