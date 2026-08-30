import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Printer, Calendar as CalendarIcon, DollarSign, FileText, ArrowUpDown, ExternalLink } from 'lucide-react';
import { format, subMonths, endOfMonth, differenceInDays, parseISO } from 'date-fns';
import moment from 'moment';
import { Badge } from '@/components/ui/badge';
// Tooltip imports removed as we are switching to native title attribute
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SupplierPaymentModal from './SupplierPaymentModal';

const MOUNTAIN_TIMEZONE = 'America/Edmonton';

const getMountainDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOUNTAIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find(part => part.type === 'year')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value),
    day: Number(parts.find(part => part.type === 'day')?.value)
  };
};

const getMountainToday = () => {
  const { year, month, day } = getMountainDateParts();
  return new Date(year, month - 1, day);
};

const formatDateForApi = (date) => {
  if (!date) return null;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDefaultAsOfDate = () => {
  const previousMonth = subMonths(getMountainToday(), 1);
  return endOfMonth(previousMonth);
};

export default function APSummaryTable({ isFullPage = false, onCashFlowUpdate }) {
  const [apSummaryRows, setApSummaryRows] = useState([]);
  const [locSuppliers, setLocSuppliers] = useState([]);
  const [supplierInvoicesMap, setSupplierInvoicesMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(getDefaultAsOfDate);
  const [pendingAsOfDate, setPendingAsOfDate] = useState(getDefaultAsOfDate);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [cashFlowEntries, setCashFlowEntries] = useState([]);

  const navigate = useNavigate();

  const loadData = async (selectedAsOfDate = asOfDate) => {
    setLoading(true);
    try {
      const currentMountainDate = getMountainToday();

      const [response, cfEntriesResponse, locsResponse] = await Promise.all([
        supabase.functions.invoke('autopro-getAPSummary', {
          body: {
            asOfDate: formatDateForApi(selectedAsOfDate),
            startDate: '1900-01-01',
            endDate: formatDateForApi(currentMountainDate),
            supplierIdFilter: null
          }
        }),
        supabase.from('CashFlowEntry').select('*'),
        supabase.from('LinesOfCredit').select('*').eq('is_active', true)
      ]);
      const cfEntries = cfEntriesResponse.data;
      const locs = locsResponse.data;

      if (response.data.success) {
        const rows = response.data.data || [];

        setApSummaryRows(rows.map(row => ({
          id: row.supplier_id,
          name: row.supplier_name,
          not_due: Number(row.not_due || 0),
          balance_0_30: Number(row.balance_0_30 || 0),
          balance_31_60: Number(row.balance_31_60 || 0),
          balance_60_plus: Number(row.balance_60_plus || 0),
          total_balance: Number(row.current_balance || 0)
        })));

        const invoicesMap = new Map();
        rows.forEach(row => {
          const invoices = Array.isArray(row.invoices)
            ? row.invoices.map(invoice => ({ ...invoice, supplier_id: row.supplier_id }))
            : [];
          invoicesMap.set(row.supplier_id, invoices);
        });
        setSupplierInvoicesMap(invoicesMap);
      } else {
        setApSummaryRows([]);
        setSupplierInvoicesMap(new Map());
      }

      setCashFlowEntries(cfEntries || []);

      const locIdsInEntries = new Set((cfEntries || []).map(entry => entry.loc_id).filter(Boolean));
      const locSummaryRows = (locs || [])
        .filter(loc => locIdsInEntries.has(loc.id))
        .map(loc => ({
          id: loc.id,
          name: loc.name,
          is_loc: true,
          not_due: 0,
          balance_0_30: 0,
          balance_31_60: 0,
          balance_60_plus: 0,
          total_balance: 0
        }));

      setLocSuppliers(locSummaryRows);
    } catch (error) {
      console.error('Error loading AP data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(asOfDate);
  }, []);

  const summaryData = useMemo(() => {
    if (loading) return [];

    const supplierSummary = [
      ...apSummaryRows.map(supplier => ({
        ...supplier,
        cashFlowEntries: cashFlowEntries.filter(entry => entry.supplier_id === supplier.id)
      })),
      ...locSuppliers.map(supplier => ({
        ...supplier,
        cashFlowEntries: cashFlowEntries.filter(entry => entry.loc_id === supplier.id)
      }))
    ];

    const filtered = supplierSummary.filter(s => Math.abs(s.total_balance) > 0.01 || s.cashFlowEntries.length > 0);

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [apSummaryRows, locSuppliers, loading, sortConfig, cashFlowEntries]);

  const totals = useMemo(() => {
    const result = summaryData.reduce((acc, curr) => {
      acc.not_due += curr.not_due;
      acc.balance_0_30 += curr.balance_0_30;
      acc.balance_31_60 += curr.balance_31_60;
      acc.balance_60_plus += curr.balance_60_plus;
      acc.total_balance += curr.total_balance;
      return acc;
    }, { not_due: 0, balance_0_30: 0, balance_31_60: 0, balance_60_plus: 0, total_balance: 0 });
    
    result.total_balance = Math.round(result.total_balance * 100) / 100;
    return result;
  }, [summaryData]);

  // Get conceptual invoices for the selected supplier
  const conceptualInvoicesForSupplier = useMemo(() => {
    if (!selectedSupplier) return [];
    return supplierInvoicesMap.get(selectedSupplier.id) || [];
  }, [selectedSupplier, supplierInvoicesMap]);

  const handleApplyDate = () => {
    setAsOfDate(pendingAsOfDate);
    loadData(pendingAsOfDate);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePaymentModalClosed = async () => {
    setShowPaymentModal(false);
    await loadData(asOfDate);
    setSelectedSupplier(null);
    if (onCashFlowUpdate) onCashFlowUpdate();
  };

  const handleContextMenu = (supplier) => {
    setSelectedSupplier(supplier);
  };

  const handleMakePayment = () => {
    if (selectedSupplier) {
      setShowPaymentModal(true);
    }
  };

  const handleViewTransactions = () => {
    if (selectedSupplier) {
      const url = createPageUrl('SupplierTx') + `?id=${selectedSupplier.id}&from=apsummary`;
      navigate(url);
    }
  };

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className={isFullPage ? "p-6 min-h-screen space-y-4" : "space-y-4"}>
       <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
          .no-print { display: none !important; }
          .print-title { display: block !important; font-size: 16px; font-weight: bold; margin-bottom: 1rem; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
          th { background-color: #f2f2f2; }

          /* Force light/black output regardless of app dark mode */
          body { background-color: white !important; }
          [class*="bg-slate-"], [class*="bg-white"] {
            background-color: white !important;
          }
          .text-slate-900, .text-slate-800, .text-slate-700, .text-slate-600, .text-slate-500, .text-slate-400,
          .text-blue-600, .text-blue-700, .text-blue-400 {
            color: #000 !important;
          }
        }
        @media screen {
          .print-title { display: none; }
        }
      `}</style>
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        {isFullPage ? (
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">AP Summary</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">Aged accounts payable for all suppliers.</p>
            </div>
        ) : (
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Accounts Payable Summary</h2>
                <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => window.open(createPageUrl('APSummary'), '_blank')}
                    className="gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 h-8"
                >
                    <ExternalLink className="w-4 h-4" />
                    Open in new tab
                </Button>
            </div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap">As of Date:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start text-left font-normal h-9">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(pendingAsOfDate, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={pendingAsOfDate}
                  onSelect={setPendingAsOfDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={handleApplyDate}
              disabled={loading}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Apply
            </Button>
          </div>
          <Button onClick={handlePrint} variant="outline" size="sm">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>
      
      <div className="print-area">
         <div className="print-title">Accounts Payable Summary - As of {format(asOfDate, 'MMMM d, yyyy')}</div>
        <Card className="border rounded-lg shadow-sm dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                  <tr>
                    <th 
                      className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">
                        Supplier
                        {sortConfig.key === 'name' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                    >
                      Cash Flow
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      onClick={() => handleSort('not_due')}
                    >
                      <div className="flex items-center justify-end">
                        Not Due
                        {sortConfig.key === 'not_due' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                      onClick={() => handleSort('balance_0_30')}
                    >
                      <div className="flex items-center justify-end">
                        0-30 Days
                        {sortConfig.key === 'balance_0_30' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                      onClick={() => handleSort('balance_31_60')}
                    >
                      <div className="flex items-center justify-end">
                        31-60 Days
                        {sortConfig.key === 'balance_31_60' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                      onClick={() => handleSort('balance_60_plus')}
                    >
                      <div className="flex items-center justify-end">
                        60+ Days
                        {sortConfig.key === 'balance_60_plus' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                      onClick={() => handleSort('total_balance')}
                    >
                      <div className="flex items-center justify-end">
                        Total Balance
                        {sortConfig.key === 'total_balance' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" className="p-6 text-center">Loading...</td></tr>
                  ) : summaryData.length > 0 ? (
                    summaryData.map(supplier => {
                      const RowContent = (
                        <tr className="border-b last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
                          <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{supplier.name}</td>
                          <td className="p-0 text-center align-top">
                            <div className="flex flex-col w-full h-full">
                                {supplier.cashFlowEntries && supplier.cashFlowEntries.map((entry, idx) => {
                                    const amount = parseFloat(entry.amount?.toString().replace(/[^0-9.-]+/g,"")) || 0;
                                    
                                    let bgColor = '#ffffff';
                                    let textColor = '#000000';

                                    const days = entry.due_date ? differenceInDays(parseISO(entry.due_date), new Date()) : null;

                                    if (entry.row_status === 'follow_up') {
                                      bgColor = '#fdba74'; // Orange-300
                                    } else if (entry.chq_number) {
                                      bgColor = '#86efac'; // Green-300
                                    } else if (entry.row_status === 'paid') {
                                      bgColor = '#d8b4fe'; // Purple-300
                                    } else if (entry.bg_colour) {
                                      bgColor = entry.bg_colour;
                                    } else if (days !== null) {
                                      if (days <= 0) bgColor = '#fca5a5'; // Red-300 (Overdue)
                                      else if (days <= 10) bgColor = '#fde047'; // Yellow-300 (1-10 days)
                                      else if (days <= 30) {
                                        bgColor = '#0000ff'; // Blue (11-30 days)
                                        textColor = '#ffffff';
                                      }
                                    }

                                    return (
                                        <div 
                                            key={idx}
                                            className="py-2 px-3 w-full border-b last:border-b-0 flex items-center justify-center text-sm font-medium"
                                            style={{ backgroundColor: bgColor, color: textColor }}
                                            title={`Due: ${entry.due_date ? moment(entry.due_date).format('MMM D, YYYY') : 'No Date'}`}
                                        >
                                            ${amount.toFixed(2)}
                                        </div>
                                    );
                                })}
                            </div>
                          </td>
                          <td className="p-3 text-right">${supplier.not_due.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold">${supplier.balance_0_30.toFixed(2)}</td>
                          <td className="p-3 text-right">${supplier.balance_31_60.toFixed(2)}</td>
                          <td className="p-3 text-right">${supplier.balance_60_plus.toFixed(2)}</td>
                          <td className="p-3 text-right font-semibold text-blue-700 dark:text-blue-400">${supplier.total_balance}</td>
                        </tr>
                      );

                      if (supplier.is_loc) {
                        return <React.Fragment key={supplier.id}>{RowContent}</React.Fragment>;
                      }

                      return (
                        <ContextMenu key={supplier.id} onOpenChange={() => handleContextMenu(supplier)}>
                          <ContextMenuTrigger asChild>
                            {RowContent}
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem 
                              onClick={handleViewTransactions}
                              className="bg-white dark:bg-slate-800 text-black dark:text-slate-100 focus:bg-slate-100 dark:focus:bg-slate-700 focus:text-black dark:focus:text-slate-100 cursor-pointer"
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              View Transactions
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={handleMakePayment}
                              className="bg-green-600 text-white focus:bg-green-700 focus:text-white cursor-pointer"
                            >
                              <DollarSign className="w-4 h-4 mr-2" />
                              Make Payment
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })
                  ) : (
                    <tr><td colSpan="6" className="p-12 text-center text-slate-500 dark:text-slate-400">No outstanding payables found.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t dark:border-slate-700">
                   <tr>
                     <td className="p-3 text-right">Total</td>
                     <td className="p-3"></td>
                     <td className="p-3 text-right">${totals.not_due.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_0_30.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_31_60.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_60_plus.toFixed(2)}</td>
                     <td className="p-3 text-right text-blue-700 dark:text-blue-400">${totals.total_balance}</td>
                   </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SupplierPaymentModal
        open={showPaymentModal}
        onClose={handlePaymentModalClosed}
        supplier={selectedSupplier}
        invoiceLines={conceptualInvoicesForSupplier}
        onPaymentComplete={handlePaymentModalClosed}
      />
    </div>
  );
}