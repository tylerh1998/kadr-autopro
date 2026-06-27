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
  if (value > 0) return 'text-emerald-700';
  if (value < 0) return 'text-red-700';
  return 'text-slate-700';
};

const ReportRows = ({ rows }) => rows.map((row) => (
  <TableRow key={row.account_number}>
    <TableCell className="font-medium text-slate-800">{row.account_number} - {row.account_name}</TableCell>
    <TableCell className="text-right tabular-nums">{formatCurrency(row.month1)}</TableCell>
    <TableCell className="text-right tabular-nums">{formatCurrency(row.month2)}</TableCell>
    <TableCell className="text-right tabular-nums">{formatCurrency(row.month3)}</TableCell>
    <TableCell className={`text-right font-semibold tabular-nums ${varianceClassName(row.variance_pct)}`}>{formatVariance(row.variance_pct)}</TableCell>
  </TableRow>
));

const SummaryRow = ({ label, values, emphasized = false }) => (
  <TableRow className={emphasized ? 'bg-slate-100' : 'bg-slate-50'}>
    <TableCell className="font-semibold text-slate-900">{label}</TableCell>
    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(values.month1)}</TableCell>
    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(values.month2)}</TableCell>
    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(values.month3)}</TableCell>
    <TableCell className={`text-right font-semibold tabular-nums ${varianceClassName(values.variance_pct)}`}>{formatVariance(values.variance_pct)}</TableCell>
  </TableRow>
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
            <TableRow className="bg-slate-100 hover:bg-slate-100">
              <TableCell colSpan={5} className="font-semibold uppercase tracking-wide text-slate-700">Revenue</TableCell>
            </TableRow>
            <ReportRows rows={revenueRows} />
            <SummaryRow label="Total Revenue" values={summary.totalRevenue} />
            <TableRow className="bg-slate-100 hover:bg-slate-100">
              <TableCell colSpan={5} className="font-semibold uppercase tracking-wide text-slate-700">Expenses</TableCell>
            </TableRow>
            <ReportRows rows={expenseRows} />
            <SummaryRow label="Total Expenses" values={summary.totalExpenses} />
            <SummaryRow label="Net Income" values={summary.netIncome} emphasized />
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}