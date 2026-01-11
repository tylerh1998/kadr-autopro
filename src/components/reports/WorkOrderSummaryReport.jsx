import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, DollarSign, Package, Clock, FileText, PieChart as PieIcon, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
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

export default function WorkOrderSummaryReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('getWorkOrderSummaryReport');
      if (response.data) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch WO summary report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const wipBreakdownData = [
    { name: 'Labor', value: data.wipRevenue.labor },
    { name: 'Parts', value: data.wipRevenue.parts },
    { name: 'Shop Supplies', value: data.wipRevenue.shopSupplies },
    { name: 'Other Charges', value: data.wipRevenue.otherCharges },
  ].filter(i => i.value > 0);

  const agingData = Object.entries(data.aging).map(([key, value]) => ({
    name: key,
    count: value
  }));

  const openVsClosedData = [
    { name: 'Open WOs', value: data.totalWorkOrders },
    { name: 'Closed (30d)', value: data.closedLast30Days }
  ];

  return (
    <div className="space-y-6 p-2">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Work Order Summary</h2>
          <p className="text-muted-foreground">Overview of active Work Orders, Estimates, and WIP value.</p>
        </div>
        <Button onClick={fetchReport} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalWorkOrders}</div>
            <p className="text-xs text-muted-foreground">
              + {data.totalEstimates} Estimates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory in WIP</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.inventoryValueInWIP)}</div>
            <p className="text-xs text-muted-foreground">
              Cost of unbilled parts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WIP Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.wipRevenue.total)}</div>
            <p className="text-xs text-muted-foreground">
              Potential revenue on open WOs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Margin</CardTitle>
            <PieIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.margins.marginPercent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(data.margins.grossProfit)} Gross Profit
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Aging Report */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Work Order Aging
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={agingData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                 <XAxis type="number" allowDecimals={false} />
                 <YAxis dataKey="name" type="category" width={80} />
                 <Tooltip cursor={{fill: 'transparent'}} />
                 <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Work Orders">
                    {agingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* WIP Breakdown Pie */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              WIP Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={wipBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {wipBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => formatCurrency(val)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Table & Closed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr>
                  <td className="py-3 font-medium">Labor</td>
                  <td className="py-3 text-right">{formatCurrency(data.wipRevenue.labor)}</td>
                  <td className="py-3 text-right text-muted-foreground">
                    {data.wipRevenue.total ? ((data.wipRevenue.labor / data.wipRevenue.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Parts</td>
                  <td className="py-3 text-right">{formatCurrency(data.wipRevenue.parts)}</td>
                  <td className="py-3 text-right text-muted-foreground">
                     {data.wipRevenue.total ? ((data.wipRevenue.parts / data.wipRevenue.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Shop Supplies</td>
                  <td className="py-3 text-right">{formatCurrency(data.wipRevenue.shopSupplies)}</td>
                  <td className="py-3 text-right text-muted-foreground">
                     {data.wipRevenue.total ? ((data.wipRevenue.shopSupplies / data.wipRevenue.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Other Charges</td>
                  <td className="py-3 text-right">{formatCurrency(data.wipRevenue.otherCharges)}</td>
                  <td className="py-3 text-right text-muted-foreground">
                     {data.wipRevenue.total ? ((data.wipRevenue.otherCharges / data.wipRevenue.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="font-bold bg-slate-50">
                  <td className="py-3 pl-2">Total WIP Revenue</td>
                  <td className="py-3 text-right">{formatCurrency(data.wipRevenue.total)}</td>
                  <td className="py-3 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Closed vs Open</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={openVsClosedData}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                 <XAxis dataKey="name" fontSize={12} />
                 <YAxis allowDecimals={false} />
                 <Tooltip cursor={{fill: 'transparent'}} />
                 <Bar dataKey="value" fill="#8884d8" name="Count">
                    <Cell fill="#3b82f6" /> {/* Open */}
                    <Cell fill="#10b981" /> {/* Closed */}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
             <p className="text-xs text-center text-muted-foreground mt-2">
                Comparing current Open WOs to Invoices closed in last 30 days
             </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}