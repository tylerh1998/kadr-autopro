import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Wallet, 
  ArrowLeft,
  Calendar,
  RefreshCw,
  Printer,
  Landmark
} from 'lucide-react';
import { format, subMonths, subDays } from 'date-fns';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function FinancialDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [daysBack, setDaysBack] = useState(365);
  const [fromDate, setFromDate] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [visibleLines, setVisibleLines] = useState({
    inflow: true,
    outflow: true,
    netCashFlow: true
  });

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('getFinancialDashboardData', {
        dateRange: {
          from: fromDate,
          to: toDate
        }
      });

      if (response.data.success) {
        setDashboardData(response.data.data);
      } else {
        throw new Error(response.data.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Error loading financial dashboard:', error);
      alert('Failed to load financial dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return format(date, 'MMM yyyy');
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const handleDaysBackChange = (value) => {
    setDaysBack(value);
    const calculatedFromDate = format(subDays(new Date(toDate), parseInt(value) || 0), 'yyyy-MM-dd');
    setFromDate(calculatedFromDate);
  };

  const handleLegendClick = (dataKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey]
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading financial dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-600">No data available</p>
          </div>
        </div>
      </div>
    );
  }

  const { keyMetrics, charts, bankAccountsSummary } = dashboardData;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
          }
          .no-print { display: none !important; }
          .print-title { 
            visibility: visible !important;
            display: block !important;
            font-size: 20px; 
            font-weight: bold; 
            margin-bottom: 20px;
            text-align: center;
          }
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Financial Dashboard</h1>
                <p className="text-slate-600 mt-1">Comprehensive overview of financial metrics</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={loadDashboardData} variant="outline" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Date Range Filter */}
          <Card className="no-print">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label>Days Back</Label>
                  <Input
                    type="number"
                    value={daysBack}
                    onChange={(e) => handleDaysBackChange(e.target.value)}
                    className="w-28"
                  />
                </div>
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
                <Button onClick={loadDashboardData} className="bg-blue-600 hover:bg-blue-700">
                  <Calendar className="w-4 h-4 mr-2" />
                  Apply
                </Button>
              </div>

              {/* Quick Date Filters */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setFromDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
                    setToDate(format(now, 'yyyy-MM-dd'));
                  }}
                >
                  This Month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
                    setFromDate(format(lastMonth, 'yyyy-MM-dd'));
                    setToDate(format(lastDay, 'yyyy-MM-dd'));
                  }}
                >
                  Last Month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    setFromDate(`${year}-01-01`);
                    setToDate(format(new Date(), 'yyyy-MM-dd'));
                  }}
                >
                  This Year
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear() - 1;
                    setFromDate(`${year}-01-01`);
                    setToDate(`${year}-12-31`);
                  }}
                >
                  Last Year
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="print-area">
            <div className="print-title" style={{ display: 'none' }}>
              Financial Dashboard - {format(new Date(fromDate), 'MMM d, yyyy')} to {format(new Date(toDate), 'MMM d, yyyy')}
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Revenue */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {formatCurrency(keyMetrics.totalRevenue)}
                      </h3>
                    </div>
                    <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Expenses */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Total Expenses</p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {formatCurrency(keyMetrics.totalExpenses)}
                      </h3>
                    </div>
                    <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center">
                      <TrendingDown className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Net Income */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Net Income</p>
                      <h3 className={`text-2xl font-bold ${keyMetrics.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(keyMetrics.netIncome)}
                      </h3>
                    </div>
                    <div className={`h-12 w-12 ${keyMetrics.netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center`}>
                      <DollarSign className={`w-6 h-6 ${keyMetrics.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Position */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Current Cash Position</p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {formatCurrency(keyMetrics.cashPosition)}
                      </h3>
                    </div>
                    <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue vs Expenses Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Expenses (Monthly)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={charts.revenueVsExpenses}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      tickFormatter={formatMonth}
                    />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={formatMonth}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                    <Bar dataKey="netIncome" fill="#3b82f6" name="Net Income" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Cash Flow Chart */}
            {charts.cashFlow.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Cash Flow Trend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Custom Legend */}
                  <div className="flex justify-center gap-6">
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

                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={charts.cashFlow}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey={charts.cashFlow[0]?.date ? "date" : "month"}
                        tickFormatter={charts.cashFlow[0]?.date ? formatDate : formatMonth}
                      />
                      <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        labelFormatter={charts.cashFlow[0]?.date ? formatDate : formatMonth}
                      />
                      {visibleLines.inflow && (
                        <Line type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} name="Cash Inflow" />
                      )}
                      {visibleLines.outflow && (
                        <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="Cash Outflow" />
                      )}
                      {visibleLines.netCashFlow && (
                        <Line type="monotone" dataKey="netCashFlow" stroke="#3b82f6" strokeWidth={2} name="Net Cash Flow" />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Account Balances by Type */}
              {charts.accountBalancesByType.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Account Balances by Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={charts.accountBalancesByType}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="amount"
                        >
                          {charts.accountBalancesByType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {charts.accountBalancesByType.map((item, index) => (
                        <div key={item.type} className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-4 h-4 rounded" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm text-slate-700">{item.type}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Expense Categories */}
              {charts.topExpenseCategories.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Expense Categories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={charts.topExpenseCategories}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="amount"
                        >
                          {charts.topExpenseCategories.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                      {charts.topExpenseCategories.map((item, index) => (
                        <div key={item.category} className="flex justify-between items-start gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div 
                              className="w-4 h-4 rounded flex-shrink-0 mt-0.5" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm text-slate-700 truncate">{item.category}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Bank Accounts Summary */}
            {bankAccountsSummary.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    Bank Accounts Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 text-sm font-semibold text-slate-700">Account Name</th>
                          <th className="text-left p-3 text-sm font-semibold text-slate-700">Bank</th>
                          <th className="text-left p-3 text-sm font-semibold text-slate-700">Type</th>
                          <th className="text-right p-3 text-sm font-semibold text-slate-700">Current Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankAccountsSummary.map((account) => (
                          <tr key={account.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 text-sm font-medium text-slate-900">{account.name}</td>
                            <td className="p-3 text-sm text-slate-600">{account.bank_name}</td>
                            <td className="p-3 text-sm text-slate-600">{account.account_type}</td>
                            <td className="p-3 text-sm text-right font-semibold text-slate-900">
                              {formatCurrency(account.current_balance)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50">
                          <td colSpan="3" className="p-3 text-sm font-bold text-slate-900">Total Cash Position</td>
                          <td className="p-3 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(keyMetrics.cashPosition)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}