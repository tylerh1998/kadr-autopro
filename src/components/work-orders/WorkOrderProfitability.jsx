import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Package, Wrench, Loader2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TechTimeModal from './TechTimeModal';

export default function WorkOrderProfitability({ open, onClose, workOrder, lineItems = [], workPROProject, employees = [] }) {
  // Memoize safeLineItems to prevent unnecessary re-renders and ensure stable reference
  // This helps optimize profitabilityData's useMemo dependency.
  const safeLineItems = useMemo(() => {
    return Array.isArray(lineItems) ? lineItems : [];
  }, [lineItems]);

  const [techTimeLogs, setTechTimeLogs] = useState([]);
  const [loadingLaborCost, setLoadingLaborCost] = useState(false);
  const [showTechTimeModal, setShowTechTimeModal] = useState(false);

  useEffect(() => {
    const fetchTechTimeLogs = async () => {
      if (!open || !workPROProject?.id) {
        setTechTimeLogs([]);
        return;
      }
      setLoadingLaborCost(true);
      try {
        const response = await base44.functions.invoke('getProjectTimeSessions', { 
          projectId: workPROProject.id 
        });

        if (response.data?.success) {
          setTechTimeLogs(response.data.logs);
        } else {
          console.error('Failed to fetch time logs:', response.data?.error);
          setTechTimeLogs([]);
        }
      } catch (error) {
        console.error('Failed to fetch TechTimeLogs:', error);
        setTechTimeLogs([]);
      } finally {
        setLoadingLaborCost(false);
      }
    };
    fetchTechTimeLogs();
  }, [open, workPROProject?.id]);

  const profitabilityData = useMemo(() => {
    if (!safeLineItems || safeLineItems.length === 0) {
      return {
        totalRevenue: 0,
        totalCost: 0,
        grossProfit: 0,
        profitMargin: 0,
        partsData: { revenue: 0, cost: 0, profit: 0, margin: 0 },
        laborData: { revenue: 0, cost: 0, profit: 0, margin: 0, actualCostCalculated: false }
      };
    }

    // Calculate labor totals
    const laborRevenue = safeLineItems.reduce((sum, item) => {
      return sum + (Number(item.labour) || 0);
    }, 0);
    
    // Calculate actual labor cost from tech time logs
    let laborCost = 0;
    let actualCostCalculated = false;

    if (techTimeLogs.length > 0 && employees.length > 0) {
      actualCostCalculated = true;
      laborCost = techTimeLogs.reduce((sum, log) => {
        // Try to match employee by name since we are fetching live from WorkPRO
        // The backend function maps 'user_name' or 'employee_name' to 'workpro_user_name'
        const employee = employees.find(emp => 
          (emp.full_name && log.workpro_user_name && emp.full_name.toLowerCase() === log.workpro_user_name.toLowerCase()) ||
          (emp.email && log.email && emp.email.toLowerCase() === log.email.toLowerCase())
        );
        
        if (employee && employee.pay_rate) {
          return sum + (Number(log.hours) || 0) * (Number(employee.pay_rate) || 0);
        }
        return sum;
      }, 0);
    }

    // Calculate parts totals
    const partsRevenue = safeLineItems.reduce((sum, item) => {
      return sum + (Number(item.tot_parts) || 0);
    }, 0);
    
    const partsCost = safeLineItems.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const costEach = Number(item.cost_ea) || 0;
      return sum + (qty * costEach);
    }, 0);

    // Calculate totals
    const totalRevenue = partsRevenue + laborRevenue;
    const totalCost = partsCost + laborCost;
    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const partsProfit = partsRevenue - partsCost;
    const partsMargin = partsRevenue > 0 ? (partsProfit / partsRevenue) * 100 : 0;

    const laborProfit = laborRevenue - laborCost;
    const laborMargin = laborRevenue > 0 ? (laborProfit / laborRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin,
      partsData: { 
        revenue: partsRevenue, 
        cost: partsCost, 
        profit: partsProfit, 
        margin: partsMargin 
      },
      laborData: { 
        revenue: laborRevenue, 
        cost: laborCost, 
        profit: laborProfit, 
        margin: laborMargin,
        actualCostCalculated: actualCostCalculated
      }
    };
  }, [safeLineItems, techTimeLogs, employees]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const getMarginColor = (margin) => {
    if (margin >= 30) return 'text-green-600';
    if (margin >= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMarginBadgeColor = (margin) => {
    if (margin >= 30) return 'bg-green-100 text-green-800';
    if (margin >= 15) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const totalTechHours = techTimeLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);

  // Don't render if no work order data or still loading labor cost
  if (!workOrder) {
    return null;
  }

  if (loadingLaborCost) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Work Order Profitability Analysis
            </DialogTitle>
            <p className="text-sm text-slate-600">
              RO #{workOrder.ro_number} - {workOrder.description}
            </p>
          </DialogHeader>
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
            <p className="text-slate-700">Calculating labor costs...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Work Order Profitability Analysis
          </DialogTitle>
          <p className="text-sm text-slate-600">
            RO #{workOrder.ro_number} - {workOrder.description}
          </p>
        </DialogHeader>

        <div className="space-y-6 p-6">
          {/* Overall Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Overall Profitability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-slate-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(profitabilityData.totalRevenue)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600">Total Cost</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(profitabilityData.totalCost)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600">Gross Profit</p>
                  <p className={`text-2xl font-bold ${getMarginColor(profitabilityData.profitMargin)}`}>
                    {formatCurrency(profitabilityData.grossProfit)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600">Profit Margin</p>
                  <Badge className={`text-lg px-3 py-1 ${getMarginBadgeColor(profitabilityData.profitMargin)}`}>
                    {profitabilityData.profitMargin.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parts vs Labor Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Parts Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Parts Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-slate-600">Revenue:</span>
                  <span className="font-semibold">{formatCurrency(profitabilityData.partsData.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Cost:</span>
                  <span className="font-semibold">{formatCurrency(profitabilityData.partsData.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Profit:</span>
                  <span className={`font-semibold ${getMarginColor(profitabilityData.partsData.margin)}`}>
                    {formatCurrency(profitabilityData.partsData.profit)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Margin:</span>
                  <Badge className={getMarginBadgeColor(profitabilityData.partsData.margin)}>
                    {profitabilityData.partsData.margin.toFixed(1)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Labor Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-orange-600" />
                    Labor Analysis
                  </div>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-slate-100 flex items-center gap-1"
                    onClick={() => setShowTechTimeModal(true)}
                  >
                    <Clock className="w-3 h-3" />
                    Tech Time {totalTechHours.toFixed(1)}h
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-slate-600">Revenue:</span>
                  <span className="font-semibold">{formatCurrency(profitabilityData.laborData.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Cost{profitabilityData.laborData.actualCostCalculated ? '' : ' (Estimated)'}:
                  </span>
                  <span className="font-semibold">{formatCurrency(profitabilityData.laborData.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Profit:</span>
                  <span className={`font-semibold ${getMarginColor(profitabilityData.laborData.margin)}`}>
                    {formatCurrency(profitabilityData.laborData.profit)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Margin:</span>
                  <Badge className={getMarginBadgeColor(profitabilityData.laborData.margin)}>
                    {profitabilityData.laborData.margin.toFixed(1)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Line Items Detail */}
          {safeLineItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Line Items Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Revenue</th>
                        <th className="text-right p-2">Cost</th>
                        <th className="text-right p-2">Profit</th>
                        <th className="text-right p-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeLineItems.map((item, index) => {
                        const revenue = (Number(item.tot_parts) || 0) + (Number(item.labour) || 0);
                        const cost = (Number(item.qty) || 0) * (Number(item.cost_ea) || 0);
                        const profit = revenue - cost;
                        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

                        return (
                          <tr key={index} className="border-b">
                            <td className="p-2">{item.description || 'N/A'}</td>
                            <td className="text-right p-2">{item.qty || 0}</td>
                            <td className="text-right p-2">{formatCurrency(revenue)}</td>
                            <td className="text-right p-2">{formatCurrency(cost)}</td>
                            <td className={`text-right p-2 ${getMarginColor(margin)}`}>
                              {formatCurrency(profit)}
                            </td>
                            <td className="text-right p-2">
                              <span className={getMarginColor(margin)}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {safeLineItems.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No line items found for profitability analysis.</p>
              </CardContent>
            </Card>
          )}
        </div>
        <TechTimeModal 
          open={showTechTimeModal} 
          onClose={() => setShowTechTimeModal(false)} 
          project={workPROProject} 
        />
      </DialogContent>
    </Dialog>
  );
}