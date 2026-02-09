import React, { useState } from 'react';
import moment from 'moment';
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CashFlowTable from '@/components/cash-flow/CashFlowTable';
import CashFlowTotals from '@/components/cash-flow/CashFlowTotals';
import APSummaryTable from '@/components/suppliers/APSummaryTable';
import OverheadTable from '@/components/cash-flow/OverheadTable';
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { createPageUrl } from '@/utils';

export default function CashFlow() {
  const [activeTab, setActiveTab] = useState("cashflow");
  
  // Cash Flow Table State
  const [rows, setRows] = useState(Array(40).fill({
    due: false,
    supplier: '',
    amount: '',
    amountPaid: '',
    dueDate: '',
    datePaid: '',
    chqNumber: '',
    method: '',
    comment: ''
  }));

  // Overhead Table State
  const [overheadRows, setOverheadRows] = useState(Array(20).fill({
    description: '',
    amount: '',
    dateOption: '',
    method: ''
  }));

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [overheadSortConfig, setOverheadSortConfig] = useState({ key: null, direction: 'ascending' });

  // Summary State
  const [summaryData, setSummaryData] = useState({
    bankBalance: '',
    padRegistries: '',
    upcomingPayroll: '',
    payrollRemit: '',
    gstRemit: '',
    fiscalCushion: 1000,
    expectedDeposits: '',
    padRegistriesDetails: Array(10).fill({ name: '', amount: '' }),
    // Monthly Estimates
    estFirstPayroll: '',
    estSecondPayroll: '',
    estPayrollRemit: '',
    // Etransfer Limits
    etransferPerTx: '',
    etransferDaily: '',
    etransferWeekly: '',
    etransferMonthly: ''
  });

  const [headerData, setHeaderData] = useState({
    lastUpdated: moment().format('MMM D, YYYY'),
    monthEnd: moment().endOf('month').format('MMM D, YYYY')
  });

  const calculateBusinessDays = (endDateStr) => {
    if (!endDateStr) return 0;
    
    const formats = [
      "YYYY-MM-DD", 
      "MMM D", "MMM DD", "MMM D, YYYY", "MMM DD, YYYY",
      "M/D/YYYY", "MM/DD/YYYY", "M-D-YYYY", "MM-DD-YYYY",
      "M/D", "MM/DD" 
    ];
    
    let end = moment(endDateStr, formats, true);
    if (!end.isValid()) end = moment(endDateStr);
    if (!end.isValid()) return 0;

    end = end.startOf('day');
    const current = moment().startOf('day');
    
    if (end.isBefore(current)) return 0;

    let businessDays = 0;
    // Clone to avoid modifying current
    const cursor = current.clone();
    
    while (cursor.isSameOrBefore(end)) {
        if (cursor.day() !== 0 && cursor.day() !== 6) {
            businessDays++;
        }
        cursor.add(1, 'days');
    }
    
    return businessDays;
  };

  const workDaysLeft = calculateBusinessDays(headerData.monthEnd);

  const getWorkDaysColor = (days) => {
      if (days <= 5) return "bg-red-100 text-red-700 border-red-200";
      if (days <= 10) return "bg-yellow-100 text-yellow-800 border-yellow-200";
      return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedRows = [...rows].sort((a, b) => {
      if (!a[key] && !b[key]) return 0;
      if (!a[key]) return 1;
      if (!b[key]) return -1;

      let valA = a[key];
      let valB = b[key];

      // Numeric check for amount
      if (key === 'amount') {
         valA = parseFloat(valA) || 0;
         valB = parseFloat(valB) || 0;
      }
      // String comparison for others
      else {
          valA = valA.toString().toLowerCase();
          valB = valB.toString().toLowerCase();
      }

      if (valA < valB) return direction === 'ascending' ? -1 : 1;
      if (valA > valB) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setRows(sortedRows);
  };

  const handleOverheadSort = (key) => {
    let direction = 'ascending';
    if (overheadSortConfig.key === key && overheadSortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setOverheadSortConfig({ key, direction });

    const sortedRows = [...overheadRows].sort((a, b) => {
      if (!a[key] && !b[key]) return 0;
      if (!a[key]) return 1;
      if (!b[key]) return -1;

      let valA = a[key];
      let valB = b[key];

      if (key === 'amount') {
         valA = parseFloat(valA) || 0;
         valB = parseFloat(valB) || 0;
      } else {
          valA = valA.toString().toLowerCase();
          valB = valB.toString().toLowerCase();
      }

      if (valA < valB) return direction === 'ascending' ? -1 : 1;
      if (valA > valB) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setOverheadRows(sortedRows);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-slate-900">Cash Flow</h1>
            <TabsList className="bg-slate-200/50 p-1 rounded-lg">
                <TabsTrigger 
                  value="cashflow" 
                  className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Cash Flow Table
                </TabsTrigger>
                <TabsTrigger 
                  value="apsummary" 
                  className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  AP Summary Table
                </TabsTrigger>
                <TabsTrigger 
                  value="overhead" 
                  className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Overhead
                </TabsTrigger>
              </TabsList>
          </div>

          <div className="flex gap-4 items-end bg-white p-3 rounded-lg border shadow-sm">
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Updated</span>
                <Input 
                    value={headerData.lastUpdated}
                    onChange={(e) => setHeaderData({...headerData, lastUpdated: e.target.value})}
                    className="w-32 h-9 text-center bg-slate-50 border-slate-200 focus-visible:ring-1"
                    placeholder="MMM D"
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Month End</span>
                <Input 
                    value={headerData.monthEnd}
                    onChange={(e) => setHeaderData({...headerData, monthEnd: e.target.value})}
                    className="w-32 h-9 text-center bg-slate-50 border-slate-200 focus-visible:ring-1"
                    placeholder="MMM D"
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Work Days Left</span>
                <div className={`flex justify-center items-center w-32 h-9 rounded-md border transition-colors ${getWorkDaysColor(workDaysLeft)}`}>
                    <span className="text-sm font-bold">{workDaysLeft} Days</span>
                </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Main Content - Table (Left Side) */}
          <div className="flex-1 min-w-0">
              <TabsContent value="cashflow" className="mt-0">
                <CashFlowTable 
                  rows={rows} 
                  onRowChange={setRows} 
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
              </TabsContent>
              
              <TabsContent value="apsummary" className="mt-0">
                <APSummaryTable />
              </TabsContent>

              <TabsContent value="overhead" className="mt-0">
                <OverheadTable 
                    rows={overheadRows} 
                    onRowChange={setOverheadRows}
                    sortConfig={overheadSortConfig}
                    onSort={handleOverheadSort}
                />
              </TabsContent>
          </div>

          {/* Sidebar - Totals (Right Side) */}
          <div className="w-full xl:w-96 flex-shrink-0">
            <div className="sticky top-24">
              <CashFlowTotals 
                rows={rows} 
                overheadRows={overheadRows}
                summaryData={summaryData}
                onSummaryChange={setSummaryData}
              />
            </div>
          </div>
        </div>
        </Tabs>
      </div>
    </div>
  );
}