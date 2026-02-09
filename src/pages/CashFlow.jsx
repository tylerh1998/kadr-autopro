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
            <CashFlowTable rows={rows} onRowChange={setRows} />
          </div>

          {/* Sidebar - Totals (Right Side) */}
          <div className="w-full xl:w-96 flex-shrink-0">
            <div className="sticky top-24">
              <CashFlowTotals rows={rows} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}