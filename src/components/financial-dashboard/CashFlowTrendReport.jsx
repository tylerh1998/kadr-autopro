import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency, formatMonth, formatShortDate } from './financialDashboardUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export default function CashFlowTrendReport({ data }) {
  const [visibleSeries, setVisibleSeries] = useState({
    inflow: true,
    outflow: true,
    balance: true
  });

  const [excludeWeekends, setExcludeWeekends] = useState(false);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const isDaily = !!data[0].date;
    if (!isDaily) return data;

    let filtered = data;
    if (excludeWeekends) {
      filtered = data.filter(item => {
        const d = new Date(item.date + 'T00:00:00');
        const day = d.getDay();
        return day !== 0 && day !== 6;
      });
    }

    if (data.length > 60) {
      const weekly = [];
      let currentWeek = null;

      filtered.forEach(item => {
        const d = new Date(item.date + 'T00:00:00');
        const dayOfWeek = d.getDay();
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - dayOfWeek);
        const weekKey = startOfWeek.toISOString().split('T')[0];

        if (!currentWeek || currentWeek.weekKey !== weekKey) {
          if (currentWeek) weekly.push(currentWeek);
          currentWeek = {
            weekKey,
            date: weekKey,
            inflow: 0,
            outflow: 0,
            balance: item.balance
          };
        }

        currentWeek.inflow += (item.inflow || 0);
        currentWeek.outflow += (item.outflow || 0);
        currentWeek.balance = item.balance; // Keep latest balance
      });

      if (currentWeek) weekly.push(currentWeek);
      return weekly;
    }

    return filtered;
  }, [data, excludeWeekends]);

  const chartData = useMemo(() => {
    return processedData.map((item) => ({
      ...item,
      outflowNegative: -(item.outflow || 0)
    }));
  }, [processedData]);

  const handleLegendClick = (dataKey) => {
    setVisibleSeries((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const isWeekly = data?.[0]?.date && data.length > 60;
  
  const labelFormatter = data?.[0]?.date 
    ? (isWeekly ? (val) => `Week of ${formatShortDate(val)}` : formatShortDate)
    : formatMonth;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Cash Flow Trend</CardTitle>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="excludeWeekends" 
            checked={excludeWeekends} 
            onCheckedChange={setExcludeWeekends} 
          />
          <Label htmlFor="excludeWeekends" className="text-sm font-medium leading-none cursor-pointer">
            Exclude Weekends
          </Label>
        </div>
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