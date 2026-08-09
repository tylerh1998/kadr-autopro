import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

// Read-only reconciliation bucket renderer, shared by all 3 ReconcileSupplier.jsx sections.
// `items` shape (normalized by the caller): {
//   key, invoice_number, invoice_date, subtotal, tax_amount, total_amount,
//   line_count, lines (optional detail array, omit to disable the expand affordance),
//   dateMismatch (optional), statementDate (optional, shown when dateMismatch is true)
// }
export default function ReconcileInvoiceGroup({
  title,
  items,
  accentClass = 'text-slate-900 dark:text-slate-100',
  selectable = false,
  selectedKeys = new Set(),
  onToggleSelect = () => {},
  safeFormatDate,
  emptyMessage = 'No invoices in this group.',
}) {
  const [expanded, setExpanded] = React.useState({});
  const toggleExpanded = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const total = React.useMemo(
    () => (items || []).reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0),
    [items]
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className={`text-lg font-bold ${accentClass}`}>{title} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({(items || []).length})</span></h2>
          <p className={`text-lg font-bold ${accentClass}`}>${total.toFixed(2)}</p>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {(items || []).length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</div>
          ) : (
            (items || []).map((item, index) => {
              const isExpandable = Array.isArray(item.lines) && item.lines.length > 0;
              const isExpanded = !!expanded[item.key];
              return (
                <div key={item.key} className={index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                  <div
                    className={`flex items-center gap-4 p-4 ${isExpandable ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50' : ''} transition-colors`}
                    onClick={() => isExpandable && toggleExpanded(item.key)}
                  >
                    {selectable && (
                      <Checkbox
                        checked={!!selectedKeys?.has(item.key)}
                        onCheckedChange={() => onToggleSelect?.(item.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="text-slate-400 dark:text-slate-500 w-5">
                      {isExpandable ? (isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />) : null}
                    </div>
                    <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Invoice #</p>
                        <p className="font-extrabold text-lg text-slate-900 dark:text-slate-100">{item.invoice_number || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Date</p>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{safeFormatDate ? safeFormatDate(item.invoice_date, 'MMM dd, yyyy') : (item.invoice_date || 'N/A')}</p>
                        {item.dateMismatch && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> Statement: {safeFormatDate ? safeFormatDate(item.statementDate, 'MMM dd, yyyy') : item.statementDate}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Subtotal</p>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item.subtotal != null ? `$${item.subtotal.toFixed(2)}` : '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500 dark:text-slate-400">GST</p>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item.tax_amount != null ? `$${item.tax_amount.toFixed(2)}` : '—'}</p>
                      </div>
                      <div className="text-right col-span-2">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Total</p>
                        <p className="font-extrabold text-lg text-slate-900 dark:text-slate-100">${(parseFloat(item.total_amount) || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  {isExpanded && isExpandable && (
                    <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-100 dark:bg-slate-700">
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Charge</TableHead>
                              <TableHead className="text-right">GST</TableHead>
                              <TableHead className="text-right">Line Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {item.lines.map((line) => (
                              <TableRow key={line.id}>
                                <TableCell>{line.description}</TableCell>
                                <TableCell className="text-right">${(parseFloat(line.charge) || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">${(parseFloat(line.gst) || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right font-semibold">${(parseFloat(line.line_total) || 0).toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
