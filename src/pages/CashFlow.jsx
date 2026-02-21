import React, { useState, useEffect, useCallback, useRef } from 'react';
import moment from 'moment';
import { debounce } from 'lodash';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CashFlowTable from '@/components/cash-flow/CashFlowTable';
import CashFlowTotals from '@/components/cash-flow/CashFlowTotals';
import APSummaryTable from '@/components/suppliers/APSummaryTable';
import OverheadTable from '@/components/cash-flow/OverheadTable';
import CashFlowTrendTab from '@/components/cash-flow/CashFlowTrendTab';
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { createPageUrl } from '@/utils';

export default function CashFlow() {
  const [activeTab, setActiveTab] = useState("cashflow");
  const [summaryId, setSummaryId] = useState(null);
  
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
    comment: '',
    bg_colour: '',
    rowStatus: ''
  }));

  // Overhead Table State
  const [overheadRows, setOverheadRows] = useState(Array(35).fill({
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

  // Load Data
  useEffect(() => {
    const formatCurrency = (val) => {
        if (val === null || val === undefined || val === '') return '';
        return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val);
    };

    const loadData = async () => {
      try {
        // Fetch Entries - sorted by sort_order
        const entries = await base44.entities.CashFlowEntry.list('sort_order', 100);
        
        const loadedRows = entries.map(entry => ({
            id: entry.id,
            due: false, // Calculated on frontend usually, but keeping consistent structure
            supplier: entry.supplier || '',
            amount: formatCurrency(entry.amount),
            amountPaid: formatCurrency(entry.amount_paid),
            dueDate: entry.due_date ? moment(entry.due_date).format('MMM D') : '',
            datePaid: entry.date_paid ? moment(entry.date_paid).format('MMM D') : '',
            chqNumber: entry.chq_number || '',
            method: entry.method || '',
            comment: entry.comment || '',
            bg_colour: entry.bg_colour || '',
            rowStatus: entry.row_status || '',
            sortOrder: entry.sort_order || 0
        }));

        // Pad to 40
        while (loadedRows.length < 40) {
            loadedRows.push({
                due: false, supplier: '', amount: '', amountPaid: '', 
                dueDate: '', datePaid: '', chqNumber: '', method: '', comment: '',
                bg_colour: '', rowStatus: ''
            });
        }
        setRows(loadedRows);

        // Fetch Summary
        const summaries = await base44.entities.CashFlowSummary.list();
        let summary;
        if (summaries.length > 0) {
            summary = summaries[0];
        } else {
            summary = await base44.entities.CashFlowSummary.create({
                last_updated: new Date().toISOString(),
                month_end: moment().endOf('month').toISOString(),
                current_bank_balance: 0,
                fiscal_cushion: 1000,
                pad_registries_details: JSON.stringify(Array(10).fill({ name: '', amount: '' })),
                overhead_items: JSON.stringify(Array(35).fill({ description: '', amount: '', dateOption: '', method: '' }))
            });
        }
        setSummaryId(summary.id);

        // Parse Summary Data
        const safeFormat = (val) => {
             if (!val) return '';
             const num = parseFloat(val.toString().replace(/[^0-9.-]+/g,""));
             return isNaN(num) ? '' : formatCurrency(num);
        };

        let padDetails = [];
        try {
            padDetails = summary.pad_registries_details ? JSON.parse(summary.pad_registries_details) : Array(10).fill({ name: '', amount: '' });
            // Format amounts in padDetails
            padDetails = padDetails.map(item => ({ ...item, amount: safeFormat(item.amount) }));
        } catch (e) { padDetails = Array(10).fill({ name: '', amount: '' }); }
        
        while (padDetails.length < 10) padDetails.push({ name: '', amount: '' });

        let overheadItems = [];
        try {
            overheadItems = summary.overhead_items ? JSON.parse(summary.overhead_items) : Array(35).fill({ description: '', amount: '', dateOption: '', method: '' });
            // Format amounts in overheadItems
            overheadItems = overheadItems.map(item => ({ ...item, amount: safeFormat(item.amount) }));
        } catch (e) { overheadItems = Array(35).fill({ description: '', amount: '', dateOption: '', method: '' }); }

        while (overheadItems.length < 35) overheadItems.push({ description: '', amount: '', dateOption: '', method: '' });

        setSummaryData({
            bankBalance: formatCurrency(summary.current_bank_balance),
            padRegistries: formatCurrency(summary.pad_registries_total),
            upcomingPayroll: formatCurrency(summary.upcoming_payroll),
            payrollRemit: formatCurrency(summary.payroll_remit),
            gstRemit: formatCurrency(summary.gst_remit),
            fiscalCushion: formatCurrency(summary.fiscal_cushion !== undefined ? summary.fiscal_cushion : 1000),
            expectedDeposits: formatCurrency(summary.expected_deposits),
            padRegistriesDetails: padDetails,
            estFirstPayroll: formatCurrency(summary.est_first_payroll),
            estSecondPayroll: formatCurrency(summary.est_second_payroll),
            estPayrollRemit: formatCurrency(summary.est_payroll_remit),
            etransferPerTx: formatCurrency(summary.etransfer_per_tx),
            etransferDaily: formatCurrency(summary.etransfer_daily),
            etransferWeekly: formatCurrency(summary.etransfer_weekly),
            etransferMonthly: formatCurrency(summary.etransfer_monthly)
        });

        setOverheadRows(overheadItems);
        
        setHeaderData({
            lastUpdated: summary.last_updated ? moment(summary.last_updated).format('MMM D, YYYY') : '',
            monthEnd: summary.month_end ? moment(summary.month_end).format('MMM D, YYYY') : ''
        });

      } catch (error) {
        console.error("Error loading cash flow data:", error);
      }
    };
    loadData();
  }, []);

  // --- Persistence Logic ---

  // Debounced save for individual rows
  const saveRowToDb = useCallback(debounce(async (row, sortOrder) => {
    if (!row.supplier && !row.amount) return; // Don't save empty rows

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        // Try strict formats first
        const formats = [
            "MMM D, YYYY", "MMM DD, YYYY", "YYYY-MM-DD",
            "MMM D", "MMM DD", "M/D/YYYY", "MM/DD/YYYY"
        ];
        let m = moment(dateStr, formats, true);
        if (!m.isValid()) m = moment(dateStr); // Fallback
        return m.isValid() ? m.format('YYYY-MM-DD') : null;
    };

    const payload = {
        supplier: row.supplier,
        amount: parseFloat(row.amount.toString().replace(/[^0-9.-]+/g,"")) || 0,
        amount_paid: parseFloat(row.amountPaid.toString().replace(/[^0-9.-]+/g,"")) || 0,
        due_date: parseDate(row.dueDate),
        date_paid: parseDate(row.datePaid),
        chq_number: row.chqNumber,
        method: row.method,
        comment: row.comment,
        bg_colour: row.bg_colour,
        row_status: row.rowStatus
    };

    try {
        if (row.id) {
            await base44.entities.CashFlowEntry.update(row.id, payload);
        } else {
            const newRec = await base44.entities.CashFlowEntry.create(payload);
            // We need to update the state with the new ID to prevent duplicate creates
            // This is handled by a specialized update function calling this
            return newRec.id;
        }
    } catch (e) {
        console.error("Error saving row:", e);
    }
  }, 1000), []);

  const handleRowChange = async (newRows) => {
    // Identify changed row
    const changedIndex = newRows.findIndex((row, i) => row !== rows[i]);
    setRows(newRows); // Update UI immediately

    if (changedIndex !== -1) {
        const row = newRows[changedIndex];
        const result = await saveRowToDb(row);
        
        // If we just created a new row and got an ID back, update state
        if (result && !row.id) {
             setRows(prev => {
                 const updated = [...prev];
                 updated[changedIndex] = { ...updated[changedIndex], id: result };
                 return updated;
             });
        }
    }
  };

  const handleDeleteRow = async (index) => {
    const row = rows[index];
    
    // Update UI immediately (clear the row)
    const newRows = [...rows];
    newRows[index] = {
        due: false, supplier: '', amount: '', amountPaid: '', 
        dueDate: '', datePaid: '', chqNumber: '', method: '', comment: '',
        bg_colour: '', rowStatus: ''
    };
    setRows(newRows);

    // Delete from DB if it exists
    if (row.id) {
        try {
            await base44.entities.CashFlowEntry.delete(row.id);
        } catch (e) {
            console.error("Failed to delete row:", e);
        }
    }
  };

  // Debounced save for Summary
  const saveSummaryToDb = useCallback(debounce(async (id, data, overhead, header) => {
    if (!id) return;
    
    const payload = {
        current_bank_balance: parseFloat(data.bankBalance.toString().replace(/[^0-9.-]+/g,"")) || 0,
        pad_registries_total: parseFloat(data.padRegistries.toString().replace(/[^0-9.-]+/g,"")) || 0,
        upcoming_payroll: parseFloat(data.upcomingPayroll.toString().replace(/[^0-9.-]+/g,"")) || 0,
        payroll_remit: parseFloat(data.payrollRemit.toString().replace(/[^0-9.-]+/g,"")) || 0,
        gst_remit: parseFloat(data.gstRemit.toString().replace(/[^0-9.-]+/g,"")) || 0,
        fiscal_cushion: parseFloat(data.fiscalCushion.toString().replace(/[^0-9.-]+/g,"")) || 0,
        expected_deposits: parseFloat(data.expectedDeposits.toString().replace(/[^0-9.-]+/g,"")) || 0,
        
        est_first_payroll: parseFloat(data.estFirstPayroll.toString().replace(/[^0-9.-]+/g,"")) || 0,
        est_second_payroll: parseFloat(data.estSecondPayroll.toString().replace(/[^0-9.-]+/g,"")) || 0,
        est_payroll_remit: parseFloat(data.estPayrollRemit.toString().replace(/[^0-9.-]+/g,"")) || 0,

        etransfer_per_tx: parseFloat(data.etransferPerTx.toString().replace(/[^0-9.-]+/g,"")) || 0,
        etransfer_daily: parseFloat(data.etransferDaily.toString().replace(/[^0-9.-]+/g,"")) || 0,
        etransfer_weekly: parseFloat(data.etransferWeekly.toString().replace(/[^0-9.-]+/g,"")) || 0,
        etransfer_monthly: parseFloat(data.etransferMonthly.toString().replace(/[^0-9.-]+/g,"")) || 0,

        pad_registries_details: JSON.stringify(data.padRegistriesDetails.map(item => ({
            ...item,
            amount: item.amount ? (parseFloat(item.amount.toString().replace(/[^0-9.-]+/g,"")) || 0) : ''
        }))),
        overhead_items: JSON.stringify(overhead.map(item => ({
            ...item,
            amount: item.amount ? (parseFloat(item.amount.toString().replace(/[^0-9.-]+/g,"")) || 0) : ''
        }))),
        
        last_updated: header.lastUpdated ? moment(header.lastUpdated, ["MMM D, YYYY", "MMM D"]).toISOString() : null,
        month_end: header.monthEnd ? moment(header.monthEnd, ["MMM D, YYYY", "MMM D"]).toISOString() : null
    };

    try {
        await base44.entities.CashFlowSummary.update(id, payload);
    } catch (e) {
        console.error("Error saving summary:", e);
    }
  }, 1000), []);

  const handleSummaryChange = (newData) => {
    setSummaryData(newData);
    saveSummaryToDb(summaryId, newData, overheadRows, headerData);
  };

  const handleOverheadChange = (newRows) => {
    setOverheadRows(newRows);
    saveSummaryToDb(summaryId, summaryData, newRows, headerData);
  };

  const handleHeaderChange = (newHeader) => {
      setHeaderData(newHeader);
      saveSummaryToDb(summaryId, summaryData, overheadRows, newHeader);
  };

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
    <div className="p-6">
      <div className="max-w-[1800px] mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full">
            <h1 className="text-3xl font-bold text-slate-900">Cash Flow</h1>
            <div className="overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsList className="bg-slate-200/50 p-1.5 rounded-xl inline-flex w-max">
                    <TabsTrigger 
                    value="cashflow" 
                    className="rounded-lg px-6 py-2.5 text-base font-medium bg-white text-slate-900 hover:bg-slate-200 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                    >
                    Cash Flow
                    </TabsTrigger>
                    <TabsTrigger 
                    value="apsummary" 
                    className="rounded-lg px-6 py-2.5 text-base font-medium bg-white text-slate-900 hover:bg-slate-200 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                    >
                    AP Summary
                    </TabsTrigger>
                    <TabsTrigger 
                    value="trends" 
                    className="rounded-lg px-6 py-2.5 text-base font-medium bg-white text-slate-900 hover:bg-slate-200 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                    >
                    Trends
                    </TabsTrigger>
                    <TabsTrigger 
                    value="overhead" 
                    className="rounded-lg px-6 py-2.5 text-base font-medium bg-white text-slate-900 hover:bg-slate-200 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                    >
                    Overhead
                    </TabsTrigger>
                </TabsList>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Main Content - Table (Left Side) */}
          <div className="flex-1 min-w-0 w-full">
              <TabsContent value="cashflow" className="mt-0">
                <CashFlowTable 
                  rows={rows} 
                  onRowChange={handleRowChange} 
                  onDeleteRow={handleDeleteRow}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
              </TabsContent>
              
              <TabsContent value="apsummary" className="mt-0">
                <APSummaryTable />
              </TabsContent>

              <TabsContent value="trends" className="mt-0">
                <CashFlowTrendTab 
                  overheadRows={overheadRows}
                  cashFlowRows={rows}
                  workDaysLeft={workDaysLeft}
                  monthEnd={headerData.monthEnd}
                />
              </TabsContent>

              <TabsContent value="overhead" className="mt-0">
                <OverheadTable 
                    rows={overheadRows} 
                    onRowChange={handleOverheadChange}
                    sortConfig={overheadSortConfig}
                    onSort={handleOverheadSort}
                />
              </TabsContent>
          </div>

          {/* Sidebar - Totals (Right Side) */}
          <div className="w-full xl:w-96 flex-shrink-0 order-first xl:order-last">
            <div className="xl:sticky xl:top-24 space-y-4">
              
              {/* Header Inputs */}
              <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-xl border shadow-sm">
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Last Updated</span>
                    <Input 
                        value={headerData.lastUpdated}
                        onChange={(e) => handleHeaderChange({...headerData, lastUpdated: e.target.value})}
                        className="h-9 text-center bg-slate-50 border-slate-200 text-sm font-medium px-1"
                        placeholder="MMM D"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Month End</span>
                    <Input 
                        value={headerData.monthEnd}
                        onChange={(e) => handleHeaderChange({...headerData, monthEnd: e.target.value})}
                        className="h-9 text-center bg-slate-50 border-slate-200 text-sm font-medium px-1"
                        placeholder="MMM D"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Days Left</span>
                    <div className={`flex justify-center items-center h-9 rounded-md border transition-colors ${getWorkDaysColor(workDaysLeft)}`}>
                        <span className="text-sm font-bold">{workDaysLeft} Days</span>
                    </div>
                </div>
              </div>

              <CashFlowTotals 
                rows={rows} 
                overheadRows={overheadRows}
                summaryData={summaryData}
                onSummaryChange={handleSummaryChange}
              />
            </div>
          </div>
        </div>
        </Tabs>
      </div>
    </div>
  );
}