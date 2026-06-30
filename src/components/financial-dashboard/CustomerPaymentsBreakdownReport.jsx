import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, formatCurrency } from './financialDashboardUtils';

export default function CustomerPaymentsBreakdownReport({ data }) {
  const items = data?.items || [];
  const totalAmount = data?.totalAmount || 0;
  const totalCount = data?.totalCount || 0;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Payments Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center text-slate-600">
          No customer payments found for the selected period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Payments Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Payments</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</div>
          </div>
          <div className="rounded-lg border bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment Count</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{totalCount}</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <PieChart>
            <Pie
              data={items}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              outerRadius={110}
              fill="#8884d8"
              dataKey="amount"
            >
              {items.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.paymentMethod} className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-1 h-4 w-4 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.paymentMethod}</div>
                  <div className="text-xs text-slate-500">{item.count} payment{item.count === 1 ? '' : 's'} · {item.percentage.toFixed(1)}% of total</div>
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}