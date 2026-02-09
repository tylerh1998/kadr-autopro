import React, { useState } from 'react';
import moment from 'moment';
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CashFlowTable from '@/components/cash-flow/CashFlowTable';
import CashFlowTotals from '@/components/cash-flow/CashFlowTotals';
import APSummaryTable from '@/components/suppliers/APSummaryTable';

export default function CashFlow() {
  const [activeTab, setActiveTab] = useState("cashflow");
  // Initialize 40 empty rows
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

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  // Summary State
  const [summaryData, setSummaryData] = useState({
    bankBalance: '',
    padRegistries: '',
    upcomingPayroll: '',
    payrollRemit: '',
    gstRemit: '',
    fiscalCushion: 1000,
    expectedDeposits: '',
    padRegistriesDetails: Array(10).fill({ name: '', amount: '' })
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

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Cash Flow Management</h1>
            <p className="text-slate-500">Manage pending and upcoming payments.</p>
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4 w-full justify-start border-b rounded-none px-0 bg-transparent h-auto p-0">
                <TabsTrigger 
                  value="cashflow" 
                  className="rounded-t-lg rounded-b-none border-t border-x border-b-0 border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white px-6 py-2.5 font-medium"
                >
                  Cash Flow Table
                </TabsTrigger>
                <TabsTrigger 
                  value="apsummary" 
                  className="rounded-t-lg rounded-b-none border-t border-x border-b-0 border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white px-6 py-2.5 font-medium"
                >
                  AP Summary Table
                </TabsTrigger>
              </TabsList>
              
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
            </Tabs>
          </div>

          {/* Sidebar - Totals (Right Side) */}
          <div className="w-full xl:w-96 flex-shrink-0">
            <div className="sticky top-24">
              <CashFlowTotals 
                rows={rows} 
                summaryData={summaryData}
                onSummaryChange={setSummaryData}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}