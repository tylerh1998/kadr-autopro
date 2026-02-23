import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Package, Wrench, Loader2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TechTimeModal from './TechTimeModal';

export default function WorkOrderProfitability({ open, onClose, workOrder, lineItems = [], workPROProject, workPROProjects = [], employees = [] }) {
  // Memoize safeLineItems to prevent unnecessary re-renders and ensure stable reference
  // This helps optimize profitabilityData's useMemo dependency.
  const safeLineItems = useMemo(() => {
    return Array.isArray(lineItems) ? lineItems : [];
  }, [lineItems]);

  const [techTimeLogs, setTechTimeLogs] = useState([]);
  const [loadingLaborCost, setLoadingLaborCost] = useState(false);
  const [showTechTimeModal, setShowTechTimeModal] = useState(false);
  const [localWorkOrder, setLocalWorkOrder] = useState(workOrder);

  useEffect(() => {
    setLocalWorkOrder(workOrder);
  }, [workOrder]);

  const refreshWorkOrder = async () => {
    if (workOrder?.id) {
       try {
           const wos = await base44.entities.WorkOrder.filter({ id: workOrder.id });
           if (wos && wos.length > 0) {
               setLocalWorkOrder(wos[0]);
           }
       } catch (e) {
           console.error("Error refreshing WO", e);
       }
    }
  };

  useEffect(() => {
    const fetchTechTimeLogs = async () => {
      const projectsToFetch = workPROProjects && workPROProjects.length > 0 
        ? workPROProjects 
        : (workPROProject?.id ? [workPROProject] : []);

      if (!open || projectsToFetch.length === 0) {
        setTechTimeLogs([]);
        return;
      }
      setLoadingLaborCost(true);
      try {
        let allLogs = [];
        
        // Process in batches to avoid rate limits
        const BATCH_SIZE = 3;
        for (let i = 0; i < projectsToFetch.length; i += BATCH_SIZE) {
          const batch = projectsToFetch.slice(i, i + BATCH_SIZE);
          const promises = batch.map(p => 
            base44.functions.invoke('getProjectTimeSessions', { projectId: p.id })
          );
          
          const responses = await Promise.all(promises);
          
          responses.forEach(response => {
            if (response.data?.success && Array.isArray(response.data.logs)) {
              allLogs = [...allLogs, ...response.data.logs];
            }
          });

          // Small delay between batches
          if (i + BATCH_SIZE < projectsToFetch.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        // Remove duplicates if any
        const uniqueLogs = Array.from(new Map(allLogs.map(log => [log.id, log])).values());
        setTechTimeLogs(uniqueLogs);

      } catch (error) {
        console.error('Failed to fetch TechTimeLogs:', error);
        setTechTimeLogs([]);
      } finally {
        setLoadingLaborCost(false);
      }
    };
    fetchTechTimeLogs();
  }, [open, workPROProjects, workPROProject]);

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

    const billedHours = safeLineItems.reduce((sum, item) => {
      return sum + (Number(item.hrs) || 0);
    }, 0);
    
    // Calculate actual labor cost from tech time logs (WorkPRO + Manual)
    let laborCost = 0;
    let actualCostCalculated = false;

    // 1. Parse manual logs from WorkOrder
    let manualLogs = [];
    if (localWorkOrder?.tech_time) {
      try {
        manualLogs = JSON.parse(localWorkOrder.tech_time);
      } catch (e) {
        console.error("Error parsing localWorkOrder.tech_time:", e);
      }
    }

    // 2. Combine logs
    // Normalize manual logs to match structure or handle both in reducer
    const allLogs = [
      ...techTimeLogs.map(l => ({ ...l, source: 'workpro' })),
      ...manualLogs.map(l => ({ 
        ...l, 
        source: 'manual', 
        hours: parseFloat(l.hours) || 0,
        // Manual logs use 'tech_name'
        workpro_user_name: l.tech_name 
      }))
    ];

    if (allLogs.length > 0 && employees.length > 0) {
      actualCostCalculated = true;
      laborCost = allLogs.reduce((sum, log) => {
        // Try to match employee by name
        // For WorkPRO logs: workpro_user_name is set by backend function
        // For Manual logs: we mapped tech_name to workpro_user_name above
        const employee = employees.find(emp => 
          (emp.full_name && log.workpro_user_name && emp.full_name.trim().toLowerCase() === log.workpro_user_name.trim().toLowerCase()) ||
          (emp.email && log.email && emp.email.trim().toLowerCase() === log.email.trim().toLowerCase())
        );
        
        if (employee && employee.pay_rate) {
          const rawRate = employee.pay_rate;
          const cleanRate = typeof rawRate === 'string' ? rawRate.replace(/[$,]/g, '') : rawRate;
          const payRate = parseFloat(cleanRate) || 0;
          return sum + (Number(log.hours) || 0) * payRate;
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
        actualCostCalculated: actualCostCalculated,
        billedHours: billedHours
      }
    };
  }, [safeLineItems, techTimeLogs, employees, localWorkOrder?.tech_time]);

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

  // Calculate total hours including manual logs
  const totalTechHours = useMemo(() => {
    let manualLogs = [];
    if (workOrder?.tech_time) {
      try {
        manualLogs = JSON.parse(workOrder.tech_time);
      } catch (e) {
        console.error("Error parsing workOrder.tech_time:", e);
      }
    }
    const manualHours = manualLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);
    const workProHours = techTimeLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    return manualHours + workProHours;
  }, [workOrder?.tech_time, techTimeLogs]);

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
                    {(profitabilityData.profitMargin || 0).toFixed(1)}%
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
                    {(profitabilityData.partsData.margin || 0).toFixed(1)}%
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
                    Tech Time {(totalTechHours || 0).toFixed(1)}h
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left py-2 px-4 font-medium text-slate-500">Metric</th>
                      <th className="text-right py-2 px-4 font-medium text-slate-500">Hours</th>
                      <th className="text-right py-2 px-4 font-medium text-slate-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 px-4 text-slate-600">Revenue</td>
                      <td className="text-right py-2 px-4">{(profitabilityData.laborData.billedHours || 0).toFixed(1)}</td>
                      <td className="text-right py-2 px-4 font-semibold">{formatCurrency(profitabilityData.laborData.revenue)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-4 text-slate-600">
                        Cost{profitabilityData.laborData.actualCostCalculated ? '' : ' (Est)'}
                      </td>
                      <td className="text-right py-2 px-4">{(totalTechHours || 0).toFixed(1)}</td>
                      <td className="text-right py-2 px-4 font-semibold">{formatCurrency(profitabilityData.laborData.cost)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-4 text-slate-600">Profit</td>
                      <td className={`text-right py-2 px-4 ${(profitabilityData.laborData.billedHours - totalTechHours) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {((profitabilityData.laborData.billedHours || 0) - (totalTechHours || 0)).toFixed(1)}
                      </td>
                      <td className={`text-right py-2 px-4 font-semibold ${getMarginColor(profitabilityData.laborData.margin)}`}>
                        {formatCurrency(profitabilityData.laborData.profit)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 text-slate-600">Margin</td>
                      <td className="text-right py-2 px-4 text-slate-400">-</td>
                      <td className="text-right py-2 px-4">
                        <Badge className={getMarginBadgeColor(profitabilityData.laborData.margin)}>
                          {(profitabilityData.laborData.margin || 0).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
                                {(margin || 0).toFixed(1)}%
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
          projects={workPROProjects && workPROProjects.length > 0 ? workPROProjects : (workPROProject ? [workPROProject] : [])}
          workOrder={localWorkOrder}
          onTimeChange={refreshWorkOrder}
        />
      </DialogContent>
    </Dialog>
  );
}