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

export default function CashFlowTrendTab({ overheadRows = [], workDaysLeft = 0, monthEnd }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [fromDate, setFromDate] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Status Bar State
  const [revenueData, setRevenueData] = useState({ total: 0, loading: false });
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

  // Load Current Month Revenue for Status Bar
  useEffect(() => {
    const fetchRevenue = async () => {
      if (!monthEnd) return;
      
      setRevenueData(prev => ({ ...prev, loading: true }));
      try {
        // Parse monthEnd to get range
        // monthEnd format from parent is 'MMM D, YYYY'
        const end = new Date(monthEnd);
        const start = new Date(end.getFullYear(), end.getMonth(), 1);
        
        const response = await base44.functions.invoke('getPLReportData', {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        });

        if (response.data.success) {
            // Filter for 4000-4999
            const revAccounts = response.data.data.revenue || [];
            const specificRevenue = revAccounts.reduce((sum, acc) => {
                const accNum = parseInt(acc.account_number);
                if (accNum >= 4000 && accNum <= 4999) {
                    return sum + acc.amount;
                }
                return sum;
            }, 0);
            
            setRevenueData({ total: specificRevenue, loading: false });
        }
      } catch (error) {
        console.error("Error fetching revenue status:", error);
        setRevenueData(prev => ({ ...prev, loading: false }));
      }
    };

    fetchRevenue();
  }, [monthEnd]);

  // Calculate Status Bar Metrics
  const calculateMetrics = () => {
    // 1. Total Overhead
    const totalOverhead = overheadRows.reduce((sum, row) => {
        const val = parseFloat(row.amount?.toString().replace(/[^0-9.-]+/g,"")) || 0;
        return sum + val;
    }, 0);

    // 2. Revenue (fetched)
    const totalRevenue = revenueData.total;

    // 3. Difference
    const difference = totalRevenue - totalOverhead;

    // 4. Daily Target
    // "divide the total difference by the work days left"
    // Interpretation: If Revenue < Overhead, we need to make up the difference.
    // Target = (Overhead - Revenue) / Days
    let dailyTarget = 0;
    if (difference < 0 && workDaysLeft > 0) {
        dailyTarget = Math.abs(difference) / workDaysLeft;
    }

    return { totalOverhead, totalRevenue, difference, dailyTarget };
  };

  const metrics = calculateMetrics();

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

      {/* Revenue vs Overhead Status Bar */}
      <Card>
        <CardHeader>
            <CardTitle>Current Month Status (Revenue vs Overhead)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-sm font-medium text-green-800 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                        {revenueData.loading ? '...' : formatCurrency(metrics.totalRevenue)}
                    </p>
                    <p className="text-xs text-green-600/70">Accts 4000-4999</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-sm font-medium text-red-800 mb-1">Total Overhead</p>
                    <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(metrics.totalOverhead)}
                    </p>
                    <p className="text-xs text-red-600/70">From Overhead Table</p>
                </div>
                <div className={`p-4 rounded-lg border ${metrics.difference >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                    <p className={`text-sm font-medium mb-1 ${metrics.difference >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
                        Difference
                    </p>
                    <p className={`text-2xl font-bold ${metrics.difference >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {formatCurrency(metrics.difference)}
                    </p>
                </div>
            </div>

            {/* Status Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium text-slate-600">
                    <span>Progress</span>
                    <span>{metrics.totalOverhead > 0 ? Math.round((metrics.totalRevenue / metrics.totalOverhead) * 100) : 0}% of Overhead Covered</span>
                </div>
                <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                    <div 
                        className="bg-green-500 h-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, (metrics.totalRevenue / metrics.totalOverhead) * 100)}%` }}
                    />
                    {metrics.totalRevenue > metrics.totalOverhead && (
                         <div className="bg-blue-500 h-full w-1" /> // Marker for overflow? Or just fill 100
                    )}
                </div>
            </div>

            {/* Daily Target */}
            {metrics.dailyTarget > 0 ? (
                <div className="p-6 bg-slate-900 rounded-xl text-center text-white">
                    <p className="text-lg font-medium text-slate-300 mb-2">Daily Revenue Target to Match Overhead</p>
                    <div className="flex items-end justify-center gap-2">
                        <span className="text-4xl font-bold tracking-tight">{formatCurrency(metrics.dailyTarget)}</span>
                        <span className="text-slate-400 mb-1">/ day</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                        {workDaysLeft} work days remaining in the month
                    </p>
                </div>
            ) : (
                <div className="p-6 bg-green-600 rounded-xl text-center text-white">
                    <p className="text-lg font-medium text-green-100 mb-2">Target Achieved!</p>
                    <p className="text-3xl font-bold">Overhead Covered</p>
                    <p className="text-sm text-green-200 mt-2">
                        Revenue exceeds overhead by {formatCurrency(metrics.difference)}
                    </p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}