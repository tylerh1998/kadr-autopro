import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  const comparisonData = [
    { name: 'Count', open: data.totalWorkOrders, closed: data.closedLast30Days },
    { name: 'Revenue', open: data.wipRevenue.total, closed: data.closedRevenueLast30Days }
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
            <CardTitle className="text-sm font-medium">WIP Labor Actuals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="flex justify-between items-end mb-1">
                <span className="text-2xl font-bold">{data.totalLaborHours?.toFixed(1) || '0.0'} hrs</span>
                <span className="text-sm font-medium text-red-600">{formatCurrency(data.wipCost?.labor || 0)}</span>
             </div>
             <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Total Hours</span>
                <span>Actual Cost</span>
             </div>
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

      {/* Closed vs Open Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Open vs Closed (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Volume Comparison */}
            <div className="h-64">
                <h4 className="text-sm font-semibold text-center mb-4 text-slate-600">Volume (Count)</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[comparisonData[0]]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} />
                        <Tooltip cursor={{fill: 'transparent'}} />
                        <Legend />
                        <Bar dataKey="open" name="Active WOs" fill="#3b82f6" radius={[4, 4, 0, 0]} label={{ position: 'top' }} />
                        <Bar dataKey="closed" name="Closed (30d)" fill="#10b981" radius={[4, 4, 0, 0]} label={{ position: 'top' }} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Revenue Comparison */}
            <div className="h-64">
                <h4 className="text-sm font-semibold text-center mb-4 text-slate-600">Revenue (Value)</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[comparisonData[1]]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis tickFormatter={(val) => `$${val/1000}k`} />
                        <Tooltip cursor={{fill: 'transparent'}} formatter={(val) => formatCurrency(val)} />
                        <Legend />
                        <Bar dataKey="open" name="WIP Potential Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} label={{ position: 'top', formatter: (val) => formatCurrency(val) }} />
                        <Bar dataKey="closed" name="Closed Revenue (30d)" fill="#10b981" radius={[4, 4, 0, 0]} label={{ position: 'top', formatter: (val) => formatCurrency(val) }} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-6">
            Comparing currently active Work Orders against Invoices closed in the last 30 days. Revenue figures are pre-tax.
          </p>
        </CardContent>
      </Card>

      {/* Status Breakdown Table */}
      {data.statusBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Financial Breakdown by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Parts Cost</TableHead>
                    <TableHead className="text-right">Parts Revenue</TableHead>
                    <TableHead className="text-right">Labour Cost</TableHead>
                    <TableHead className="text-right">Labour Revenue</TableHead>
                    <TableHead className="text-right">Other Charges</TableHead>
                    <TableHead className="text-right">Shop Supplies</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right font-bold">Total (Inc. Tax)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.statusBreakdown).map(([status, values]) => (
                    <TableRow key={status}>
                      <TableCell className="font-medium">{status}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.partsCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.partsRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.laborCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.laborRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.otherCharges)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.shopSupplies)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(values.gst)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(values.total)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell>Totals</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.partsCost, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.partsRevenue, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.laborCost, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.laborRevenue, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.otherCharges, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.shopSupplies, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.gst, 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Object.values(data.statusBreakdown).reduce((a, b) => a + b.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}