import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency, formatMonth, formatShortDate } from './financialDashboardUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function CashFlowTrendReport({ data }) {
  const [visibleSeries, setVisibleSeries] = useState({
    inflow: true,
    outflow: true,
    balance: true
  });

  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    let baseData = data;
    const isDaily = !!data[0].date;
    
    if (isDaily) {
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
              outflow: 0
            };
          }

          currentWeek.inflow += (item.inflow || 0);
          currentWeek.outflow += (item.outflow || 0);
        });

        if (currentWeek) weekly.push(currentWeek);
        baseData = weekly;
      } else {
        baseData = filtered;
      }
    }

    // Now recalculate running balance for the final dataset to ensure math is perfectly correct
    let currentBalance = parseFloat(openingBalance) || 0;
    
    return baseData.map(item => {
      const inAmt = item.inflow || 0;
      const outAmt = item.outflow || 0;
      currentBalance = currentBalance + inAmt - outAmt;
      return {
        ...item,
        balance: currentBalance
      };
    });
  }, [data, excludeWeekends, openingBalance]);

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
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Label htmlFor="openingBalance" className="text-sm font-medium">
              Opening Balance:
            </Label>
            <Input
              id="openingBalance"
              type="number"
              placeholder="$0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-32 h-8"
            />
          </div>
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
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={data?.[0]?.date ? 'date' : 'month'} tickFormatter={labelFormatter} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="flow" tickFormatter={(value) => `$${Math.abs(value).toLocaleString()}`} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="balance" orientation="right" tickFormatter={(value) => `$${value.toLocaleString()}`} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              labelFormatter={labelFormatter}
              formatter={(value, name) => {
                if (name === 'Cash Out') return [formatCurrency(Math.abs(value)), name];
                return [formatCurrency(value), name];
              }}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            />
            <ReferenceLine yAxisId="flow" y={0} stroke="hsl(var(--border))" />
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