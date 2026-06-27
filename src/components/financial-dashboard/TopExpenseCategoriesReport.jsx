import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, formatCurrency } from './financialDashboardUtils';

export default function TopExpenseCategoriesReport({ data }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Expense Categories</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="amount"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
          {data.map((item, index) => (
            <div key={item.category} className="flex justify-between items-start gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="w-4 h-4 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-sm text-slate-700 truncate">{item.category}</span>
              </div>
              <span className="text-sm font-semibold text-slate-900 flex-shrink-0">{formatCurrency(item.amount)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}