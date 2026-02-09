import React, { useState } from 'react';
import CashFlowTable from '@/components/cash-flow/CashFlowTable';
import CashFlowTotals from '@/components/cash-flow/CashFlowTotals';

export default function CashFlow() {
  // Initialize 40 empty rows
  const [rows, setRows] = useState(Array(40).fill({
    due: false,
    supplier: '',
    amount: '',
    dueDate: '',
    datePaid: '',
    chqNumber: '',
    method: ''
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
    expectedDeposits: ''
  });

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
        <div className="flex flex-col gap-2 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Cash Flow Management</h1>
          <p className="text-slate-500">Manage pending and upcoming payments.</p>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Main Content - Table (Left Side) */}
          <div className="flex-1 min-w-0">
            <CashFlowTable 
              rows={rows} 
              onRowChange={setRows} 
              sortConfig={sortConfig}
              onSort={handleSort}
            />
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