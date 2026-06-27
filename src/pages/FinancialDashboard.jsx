import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowLeft, Calendar, RefreshCw, Printer } from 'lucide-react';
import { format, subMonths, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import CashFlowTrendReport from '@/components/financial-dashboard/CashFlowTrendReport';
import AccountBalancesByTypeReport from '@/components/financial-dashboard/AccountBalancesByTypeReport';
import TopExpenseCategoriesReport from '@/components/financial-dashboard/TopExpenseCategoriesReport';

const REPORT_OPTIONS = [
  { value: 'cashFlow', label: 'Cash Flow Trend' },
  { value: 'accountBalances', label: 'Account Balances by Type' },
  { value: 'topExpenses', label: 'Top Expense Categories' }
];

export default function FinancialDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const initialToDate = format(new Date(), 'yyyy-MM-dd');
  const initialFromDate = format(subMonths(new Date(), 12), 'yyyy-MM-dd');
  const [appliedDaysBack, setAppliedDaysBack] = useState(365);
  const [appliedFromDate, setAppliedFromDate] = useState(initialFromDate);
  const [appliedToDate, setAppliedToDate] = useState(initialToDate);
  const [draftDaysBack, setDraftDaysBack] = useState(365);
  const [draftFromDate, setDraftFromDate] = useState(initialFromDate);
  const [draftToDate, setDraftToDate] = useState(initialToDate);
  const [reportType, setReportType] = useState('cashFlow');

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('getFinancialDashboardData', {
        dateRange: {
          from: appliedFromDate,
          to: appliedToDate
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
  }, [appliedFromDate, appliedToDate]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleDaysBackChange = (value) => {
    setDraftDaysBack(value);
    const calculatedFromDate = format(subDays(new Date(draftToDate), parseInt(value) || 0), 'yyyy-MM-dd');
    setDraftFromDate(calculatedFromDate);
  };

  const handleApplyFilters = () => {
    setAppliedDaysBack(draftDaysBack);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
  };

  const applyQuickRange = (from, to) => {
    const calculatedDaysBack = Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000));
    setDraftDaysBack(calculatedDaysBack);
    setDraftFromDate(from);
    setDraftToDate(to);
    setAppliedDaysBack(calculatedDaysBack);
    setAppliedFromDate(from);
    setAppliedToDate(to);
  };

  const handlePrint = () => {
    window.print();
  };

  const getReportLabel = () => {
    return REPORT_OPTIONS.find((option) => option.value === reportType)?.label || 'Financial Dashboard';
  };

  const renderReport = () => {
    if (!dashboardData) return null;

    const { charts } = dashboardData;

    switch (reportType) {
      case 'accountBalances':
        return charts.accountBalancesByType.length > 0 ? <AccountBalancesByTypeReport data={charts.accountBalancesByType} /> : null;
      case 'topExpenses':
        return charts.topExpenseCategories.length > 0 ? <TopExpenseCategoriesReport data={charts.topExpenseCategories} /> : null;
      case 'cashFlow':
      default:
        return charts.cashFlow.length > 0 ? <CashFlowTrendReport data={charts.cashFlow} /> : null;
    }
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

          <Card className="no-print">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label>Days Back</Label>
                  <Input
                    type="number"
                    value={draftDaysBack}
                    onChange={(e) => handleDaysBackChange(e.target.value)}
                    className="w-28"
                  />
                </div>
                <div className="space-y-2 w-[170px]">
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={draftFromDate}
                    onChange={(e) => setDraftFromDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 w-[170px]">
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={draftToDate}
                    onChange={(e) => setDraftToDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Button onClick={handleApplyFilters} className="bg-blue-600 hover:bg-blue-700">
                  <Calendar className="w-4 h-4 mr-2" />
                  Apply
                </Button>
                <div className="space-y-2 flex-1 min-w-[260px] ml-auto">
                  <Label>Report</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select report" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    applyQuickRange(
                      format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'),
                      format(now, 'yyyy-MM-dd')
                    );
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
                    applyQuickRange(format(lastMonth, 'yyyy-MM-dd'), format(lastDay, 'yyyy-MM-dd'));
                  }}
                >
                  Last Month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    applyQuickRange(format(subMonths(now, 3), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'));
                  }}
                >
                  Last 3 Months
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    applyQuickRange(`${year}-01-01`, `${year}-03-31`);
                  }}
                >
                  Q1
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    applyQuickRange(`${year}-04-01`, `${year}-06-30`);
                  }}
                >
                  Q2
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    applyQuickRange(`${year}-07-01`, `${year}-09-30`);
                  }}
                >
                  Q3
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    applyQuickRange(`${year}-10-01`, `${year}-12-31`);
                  }}
                >
                  Q4
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear();
                    applyQuickRange(`${year}-01-01`, format(new Date(), 'yyyy-MM-dd'));
                  }}
                >
                  This Year
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const year = new Date().getFullYear() - 1;
                    applyQuickRange(`${year}-01-01`, `${year}-12-31`);
                  }}
                >
                  Last Year
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="print-area">
            <div className="print-title" style={{ display: 'none' }}>
              {getReportLabel()} - {format(new Date(appliedFromDate), 'MMM d, yyyy')} to {format(new Date(appliedToDate), 'MMM d, yyyy')}
            </div>
            {renderReport()}
          </div>
        </div>
      </div>
    </>
  );
}