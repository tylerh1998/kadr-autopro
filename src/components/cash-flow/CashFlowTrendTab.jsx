import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Calendar } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function CashFlowTrendTab() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [fromDate, setFromDate] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [visibleLines, setVisibleLines] = useState({
    inflow: true,
    outflow: true,
    netCashFlow: true
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('getFinancialDashboardData', {
        dateRange: {
          from: fromDate,
          to: toDate
        }
      });

      if (response.data.success) {
        setChartData(response.data.data.charts.cashFlow || []);
      } else {
        console.error('Failed to load cash flow data:', response.data.error);
      }
    } catch (error) {
      console.error('Error loading cash flow trend:', error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLegendClick = (dataKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey]
    }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatMonth = (monthStr) => {
      const [year, month] = monthStr.split('-');
      const date = new Date(year, parseInt(month) - 1);
      return format(date, 'MMM yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Trend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
             <div className="flex items-center justify-center h-[400px]">
               <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
             </div>
          ) : chartData.length > 0 ? (
            <>
              {/* Custom Legend */}
              <div className="flex justify-center gap-6 flex-wrap">
                <button
                  onClick={() => handleLegendClick('inflow')}
                  className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${
                    visibleLines.inflow ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <div className="w-4 h-0.5 bg-[#10b981]" style={{ opacity: visibleLines.inflow ? 1 : 0.4 }} />
                  <span className={visibleLines.inflow ? '' : 'line-through'}>Cash Inflow</span>
                </button>
                <button
                  onClick={() => handleLegendClick('outflow')}
                  className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${
                    visibleLines.outflow ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <div className="w-4 h-0.5 bg-[#ef4444]" style={{ opacity: visibleLines.outflow ? 1 : 0.4 }} />
                  <span className={visibleLines.outflow ? '' : 'line-through'}>Cash Outflow</span>
                </button>
                <button
                  onClick={() => handleLegendClick('netCashFlow')}
                  className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${
                    visibleLines.netCashFlow ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <div className="w-4 h-0.5 bg-[#3b82f6]" style={{ opacity: visibleLines.netCashFlow ? 1 : 0.4 }} />
                  <span className={visibleLines.netCashFlow ? '' : 'line-through'}>Net Cash Flow</span>
                </button>
              </div>

              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey={chartData[0]?.date ? "date" : "month"}
                        tickFormatter={chartData[0]?.date ? formatDate : formatMonth}
                    />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        labelFormatter={chartData[0]?.date ? formatDate : formatMonth}
                    />
                    {visibleLines.inflow && (
                        <Line type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} name="Cash Inflow" dot={false} />
                    )}
                    {visibleLines.outflow && (
                        <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="Cash Outflow" dot={false} />
                    )}
                    {visibleLines.netCashFlow && (
                        <Line type="monotone" dataKey="netCashFlow" stroke="#3b82f6" strokeWidth={2} name="Net Cash Flow" dot={false} />
                    )}
                    </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-slate-500">
                No data available for the selected period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}