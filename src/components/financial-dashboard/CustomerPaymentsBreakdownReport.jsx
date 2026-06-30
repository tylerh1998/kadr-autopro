import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, formatCurrency } from './financialDashboardUtils';

export default function CustomerPaymentsBreakdownReport({ data }) {
  const items = data?.items || [];
  const chartItems = items.filter((item) => !item.excludeFromTotals);
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

        {chartItems.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={chartItems}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                outerRadius={110}
                fill="#8884d8"
                dataKey="amount"
              >
                {chartItems.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[340px] items-center justify-center rounded-lg border border-dashed text-sm text-slate-500">
            No received payment methods found for the selected period.
          </div>
        )}

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.paymentMethod} className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-1 h-4 w-4 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.paymentMethod}</div>
                  <div className="text-xs text-slate-500">
                    {item.excludeFromTotals
                      ? `${item.count} AR charge${item.count === 1 ? '' : 's'} · excluded from totals and chart`
                      : `${item.count} payment${item.count === 1 ? '' : 's'} · ${item.percentage.toFixed(1)}% of total`}
                  </div>
                  {item.receivedOnAccounts !== null && (
                    <div className="mt-2 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-4">
                        <span>Method Total</span>
                        <span className="font-medium text-slate-900">{formatCurrency(item.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Received On Accounts</span>
                        <span className="font-medium text-slate-900">{formatCurrency(item.receivedOnAccounts)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-1">
                        <span>Net</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(item.net)}</span>
                      </div>
                    </div>
                  )}
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