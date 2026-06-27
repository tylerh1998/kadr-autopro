import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatMonth } from './financialDashboardUtils';

export default function RevenueVsExpensesReport({ data }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue vs Expenses (Monthly)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tickFormatter={formatMonth} />
            <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={formatMonth} />
            <Legend />
            <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
            <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
            <Bar dataKey="netIncome" fill="#3b82f6" name="Net Income" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}