import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatMonth, formatShortDate } from './financialDashboardUtils';

export default function CashFlowTrendReport({ data }) {
  const [visibleLines, setVisibleLines] = useState({
    inflow: true,
    outflow: true,
    netCashFlow: true
  });

  const handleLegendClick = (dataKey) => {
    setVisibleLines((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Trend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center gap-6">
          <button onClick={() => handleLegendClick('inflow')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleLines.inflow ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-0.5 bg-[#10b981]" style={{ opacity: visibleLines.inflow ? 1 : 0.4 }} />
            <span className={visibleLines.inflow ? '' : 'line-through'}>Cash Inflow</span>
          </button>
          <button onClick={() => handleLegendClick('outflow')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleLines.outflow ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-0.5 bg-[#ef4444]" style={{ opacity: visibleLines.outflow ? 1 : 0.4 }} />
            <span className={visibleLines.outflow ? '' : 'line-through'}>Cash Outflow</span>
          </button>
          <button onClick={() => handleLegendClick('netCashFlow')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleLines.netCashFlow ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-0.5 bg-[#3b82f6]" style={{ opacity: visibleLines.netCashFlow ? 1 : 0.4 }} />
            <span className={visibleLines.netCashFlow ? '' : 'line-through'}>Net Cash Flow</span>
          </button>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={data[0]?.date ? 'date' : 'month'} tickFormatter={data[0]?.date ? formatShortDate : formatMonth} />
            <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={data[0]?.date ? formatShortDate : formatMonth} />
            {visibleLines.inflow && <Line type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} name="Cash Inflow" />}
            {visibleLines.outflow && <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="Cash Outflow" />}
            {visibleLines.netCashFlow && <Line type="monotone" dataKey="netCashFlow" stroke="#3b82f6" strokeWidth={2} name="Net Cash Flow" />}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}