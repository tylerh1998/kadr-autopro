import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  BarChart3, ChevronRight, FileText, ArrowLeft,
  TrendingUp, Scale, Calculator, Package, AlertTriangle,
  ShoppingCart, DollarSign, Users, Wrench, Clock, Receipt,
  Percent, BookCopy, CalendarClock
} from 'lucide-react';
import { createPageUrl } from '@/utils';

import InventoryOnOrder from './InventoryOnOrder'; // Import the new component (for 'Parts on Order')
import OtherChargesBreakdownReport from './OtherChargesBreakdownReport';
import ReportableLeviesReport from './ReportableLeviesReport';
import SalesAnalysisReport from './SalesAnalysisReport';
import WorkOrderSummaryReport from './WorkOrderSummaryReport';

// Map icon names to Lucide React components
const iconMap = {
  BarChart3: BarChart3,
  TrendingUp: TrendingUp,
  Scale: Scale,
  FileText: FileText,
  Calculator: Calculator,
  Package: Package,
  AlertTriangle: AlertTriangle,
  ShoppingCart: ShoppingCart,
  DollarSign: DollarSign,
  Users: Users,
  Wrench: Wrench,
  Clock: Clock,
  Receipt: Receipt,
  Percent: Percent,
  BookCopy: BookCopy,
  CalendarClock: CalendarClock,
};

const renderIcon = (iconName) => {
  const IconComponent = iconMap[iconName];
  return IconComponent ? <IconComponent className="w-4 h-4" /> : <FileText className="w-4 h-4" />; // Default icon if not found
};


export default function ReportModal({ open, onClose, reportType, currentUser }) {
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [showPartsOnOrder, setShowPartsOnOrder] = useState(false);
  const [showOtherChargesBreakdown, setShowOtherChargesBreakdown] = useState(false);
  const [showReportableLevies, setShowReportableLevies] = useState(false);
  const [showSalesAnalysis, setShowSalesAnalysis] = useState(false);
  const [showWorkOrderSummary, setShowWorkOrderSummary] = useState(false);

  const getReportOptions = () => {
    switch (reportType) {
      case 'accounting':
        return [
          {
            name: 'Chart of Accounts',
            description: 'List of all accounts and their settings',
            icon: 'FileText',
            path: 'ChartOfAccounts'
          },
          {
            name: 'Cheque Register',
            description: 'View and manage cheque history',
            icon: 'BookCopy',
            path: 'ChequeRegister'
          },
          {
            name: 'Taxes',
            description: 'Manage tax rates and settings',
            icon: 'Percent',
            path: 'Taxes'
          },
          {
            name: 'Journal Entries',
            description: 'Create and view manual journal entries',
            icon: 'BookCopy',
            path: 'JournalEntries'
          },
          {
            name: 'Fiscal Periods',
            description: 'Manage fiscal years and periods',
            icon: 'CalendarClock',
            path: 'FiscalPeriods'
          }
        ];

      case 'financial':
        return [
          {
            name: 'Financial Dashboard',
            description: 'Comprehensive overview of key financial metrics, cash flow, and account balances',
            icon: 'BarChart3',
            path: 'FinancialDashboard'
          },
          {
            name: 'Profit & Loss Statement',
            description: 'Income and expense summary for a specified period',
            icon: 'TrendingUp',
            path: 'PLReport'
          },
          {
            name: 'Balance Sheet',
            description: 'Assets, liabilities, and equity at a point in time',
            icon: 'Scale',
            path: 'BalanceSheet'
          },
          {
            name: 'General Ledger',
            description: 'Detailed transaction history by account',
            icon: 'FileText',
            path: 'GeneralLedger'
          },
          {
            name: 'GL Journal',
            description: 'All general ledger transactions in chronological order',
            icon: 'FileText',
            path: 'GLJournal'
          }
        ];

      case 'inventory':
        return [
          {
            name: 'Inventory Valuation',
            description: 'Current inventory levels and values',
            icon: 'Package',
            reportKey: 'inventory_valuation'
          },
          {
            name: 'Stock Reorder Report',
            description: 'Items below minimum quantity, grouped by supplier',
            icon: 'AlertTriangle',
            path: 'StockReorderReport'
          },
          {
            name: 'Parts Movement',
            description: 'Detailed history of inventory transactions',
            icon: 'TrendingUp',
            reportKey: 'parts_movement'
          },
          {
            name: 'Inventory On Order',
            description: 'Parts currently on order from suppliers',
            icon: 'ShoppingCart',
            reportKey: 'inventory_on_order'
          },
          {
            name: 'Reportable Levies Report',
            description: 'Detailed report of all reportable levies (e.g. Tire Tax)',
            icon: 'FileText',
            reportKey: 'reportable_levies'
          }
        ];

      case 'management':
        return [
          {
            name: 'Sales Analysis',
            description: 'Revenue breakdown and trends',
            icon: 'DollarSign',
            reportKey: 'sales_analysis'
          },
          {
            name: 'Customer Report',
            description: 'Customer transaction history and statistics',
            icon: 'Users',
            reportKey: 'customer_report'
          },
          {
            name: 'Work Order Summary',
            description: 'Status and completion metrics for service jobs',
            icon: 'FileText',
            reportKey: 'wo_summary'
          },
          {
            name: 'Technician Performance',
            description: 'Labor hours and productivity metrics',
            icon: 'Wrench',
            reportKey: 'tech_performance'
          },
          {
            name: 'Other Charges Breakdown',
            description: 'Total of each other charge type posted on invoices',
            icon: 'Receipt',
            reportKey: 'other_charges_breakdown'
          }
        ];

      case 'payroll':
        return [
          {
            name: 'Payroll Summary',
            description: 'Overview of payroll transactions and totals',
            icon: 'DollarSign',
            reportKey: 'payroll_summary'
          },
          {
            name: 'Employee Hours',
            description: 'Detailed hours breakdown by employee',
            icon: 'Clock',
            reportKey: 'employee_hours'
          },
          {
            name: 'Payroll Tax Report',
            description: 'Tax withholdings and employer contributions',
            icon: 'Receipt',
            reportKey: 'payroll_tax'
          }
        ];

      default:
        return [];
    }
  };


  useEffect(() => {
    // Reset when modal is closed or type changes
    if (!open) {
      setSelectedReportId(null);
      setShowPartsOnOrder(false);
      setShowOtherChargesBreakdown(false);
      setShowReportableLevies(false);
      setShowSalesAnalysis(false);
      setShowWorkOrderSummary(false);
    }
  }, [open, reportType]);

  const handleBack = () => {
    setSelectedReportId(null);
    setShowPartsOnOrder(false);
    setShowOtherChargesBreakdown(false);
    setShowReportableLevies(false);
    setShowSalesAnalysis(false);
    setShowWorkOrderSummary(false);
  };

  const handleReportClick = (report) => {
    if (report.path) {
      // Open report in new window
      window.open(createPageUrl(report.path), '_blank', 'width=1400,height=900');
      onClose();
    } else if (report.reportKey === 'inventory_on_order') {
      setShowPartsOnOrder(true);
    } else if (report.reportKey === 'other_charges_breakdown') {
      setShowOtherChargesBreakdown(true);
    } else if (report.reportKey === 'reportable_levies') {
      setShowReportableLevies(true);
    } else if (report.reportKey === 'sales_analysis') {
      if (currentUser?.role === 'admin' || ['lvl2_user', 'lvl3_user'].includes(currentUser?.access_level)) {
        setShowSalesAnalysis(true);
      } else {
        alert("You do not have access to this report.");
      }
    } else if (report.reportKey === 'wo_summary') {
      setShowWorkOrderSummary(true);
    } else if (report.reportKey === 'inventory_valuation') {
      window.open(createPageUrl('InventoryValuation'), '_blank', 'width=1400,height=900');
      onClose();
    } else {
      alert(`Report "${report.name}" is coming soon!`);
    }
  };

  const getCategoryTitle = (type) => {
    switch (type) {
      case 'inventory': return 'Inventory Reports';
      case 'financial': return 'Financial Reports';
      case 'accounting': return 'Accounting';
      case 'management': return 'Management Reports';
      case 'payroll': return 'Payroll Reports';
      default: return 'Reports';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose(); setSelectedReportId(null); setShowPartsOnOrder(false); setShowOtherChargesBreakdown(false); } }}>
      <DialogContent className={`flex flex-col max-h-[90vh] ${showSalesAnalysis || showPartsOnOrder || showOtherChargesBreakdown || showReportableLevies || showWorkOrderSummary ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(showPartsOnOrder || showOtherChargesBreakdown || showReportableLevies || showSalesAnalysis || showWorkOrderSummary || selectedReportId) && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <FileText className="w-5 h-5" />
            {showPartsOnOrder ? 'Inventory On Order' : showOtherChargesBreakdown ? 'Other Charges Breakdown' : showReportableLevies ? 'Reportable Levies Report' : showSalesAnalysis ? 'Sales Analysis' : showWorkOrderSummary ? 'Work Order Summary' : getCategoryTitle(reportType)}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 overflow-y-auto flex-1">
          {showPartsOnOrder ? (
            <InventoryOnOrder />
          ) : showOtherChargesBreakdown ? (
            <OtherChargesBreakdownReport />
          ) : showReportableLevies ? (
            <ReportableLeviesReport />
          ) : showSalesAnalysis ? (
            <SalesAnalysisReport />
          ) : showWorkOrderSummary ? (
            <WorkOrderSummaryReport />
          ) : (
            <div className="space-y-3">
              {getReportOptions().map((report) => (
                <div
                  key={report.reportKey || report.name}
                  onClick={() => handleReportClick(report)}
                  className={`flex justify-between items-center p-4 border rounded-lg transition-colors ${
                    report.path || report.reportKey === 'inventory_on_order' || report.reportKey === 'inventory_valuation' || report.reportKey === 'other_charges_breakdown' || report.reportKey === 'reportable_levies' || report.reportKey === 'sales_analysis' || report.reportKey === 'wo_summary'
                      ? 'cursor-pointer hover:bg-slate-50'
                      : 'cursor-not-allowed bg-slate-50 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {renderIcon(report.icon)}
                    <div>
                      <span className="font-medium">{report.name}</span>
                      {report.description && <p className="text-sm text-slate-500">{report.description}</p>}
                    </div>
                  </div>
                  {(report.path || report.reportKey === 'inventory_on_order' || report.reportKey === 'inventory_valuation' || report.reportKey === 'other_charges_breakdown' || report.reportKey === 'reportable_levies' || report.reportKey === 'sales_analysis' || report.reportKey === 'wo_summary') && <ChevronRight className="w-5 h-5" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}