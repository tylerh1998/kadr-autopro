import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Calendar } from 'lucide-react';
import { format, subMonths, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subQuarters, startOfYear, endOfYear, subYears } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function CashFlowTrendTab({ overheadRows = [], cashFlowRows = [], workDaysLeft = 0, monthEnd }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [allChartData, setAllChartData] = useState([]); // Store all accounts data
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [accounts, setAccounts] = useState([]);

  const [fromDate, setFromDate] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Status Bar State
  const [bankStats, setBankStats] = useState({ credits: 0, debits: 0 }); // New state for backend data
  const [visibleLines, setVisibleLines] = useState({
    inflow: true,
    outflow: true,
    netCashFlow: true,
    balance: true
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
        const byAccount = response.data.data.charts.cashFlowByAccount || [];
        setAllChartData(byAccount);
        
        // Extract accounts list
        const accList = byAccount.map(a => ({ id: a.id, name: a.name }));
        setAccounts(accList);

        // Find default account (Primary-Servus) if not already set or 'all'
        // Only set default if we are initializing (or currently 'all' but want to force default on load?)
        // User wants Primary-Servus default.
        if (selectedAccountId === 'all' || !byAccount.find(a => a.id === selectedAccountId)) {
             const defaultAcc = byAccount.find(a => a.name.toLowerCase().includes('primary') && a.name.toLowerCase().includes('servus'));
             if (defaultAcc) {
                 setSelectedAccountId(defaultAcc.id);
                 setChartData(defaultAcc.data);
             } else {
                 // Fallback to All if not found
                 setChartData(byAccount.find(a => a.id === 'all')?.data || []);
                 setSelectedAccountId('all');
             }
        } else {
             // Keep current selection
             const currentData = byAccount.find(a => a.id === selectedAccountId);
             setChartData(currentData?.data || []);
        }

        // Set Bank Stats
        if (response.data.data.targetBankStats) {
            setBankStats(response.data.data.targetBankStats);
        }

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

  // Removed fetchRevenue useEffect as we now use bankStats from getFinancialDashboardData

  // Calculate Status Bar Metrics
  const calculateMetrics = () => {
    // 1. Total Overhead
    const totalOverhead = overheadRows.reduce((sum, row) => {
        const val = parseFloat(row.amount?.toString().replace(/[^0-9.-]+/g,"")) || 0;
        return sum + val;
    }, 0);

    // 2. Revenue (Bank Credits) - from backend
    const totalRevenue = bankStats.credits || 0;

    // 3. Total Payable (Cash Flow Table: Amount - Amount Paid)
    const totalPayable = cashFlowRows.reduce((sum, row) => {
        const amount = parseFloat(row.amount?.toString().replace(/[^0-9.-]+/g,"")) || 0;
        const paid = parseFloat(row.amountPaid?.toString().replace(/[^0-9.-]+/g,"")) || 0;
        return sum + (amount - paid);
    }, 0);

    // 4. Calculate Outstanding Cheques from cashFlowRows (same logic as CashFlowTotals)
    const outstandingCheques = cashFlowRows.reduce((sum, row) => {
        const method = (row.method || '').toLowerCase();
        const isCheque = method === 'cheque';
        if (isCheque) {
            const amount = parseFloat(row.amountPaid?.toString().replace(/[^0-9.-]+/g,"")) || 0;
            return sum + amount;
        }
        return sum;
    }, 0);

    // 5. Total Paid (Bank Debits - Outstanding Cheques)
    const totalPaid = (bankStats.debits || 0) - outstandingCheques;

    // 6. Daily Target (Based on Total Payable)
    let dailyTarget = 0;
    if (totalPayable > 0 && workDaysLeft > 0) {
        dailyTarget = totalPayable / workDaysLeft;
    }

    return { totalOverhead, totalRevenue, totalPayable, totalPaid, dailyTarget };
  };

  const metrics = calculateMetrics();

  const calculateMonthProgress = () => {
      if (!monthEnd) return 0;
      const end = new Date(monthEnd);
      // Ensure we are working with the correct year/month from monthEnd
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      const now = new Date();
      
      // If we are looking at a past month, progress is 100%
      if (now > end) return 100;
      // If we are looking at a future month, progress is 0%
      if (now < start) return 0;
      
      const totalTime = end.getTime() - start.getTime();
      const passedTime = now.getTime() - start.getTime();
      
      if (totalTime <= 0) return 100;
      
      return Math.min(100, Math.max(0, (passedTime / totalTime) * 100));
  };

  const monthProgress = calculateMonthProgress();

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
    if (!dateStr) return '';
    // Manually parse YYYY-MM-DD to ensure local date without timezone shift
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        return format(date, 'MMM d');
    }
    return dateStr;
  };

  const formatMonth = (monthStr) => {
      const [year, month] = monthStr.split('-');
      const date = new Date(year, parseInt(month) - 1);
      return format(date, 'MMM yyyy');
  };

  const applyQuickDate = (type) => {
    const now = new Date();
    let start, end;

    switch(type) {
        case 'last30':
            start = subDays(now, 30);
            end = now;
            break;
        case 'thisMonth':
            start = startOfMonth(now);
            end = endOfMonth(now);
            break;
        case 'lastMonth':
            start = startOfMonth(subMonths(now, 1));
            end = endOfMonth(subMonths(now, 1));
            break;
        case 'thisQuarter':
            start = startOfQuarter(now);
            end = endOfQuarter(now);
            break;
        case 'lastQuarter':
            const lastQ = subQuarters(now, 1);
            start = startOfQuarter(lastQ);
            end = endOfQuarter(lastQ);
            break;
        case 'thisYear':
            start = startOfYear(now);
            end = endOfYear(now);
            break;
        case 'lastYear':
            const lastY = subYears(now, 1);
            start = startOfYear(lastY);
            end = endOfYear(lastY);
            break;
        default:
            return;
    }
    
    setFromDate(format(start, 'yyyy-MM-dd'));
    setToDate(format(end, 'yyyy-MM-dd'));
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

          {/* Account Tabs */}
          <div className="mt-4 border-b border-slate-200">
            <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
                {accounts.map(acc => (
                    <button
                        key={acc.id}
                        onClick={() => {
                            setSelectedAccountId(acc.id);
                            const accData = allChartData.find(a => a.id === acc.id);
                            setChartData(accData?.data || []);
                        }}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
                            selectedAccountId === acc.id
                                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        {acc.name}
                    </button>
                ))}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('last30')}>Last 30 Days</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('thisMonth')}>This Month</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('lastMonth')}>Last Month</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('thisQuarter')}>This Quarter</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('lastQuarter')}>Last Quarter</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('thisYear')}>This Year</Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickDate('lastYear')}>Last Year</Button>
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
                <button
                  onClick={() => handleLegendClick('balance')}
                  className={`flex items-center gap-2 px-3 py-1 rounded transition-opacity ${
                    visibleLines.balance ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <div className="w-4 h-0.5 bg-purple-600" style={{ opacity: visibleLines.balance ? 1 : 0.4 }} />
                  <span className={visibleLines.balance ? '' : 'line-through'}>Bank Balance</span>
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
                    {visibleLines.balance && (
                        <Line type="monotone" dataKey="balance" stroke="#9333ea" strokeWidth={2} name="Bank Balance" dot={false} />
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-sm font-medium text-red-800 mb-1">Total Overhead</p>
                    <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(metrics.totalOverhead)}
                    </p>
                    <p className="text-xs text-red-600/70">From Overhead Table</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-sm font-medium text-amber-800 mb-1">Total Payable</p>
                    <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(metrics.totalPayable)}
                    </p>
                    <p className="text-xs text-amber-600/70">From Cash Flow Table</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-sm font-medium text-purple-800 mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-purple-600">
                        {formatCurrency(metrics.totalPaid)}
                    </p>
                    <p className="text-xs text-purple-600/70">Debits - Outstanding Chq</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-sm font-medium text-green-800 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(metrics.totalRevenue)}
                    </p>
                    <p className="text-xs text-green-600/70">Bank Credits</p>
                </div>
            </div>

            {/* Status Bar */}
            <div className="space-y-4">
                {/* Revenue Progress Bar - Disabled per user request but code kept */}
                {/* 
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-slate-600">
                        <span>Revenue Progress</span>
                        <span>{metrics.totalObligations > 0 ? Math.round((metrics.totalRevenue / metrics.totalObligations) * 100) : 0}% of Obligations Covered</span>
                    </div>
                    <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                        <div 
                            className="bg-green-500 h-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, (metrics.totalRevenue / metrics.totalObligations) * 100)}%` }}
                        />
                        {metrics.totalRevenue > metrics.totalObligations && (
                             <div className="bg-blue-500 h-full w-1" /> 
                        )}
                    </div>
                </div>
                */}

                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-slate-600">
                        <span>Month Progress</span>
                        <span>{Math.round(monthProgress)}% of Month Elapsed</span>
                    </div>
                    <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                        <div 
                            className="bg-blue-500 h-full transition-all duration-500" 
                            style={{ width: `${monthProgress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Daily Target - Based on Total Payable */}
            {metrics.dailyTarget > 0 ? (
                <div className="p-6 bg-slate-900 rounded-xl text-center text-white">
                    <p className="text-lg font-medium text-slate-300 mb-2">Daily Cash Outflow Target (Payable)</p>
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
                    <p className="text-lg font-medium text-green-100 mb-2">No Payables Remaining</p>
                    <p className="text-sm text-green-200 mt-2">
                        All cash flow table items are paid or zero.
                    </p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}