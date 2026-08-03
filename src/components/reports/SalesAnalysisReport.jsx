import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, DollarSign, TrendingUp, Users, Calendar, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { startOfMonth, endOfMonth, subMonths, format, startOfYear, subDays } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function SalesAnalysisReport() {
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  // Colors for charts
  const COLORS = ['#3b82f6', '#f97316', '#10b981', '#ef4444'];

  useEffect(() => {
    // Set initial custom dates based on selection
    const now = new Date();
    let start, end;

    switch (dateRange) {
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'lastMonth':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'ytd':
        start = startOfYear(now);
        end = now; // up to today
        break;
      case 'last30days':
        start = subDays(now, 30);
        end = now;
        break;
      case 'custom':
        // Don't auto-set if custom, keep existing or default to today
        return;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    setCustomStart(format(start, 'yyyy-MM-dd'));
    setCustomEnd(format(end, 'yyyy-MM-dd'));
  }, [dateRange]);

  const fetchReport = async () => {
    if (!customStart || !customEnd) return;
    
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('autopro-getSalesAnalysisReport', {
        body: { startDate: customStart, endDate: customEnd }
      });

      if (response.data && !response.data.error) {
        setData(response.data);
      } else {
        console.error(response.data?.error || response.error);
      }
    } catch (error) {
      console.error('Failed to fetch sales report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateRange !== 'custom' && customStart && customEnd) {
      fetchReport();
    }
  }, [customStart, customEnd, dateRange]);

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const StatCard = ({ title, value, subValue, icon: Icon, color }) => (
    <Card>
      <CardContent className="p-6 flex items-center space-x-4">
        <div className={`p-3 rounded-full ${color} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
          {subValue && <p className="text-sm text-slate-500">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex gap-4 items-end">
          <div className="w-40">
            <Label>Date Range</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="lastMonth">Last Month</SelectItem>
                <SelectItem value="last30days">Last 30 Days</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-40">
            <Label>Start Date</Label>
            <Input 
              type="date" 
              value={customStart} 
              onChange={(e) => { setCustomStart(e.target.value); setDateRange('custom'); }} 
            />
          </div>
          
          <div className="w-40">
            <Label>End Date</Label>
            <Input 
              type="date" 
              value={customEnd} 
              onChange={(e) => { setCustomEnd(e.target.value); setDateRange('custom'); }} 
            />
          </div>

          <Button onClick={fetchReport} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Report'}
          </Button>
        </div>
        
        <Button variant="outline" onClick={() => window.print()}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard 
              title="Total Sales" 
              value={formatCurrency(data.summary.totalRevenue)} 
              subValue={`${data.summary.invoiceCount} Invoices`}
              icon={DollarSign} 
              color="bg-blue-500" 
            />
            <StatCard 
              title="Gross Profit" 
              value={formatCurrency(data.summary.grossProfit)} 
              subValue={`${data.summary.margin.toFixed(1)}% Margin`}
              icon={TrendingUp} 
              color="bg-green-500" 
            />
            <StatCard 
              title="Labor Sales" 
              value={formatCurrency(data.summary.laborRevenue)} 
              subValue={`Cost: ${formatCurrency(data.summary.laborCost)}`}
              icon={Users} 
              color="bg-orange-500" 
            />
            <StatCard 
              title="Avg Ticket" 
              value={formatCurrency(data.summary.avgTicket)} 
              icon={Calendar} 
              color="bg-purple-500" 
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Parts', value: data.summary.partsRevenue },
                        { name: 'Labor', value: data.summary.laborRevenue },
                        { name: 'Supplies', value: data.summary.shopSuppliesRevenue },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {COLORS.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={(str) => format(new Date(str), 'MMM d')}
                        fontSize={12}
                    />
                    <YAxis 
                        tickFormatter={(val) => `$${val}`}
                        fontSize={12}
                    />
                    <Tooltip formatter={(val) => formatCurrency(val)} labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                    <Bar dataKey="cost" name="Cost" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Category</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">Revenue</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">Cost</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">Profit</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-3 px-4 font-medium">Parts</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.partsRevenue)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.partsCost)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.partsRevenue - data.summary.partsCost)}</td>
                      <td className="text-right py-3 px-4">
                        {data.summary.partsRevenue ? ((data.summary.partsRevenue - data.summary.partsCost) / data.summary.partsRevenue * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium">Labor</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.laborRevenue)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.laborCost)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.laborRevenue - data.summary.laborCost)}</td>
                      <td className="text-right py-3 px-4">
                        {data.summary.laborRevenue ? ((data.summary.laborRevenue - data.summary.laborCost) / data.summary.laborRevenue * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium">Shop Supplies</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.shopSuppliesRevenue)}</td>
                      <td className="text-right py-3 px-4">$0.00</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.shopSuppliesRevenue)}</td>
                      <td className="text-right py-3 px-4">100%</td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td className="py-3 px-4">Totals</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.totalRevenue)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.totalCost)}</td>
                      <td className="text-right py-3 px-4">{formatCurrency(data.summary.grossProfit)}</td>
                      <td className="text-right py-3 px-4">{data.summary.margin.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <p>Select a date range and click Run Report to view analysis</p>
        </div>
      )}
    </div>
  );
}