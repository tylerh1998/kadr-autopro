import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Trash2, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import GLAccountCombobox from './GLAccountCombobox';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Check } from 'lucide-react';

const getInvoiceKey = (invoice) => `${invoice.supplier_id}_${invoice.invoice_number}_${invoice.invoice_date}`;
const truncateText = (value, max = 25) => {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const getLineCharge = (line) => parseFloat(line.charge ?? line.purchase_amount ?? 0) || 0;
const getLineGst = (line) => parseFloat(line.gst ?? line.gst_amount ?? 0) || 0;
const getLineTotal = (line) => {
  const explicit = parseFloat(line.line_total);
  if (!Number.isNaN(explicit)) return explicit;
  return getLineCharge(line) + getLineGst(line);
};

export default function SupplierTxInvoiceSummaryTab({
  conceptualInvoices,
  invoiceLines,
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
  handleToggleGstOverride,
  handleAddSummaryLineBelow,
  handleEditLineClick,
  isLineLocked,
}) {
  const [draftDates, setDraftDates] = React.useState({});
  const [draftDescriptions, setDraftDescriptions] = React.useState({});
  const [draftInvoiceNumbers, setDraftInvoiceNumbers] = React.useState({});
  const [draftCharges, setDraftCharges] = React.useState({});
  const [draftGsts, setDraftGsts] = React.useState({});
  const [draftGlAccounts, setDraftGlAccounts] = React.useState({});
  const isReadOnly = isLockedByOtherUser || !lockAcquired;

  React.useEffect(() => {
    setDraftDates((prev) => {
      const next = { ...prev };
      invoiceLines.forEach((line) => {
        next[line.id] = formatDateForInput(line.invoice_date);
      });
      return next;
    });
  }, [invoiceLines, formatDateForInput]);

  React.useEffect(() => {
    const activeIds = new Set(invoiceLines.map((line) => line.id));

    const syncDraftMap = (prev, getValue) => {
      const next = { ...prev };
      invoiceLines.forEach((line) => {
        next[line.id] = getValue(line);
      });
      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) delete next[id];
      });
      return next;
    };

    setDraftDescriptions((prev) => syncDraftMap(prev, (line) => line.description || ''));
    setDraftInvoiceNumbers((prev) => syncDraftMap(prev, (line) => line.invoice_number || ''));
    setDraftCharges((prev) => syncDraftMap(prev, (line) => line.charge ?? ''));
    setDraftGsts((prev) => syncDraftMap(prev, (line) => line.gst ?? ''));
    setDraftGlAccounts((prev) => syncDraftMap(prev, (line) => line.gl_account ? String(line.gl_account) : ''));
  }, [invoiceLines]);

  const displayLinesByInvoice = React.useMemo(() => {
    return conceptualInvoices.reduce((acc, invoice) => {
      const currentAccordionKey = getInvoiceKey(invoice);
      acc[currentAccordionKey] = invoiceLines.filter((line) => {
        if (line.isNew && line.conceptual_invoice_key === currentAccordionKey) {
          return true;
        }
        return line.invoice_number === invoice.invoice_number && line.invoice_date === invoice.invoice_date;
      });
      return acc;
    }, {});
  }, [conceptualInvoices, invoiceLines]);

  const totals = React.useMemo(() => conceptualInvoices.reduce((acc, inv) => {
    acc.subtotal += inv.subtotal || 0;
    acc.tax_amount += inv.tax_amount || 0;
    acc.total_amount += inv.total_amount || 0;
    acc.amount_paid += inv.amount_paid || 0;
    acc.balance_due += inv.balance_due || 0;
    return acc;
  }, { subtotal: 0, tax_amount: 0, total_amount: 0, amount_paid: 0, balance_due: 0 }), [conceptualInvoices]);

  const handleDescriptionBlur = (line) => {
    const nextDescription = draftDescriptions[line.id] ?? '';
    if (nextDescription !== (line.description || '')) {
      handleLineChange(line.id, 'description', nextDescription);
    }
  };

  const handleInvoiceNumberBlur = (line) => {
    const nextInvoiceNumber = draftInvoiceNumbers[line.id] ?? '';
    if (nextInvoiceNumber !== (line.invoice_number || '')) {
      handleLineChange(line.id, 'invoice_number', nextInvoiceNumber);
    }
  };

  const handleChargeBlur = (line) => {
    const nextCharge = draftCharges[line.id] ?? '';
    const hasChanged = String(nextCharge) !== String(line.charge ?? '');
    if (!hasChanged) return;
    handleValueBlur(line.id, 'charge', nextCharge);
  };

  const handleGstBlur = (line) => {
    const nextGst = draftGsts[line.id] ?? '';
    const hasChanged = String(nextGst) !== String(line.gst ?? '');
    if (!hasChanged) return;
    handleValueBlur(line.id, 'gst', nextGst);
  };

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

        <div className="divide-y divide-slate-200 summary-screen-list relative">
          {conceptualInvoices.length > 0 ? conceptualInvoices.map((invoice, index) => {
            const invoiceKey = getInvoiceKey(invoice);
            const isExpanded = expandedInvoices[invoiceKey];
            const displayLines = displayLinesByInvoice[invoiceKey] || [];
            return (
              <div key={invoiceKey} className={index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                <div className="flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => toggleInvoiceExpansion(invoiceKey)}>
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-slate-400 dark:text-slate-500">{isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}</div>
                    <div className="flex-1 grid grid-cols-8 gap-4">
                      <div><p className="text-sm text-slate-500 dark:text-slate-400">Invoice #</p><p className="font-extrabold text-xl text-slate-900 dark:text-slate-100 invoice-summary-print-text">{invoice.invoice_number}</p></div>
                      <div><p className="text-sm text-slate-500 dark:text-slate-400">Date</p><p className="font-medium text-slate-900 dark:text-slate-100">{safeFormatDate(invoice.invoice_date, 'MMM dd, yyyy')}</p></div>
                      <div><p className="text-sm text-slate-500 dark:text-slate-400">Lines</p><p className="font-medium text-slate-900 dark:text-slate-100">{invoice.line_count}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500 dark:text-slate-400">Total Charge</p><p className="font-medium text-slate-900 dark:text-slate-100">${invoice.subtotal.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500 dark:text-slate-400">Total GST</p><p className="font-medium text-slate-900 dark:text-slate-100">${invoice.tax_amount.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500 dark:text-slate-400">Total Amount</p><p className="font-extrabold text-xl text-slate-900 dark:text-slate-100 invoice-summary-print-text">${invoice.total_amount.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500 dark:text-slate-400">Payments</p><p className="font-medium text-green-600 dark:text-green-400">${invoice.amount_paid.toFixed(2)}</p></div>
                      <div className="text-right"><p className="text-sm text-slate-500 dark:text-slate-400">Balance</p><p className="font-bold text-red-600 dark:text-red-400">${invoice.balance_due.toFixed(2)}</p></div>
                    </div>
                  </div>
                </div>
                {isExpanded && displayLines.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100 dark:bg-slate-700">
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
                          {displayLines.map((line, idx) => {
                            const locked = isLineLocked(line);
                            const hasInventoryItem = !!line.inventory_item_id;
                            const isProtectedLine = locked || hasInventoryItem;
                            const disabled = isReadOnly || isProtectedLine;
                            const gstEditable = !isReadOnly && !locked && !!line.gst_override;
                            return (
                              <ContextMenu key={line.id}>
                                <ContextMenuTrigger asChild>
                                  <TableRow key={line.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                                    <TableCell>
                                  <Input
                                    value={draftInvoiceNumbers[line.id] ?? line.invoice_number ?? ''}
                                    onChange={(e) => setDraftInvoiceNumbers((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                    onBlur={() => !disabled && handleInvoiceNumberBlur(line)}
                                    readOnly={disabled}
                                    className={disabled ? 'cursor-not-allowed bg-white dark:bg-slate-800 dark:text-slate-100' : 'bg-white dark:bg-slate-800 dark:text-slate-100'}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={draftDates[line.id] ?? formatDateForInput(line.invoice_date)}
                                    onChange={(e) => setDraftDates((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                    onBlur={() => !disabled && handleDateBlur(line.id, draftDates[line.id] ?? formatDateForInput(line.invoice_date))}
                                    readOnly={disabled}
                                    className={disabled ? 'cursor-not-allowed bg-white dark:bg-slate-800 dark:text-slate-100' : 'bg-white dark:bg-slate-800 dark:text-slate-100'}
                                  />
                                  {line.dateError ? <p className="mt-1 text-xs text-red-600">{line.dateError}</p> : null}
                                </TableCell>
                                <TableCell>
                                  <Textarea
                                    value={draftDescriptions[line.id] ?? line.description ?? ''}
                                    onChange={(e) => setDraftDescriptions((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                    onBlur={() => !disabled && handleDescriptionBlur(line)}
                                    readOnly={disabled}
                                    className={disabled ? 'min-h-[60px] resize-y cursor-not-allowed bg-white dark:bg-slate-800 dark:text-slate-100 leading-snug' : 'min-h-[60px] resize-y bg-white dark:bg-slate-800 dark:text-slate-100 leading-snug'}
                                  />
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const currentGlValue = draftGlAccounts[line.id] ?? (line.gl_account ? String(line.gl_account) : '');
                                    const account = currentGlValue
                                      ? chartOfAccounts.find(acc => String(acc.account_number) === String(currentGlValue))
                                      : null;
                                    const fullGlLabel = account ? `${account.account_number} - ${account.account_name}` : currentGlValue;
                                    const truncatedGlLabel = truncateText(fullGlLabel, 25);

                                    return (
                                      <GLAccountCombobox
                                        chartOfAccounts={chartOfAccounts}
                                        currentValue={currentGlValue}
                                        selectedLabel={truncatedGlLabel}
                                        onChange={(value) => {
                                          setDraftGlAccounts((prev) => ({ ...prev, [line.id]: value }));
                                          handleGlAccountChange(line, value);
                                        }}
                                        disabled={isReadOnly || hasInventoryItem || locked}
                                        placeholder="Select GL"
                                        className={`${isReadOnly || hasInventoryItem ? 'cursor-not-allowed bg-white dark:bg-slate-800' : 'bg-white dark:bg-slate-800'}`}
                                      />
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    value={draftCharges[line.id] ?? line.charge ?? ''}
                                    onChange={(e) => setDraftCharges((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                    onBlur={() => !disabled && handleChargeBlur(line)}
                                    readOnly={disabled}
                                    className={disabled ? 'cursor-not-allowed bg-white dark:bg-slate-800 dark:text-slate-100 text-right' : 'bg-white dark:bg-slate-800 dark:text-slate-100 text-right'}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    value={draftGsts[line.id] ?? line.gst ?? ''}
                                    onChange={(e) => gstEditable && setDraftGsts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                    onBlur={() => gstEditable && handleGstBlur(line)}
                                    readOnly={!gstEditable}
                                    className={gstEditable ? 'bg-white dark:bg-slate-800 dark:text-slate-100 text-right' : 'cursor-not-allowed bg-white dark:bg-slate-800 dark:text-slate-100 text-right'}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold">${getLineTotal(line).toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex min-h-9 min-w-9 items-center justify-center cursor-context-menu">
                                    {isProtectedLine ? (
                                      <div className="inline-flex items-center justify-center w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-md">
                                        <Lock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteLine(line.id)}
                                        disabled={isReadOnly}
                                      >
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                  </TableRow>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem
                                    onClick={() => handleEditLineClick(line)}
                                    disabled={isReadOnly}
                                  >
                                    Edit Line
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onClick={() => handleToggleGstOverride(line.id)}
                                    disabled={isReadOnly || locked}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span>Adjust GST</span>
                                      {!!line.gst_override && <Check className="w-4 h-4 ml-2" />}
                                    </div>
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onClick={() => handleAddSummaryLineBelow(line)}
                                    disabled={isLockedByOtherUser || !lockAcquired}
                                  >
                                    Add Line
                                  </ContextMenuItem>
                                  {!isProtectedLine && (
                                    <ContextMenuItem
                                      onClick={() => handleDeleteLine(line.id)}
                                      disabled={isReadOnly}
                                      className="text-red-600"
                                    >
                                      Delete Line
                                    </ContextMenuItem>
                                  )}
                                </ContextMenuContent>
                              </ContextMenu>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                {isExpanded && displayLines.length === 0 && <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"><p className="text-sm text-slate-500 dark:text-slate-400 text-center">No invoice lines found.</p></div>}
              </div>
            );
          }) : <div className="p-12 text-center"><p className="text-slate-500 dark:text-slate-400">No invoices found in the selected date range</p></div>}
          {conceptualInvoices.length > 0 && (
            <div className="invoice-summary-total-row p-4 bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex-1 grid grid-cols-8 gap-4">
                  <div className="col-span-3 text-right font-bold">Totals:</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.subtotal.toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.tax_amount.toFixed(2)}</div>
                  <div className="text-right font-bold text-xs print:text-[10px]">${totals.total_amount.toFixed(2)}</div>
                  <div className="text-right font-bold text-green-600 dark:text-green-400 text-xs print:text-[10px] print:text-black">${totals.amount_paid.toFixed(2)}</div>
                  <div className="text-right font-bold text-red-600 dark:text-red-400 text-xs print:text-[10px] print:text-black">${totals.balance_due.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}