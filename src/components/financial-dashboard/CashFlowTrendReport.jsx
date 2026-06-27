import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency, formatMonth, formatShortDate } from './financialDashboardUtils';

export default function CashFlowTrendReport({ data }) {
  const [visibleSeries, setVisibleSeries] = useState({
    inflow: true,
    outflow: true,
    balance: true
  });

  const chartData = useMemo(() => {
    return (data || []).map((item) => ({
      ...item,
      outflowNegative: -(item.outflow || 0)
    }));
  }, [data]);

  const handleLegendClick = (dataKey) => {
    setVisibleSeries((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const labelFormatter = data?.[0]?.date ? formatShortDate : formatMonth;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Trend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center gap-6 flex-wrap">
          <button onClick={() => handleLegendClick('inflow')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleSeries.inflow ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-3 rounded-sm bg-[#3b82f6]" style={{ opacity: visibleSeries.inflow ? 1 : 0.4 }} />
            <span className={visibleSeries.inflow ? '' : 'line-through'}>Cash In</span>
          </button>
          <button onClick={() => handleLegendClick('outflow')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleSeries.outflow ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-3 rounded-sm bg-[#f59e0b]" style={{ opacity: visibleSeries.outflow ? 1 : 0.4 }} />
            <span className={visibleSeries.outflow ? '' : 'line-through'}>Cash Out</span>
          </button>
          <button onClick={() => handleLegendClick('balance')} className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${visibleSeries.balance ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-4 h-0.5 bg-[#22c55e]" style={{ opacity: visibleSeries.balance ? 1 : 0.4 }} />
            <span className={visibleSeries.balance ? '' : 'line-through'}>Running Balance</span>
          </button>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={data?.[0]?.date ? 'date' : 'month'} tickFormatter={labelFormatter} />
            <YAxis yAxisId="flow" tickFormatter={(value) => `$${Math.abs(value).toLocaleString()}`} />
            <YAxis yAxisId="balance" orientation="right" tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip
              labelFormatter={labelFormatter}
              formatter={(value, name) => {
                if (name === 'Cash Out') return [formatCurrency(Math.abs(value)), name];
                return [formatCurrency(value), name];
              }}
            />
            <ReferenceLine yAxisId="flow" y={0} stroke="#94a3b8" />
            {visibleSeries.inflow && (
              <Bar yAxisId="flow" dataKey="inflow" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cash In" />
            )}
            {visibleSeries.outflow && (
              <Bar yAxisId="flow" dataKey="outflowNegative" fill="#f59e0b" radius={[0, 0, 4, 4]} name="Cash Out" />
            )}
            {visibleSeries.balance && (
              <Line
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                name="Running Balance"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}