import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from './financialDashboardUtils';

const formatVariance = (value) => {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
};

const varianceClassName = (value) => {
  if (value === null || value === undefined) return 'text-slate-400';
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400';
  if (value < 0) return 'text-red-700 dark:text-red-400';
  return 'text-slate-700 dark:text-slate-300';
};

const AccountRow = ({ row, level = 0 }) => (
  <>
    <TableRow>
      <TableCell className="text-slate-800 dark:text-slate-200">
        <div style={{ paddingLeft: `${level * 24}px` }}>
          <span className={level === 0 ? 'font-semibold' : 'font-medium'}>{row.account_number}</span>
          <span className={`ml-2 ${row.is_synthetic ? 'italic text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>{row.account_name}</span>
        </div>
      </TableCell>
      <TableCell className={`text-right tabular-nums ${level === 0 ? 'font-semibold' : ''}`}>{formatCurrency(row.month1)}</TableCell>
      <TableCell className={`text-right tabular-nums ${level === 0 ? 'font-semibold' : ''}`}>{formatCurrency(row.month2)}</TableCell>
      <TableCell className={`text-right tabular-nums ${level === 0 ? 'font-semibold' : ''}`}>{formatCurrency(row.month3)}</TableCell>
      <TableCell className={`text-right font-semibold tabular-nums ${varianceClassName(row.variance_pct)}`}>{formatVariance(row.variance_pct)}</TableCell>
    </TableRow>
    {row.children?.map((child) => (
      <AccountRow
        key={child.is_synthetic ? `${child.account_number}-synthetic-${level}` : `${child.account_number}-${level}`}
        row={child}
        level={level + 1}
      />
    ))}
  </>
);

const ReportSection = ({ title, rows, summaryRow, summaryLabel }) => (
  <>
    <TableRow className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800">
      <TableCell colSpan={5} className="font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">{title}</TableCell>
    </TableRow>
    {rows.map((row) => (
      <AccountRow key={row.account_number} row={row} />
    ))}
    <TableRow className="bg-slate-50 dark:bg-slate-800/60">
      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{summaryLabel}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summaryRow.month1)}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summaryRow.month2)}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summaryRow.month3)}</TableCell>
      <TableCell className={`text-right font-semibold tabular-nums ${varianceClassName(summaryRow.variance_pct)}`}>{formatVariance(summaryRow.variance_pct)}</TableCell>
    </TableRow>
  </>
);

export default function ThreeMonthPLReport({ data }) {
  const { months, revenueRows, expenseRows, summary } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Three Month P&amp;L Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account # and Name</TableHead>
              <TableHead className="text-right">{months[0]?.label}</TableHead>
              <TableHead className="text-right">{months[1]?.label}</TableHead>
              <TableHead className="text-right">{months[2]?.label}</TableHead>
              <TableHead className="text-right">Variance %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <ReportSection
              title="Revenue"
              rows={revenueRows}
              summaryRow={summary.totalRevenue}
              summaryLabel="Total Revenue"
            />
            <ReportSection
              title="Expenses"
              rows={expenseRows}
              summaryRow={summary.totalExpenses}
              summaryLabel="Total Expenses"
            />
            <TableRow className="bg-slate-100 dark:bg-slate-800">
              <TableCell className="font-semibold text-slate-900 dark:text-slate-100">Net Income</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summary.netIncome.month1)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summary.netIncome.month2)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summary.netIncome.month3)}</TableCell>
              <TableCell className={`text-right font-semibold tabular-nums ${varianceClassName(summary.netIncome.variance_pct)}`}>{formatVariance(summary.netIncome.variance_pct)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}