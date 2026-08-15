import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ThreeMonthAPReport({ data }) {
  if (!data) return null;

  const { months, supplierRows, summary } = data;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(value || 0);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Three Month Accounts Payable Summary</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Supplier AP totals (charge + GST) based on invoice dates, excluding payments.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800 border-b-2">
                <TableHead className="font-bold text-slate-900 dark:text-slate-100 w-1/3">Supplier Name</TableHead>
                {months.map((month) => (
                  <TableHead key={month.key} className="text-right font-bold text-slate-900 dark:text-slate-100">
                    {month.label}
                  </TableHead>
                ))}
                <TableHead className="text-right font-bold text-slate-900 dark:text-slate-100 bg-blue-50/50 dark:bg-blue-950/30">Average</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No supplier invoices found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                supplierRows.map((row) => (
                  <TableRow key={row.supplier_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.supplier_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.month1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.month2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.month3)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold bg-blue-50/30 dark:bg-blue-950/20">
                      {formatCurrency(row.average)}
                    </TableCell>
                  </TableRow>
                ))
              )}

              {/* Summary Row */}
              <TableRow className="border-t-2 bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-800">
                <TableCell className="text-slate-900 dark:text-slate-100">Total Accounts Payable</TableCell>
                <TableCell className="text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(summary.month1)}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(summary.month2)}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(summary.month3)}</TableCell>
                <TableCell className="text-right tabular-nums text-blue-900 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30">
                  {formatCurrency(summary.average)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
