import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Printer, Calendar as CalendarIcon, DollarSign, FileText, ArrowUpDown, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { format, subMonths, endOfMonth, differenceInDays, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SupplierPaymentModal from './SupplierPaymentModal';
import AddToSheetModal from '@/components/suppliers/AddToSheetModal';

export default function APSummaryTable({ isFullPage = false }) {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierInvoicesMap, setSupplierInvoicesMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(() => {
    // Default to last day of previous month
    const today = new Date();
    const previousMonth = subMonths(today, 1);
    return endOfMonth(previousMonth);
  });
  const [pendingAsOfDate, setPendingAsOfDate] = useState(() => {
    // Default to last day of previous month for the selector
    const today = new Date();
    const previousMonth = subMonths(today, 1);
    return endOfMonth(previousMonth);
  });
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddToSheetModal, setShowAddToSheetModal] = useState(false);
  const [addToSheetData, setAddToSheetData] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [cashFlowEntries, setCashFlowEntries] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Call new optimized backend function
        const response = await base44.functions.invoke('getAPSummary', {});

        if (response.data.success) {
          const suppliersWithInvoices = response.data.data;
          
          // Extract suppliers list
          const suppliersData = suppliersWithInvoices.map(item => item.supplier);
          setSuppliers(suppliersData);

          // Build map of supplier ID to their conceptual invoices
          const invoicesMap = new Map();
          suppliersWithInvoices.forEach(item => {
            invoicesMap.set(item.supplier.id, item.conceptualInvoices);
          });
          setSupplierInvoicesMap(invoicesMap);
        }

        // Fetch Cash Flow Entries
        const cfEntries = await base44.entities.CashFlowEntry.list();
        setCashFlowEntries(cfEntries || []);

      } catch (error) {
        console.error('Error loading AP data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const summaryData = useMemo(() => {
    if (loading || !suppliers.length || supplierInvoicesMap.size === 0) return [];
    
    // Aggregate by supplier using conceptual invoices from backend
    const supplierSummary = suppliers.map(supplier => {
      const conceptualInvoices = supplierInvoicesMap.get(supplier.id) || [];
      
      // Calculate Cash Flow Entries for this Supplier
      const supplierCashFlowEntries = cashFlowEntries.filter(entry => entry.supplier_id === supplier.id);

      // FIRST: Calculate total balance from ALL invoices (ignoring dates)
      let total_balance = 0;
      conceptualInvoices.forEach(invoice => {
        if (Math.abs(invoice.balance_due) > 0.01) {
          total_balance += invoice.balance_due;
        }
      });
      total_balance = Math.round(total_balance * 100) / 100;

      // SECOND: Calculate aging buckets for display breakdown
      let not_due = 0;
      let balance_0_30 = 0;
      let balance_31_60 = 0;
      let balance_60_plus = 0;

      conceptualInvoices.forEach(invoice => {
        const owing = invoice.balance_due;
        
        // Skip if balance is essentially zero
        if (Math.abs(owing) <= 0.01) return;
        
        // Calculate days old based on asOfDate
        const invoiceDate = parseISO(invoice.invoice_date);
        const daysOld = differenceInDays(asOfDate, invoiceDate);

        // Age the balance (credits reduce aged balances)
        if (daysOld < 0) {
          not_due += owing;
        } else if (daysOld <= 30) {
          balance_0_30 += owing;
        } else if (daysOld <= 60) {
          balance_31_60 += owing;
        } else {
          balance_60_plus += owing;
        }
      });

      return {
        ...supplier,
        not_due,
        balance_0_30,
        balance_31_60,
        balance_60_plus,
        total_balance,
        cashFlowEntries: supplierCashFlowEntries,
      };
    });

    // Filter out suppliers with no balance
    const filtered = supplierSummary.filter(s => Math.abs(s.total_balance) > 0.01 || s.cashFlowEntries.length > 0);

    // Sort
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle string comparison for names
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
  }, [suppliers, supplierInvoicesMap, loading, asOfDate, sortConfig]);

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
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePaymentMade = async () => {
    // Reload data after payment is made
    setLoading(true);
    setShowPaymentModal(false);
    
    try {
      // Call new optimized backend function
      const response = await base44.functions.invoke('getAPSummary', {});

      if (response.data.success) {
        const suppliersWithInvoices = response.data.data;
        
        // Extract suppliers list
        const suppliersData = suppliersWithInvoices.map(item => item.supplier);
        setSuppliers(suppliersData);

        // Build map of supplier ID to their conceptual invoices
        const invoicesMap = new Map();
        suppliersWithInvoices.forEach(item => {
          invoicesMap.set(item.supplier.id, item.conceptualInvoices);
        });
        setSupplierInvoicesMap(invoicesMap);
      }

    } catch (error) {
      console.error('Error loading AP data:', error);
    } finally {
      setLoading(false);
      setSelectedSupplier(null);
    }
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

  const handleAddToSheet = () => {
    if (selectedSupplier) {
      const amount = Math.max(0, selectedSupplier.total_balance - selectedSupplier.not_due).toFixed(2);
      const dueDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      
      setAddToSheetData({
        supplierName: selectedSupplier.name,
        amount: amount,
        dueDate: dueDate
      });
      setShowAddToSheetModal(true);
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
        }
        @media screen {
          .print-title { display: none; }
        }
      `}</style>
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        {isFullPage ? (
            <div>
              <h1 className="text-3xl font-bold text-slate-900">AP Summary</h1>
              <p className="text-slate-600 mt-1">Aged accounts payable for all suppliers.</p>
            </div>
        ) : (
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-slate-800">Accounts Payable Summary</h2>
                <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => window.open(createPageUrl('APSummary'), '_blank')}
                    className="gap-2 text-slate-500 hover:text-blue-600 h-8"
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
        <Card className="border rounded-lg shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th 
                      className="text-left p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">
                        Supplier
                        {sortConfig.key === 'name' && <ArrowUpDown className="ml-2 h-4 w-4" />}
                      </div>
                    </th>
                    <th 
                      className="text-center p-3 font-semibold text-slate-700 whitespace-nowrap"
                    >
                      Cash Flow
                    </th>
                    <th 
                      className="text-right p-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
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
                    summaryData.map(supplier => (
                      <ContextMenu key={supplier.id} onOpenChange={() => handleContextMenu(supplier)}>
                        <ContextMenuTrigger asChild>
                          <tr className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors">
                            <td className="p-3 font-medium text-slate-900">{supplier.name}</td>
                            <td className="p-3 text-center">
                              <div className="flex flex-wrap gap-1 justify-center">
                                  {supplier.cashFlowEntries && supplier.cashFlowEntries.map((entry, idx) => {
                                      let badgeColor = "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"; // Default

                                      // Logic matches CashFlowTable precedence: Cheque > Paid > Follow Up
                                      if (entry.chq_number || entry.method === 'Cheque') {
                                          badgeColor = "bg-green-100 text-green-800 hover:bg-green-200";
                                      } else if (entry.row_status === 'paid' || (entry.amount_paid >= entry.amount && entry.amount > 0)) {
                                          badgeColor = "bg-purple-100 text-purple-800 hover:bg-purple-200";
                                      } else if (entry.row_status === 'follow_up') {
                                          badgeColor = "bg-red-100 text-red-800 hover:bg-red-200";
                                      }

                                      const amount = parseFloat(entry.amount?.toString().replace(/[^0-9.-]+/g,"")) || 0;

                                      return (
                                          <TooltipProvider key={idx}>
                                              <Tooltip>
                                                  <TooltipTrigger asChild>
                                                      <Badge className={`cursor-help whitespace-nowrap ${badgeColor}`}>
                                                          ${amount.toFixed(2)}
                                                      </Badge>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                      <p>Due: {entry.due_date ? format(parseISO(entry.due_date), 'MMM d, yyyy') : 'No Date'}</p>
                                                  </TooltipContent>
                                              </Tooltip>
                                          </TooltipProvider>
                                      );
                                  })}
                              </div>
                            </td>
                            <td className="p-3 text-right">${supplier.not_due.toFixed(2)}</td>
                            <td className="p-3 text-right">${supplier.balance_0_30.toFixed(2)}</td>
                            <td className="p-3 text-right">${supplier.balance_31_60.toFixed(2)}</td>
                            <td className="p-3 text-right">${supplier.balance_60_plus.toFixed(2)}</td>
                            <td className="p-3 text-right font-semibold text-blue-700">${supplier.total_balance}</td>
                          </tr>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={handleViewTransactions}>
                            <FileText className="w-4 h-4 mr-2" />
                            View Transactions
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handleMakePayment}>
                            <DollarSign className="w-4 h-4 mr-2" />
                            Make Payment
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handleAddToSheet}>
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Add to Sheet
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))
                  ) : (
                    <tr><td colSpan="6" className="p-12 text-center text-slate-500">No outstanding payables found.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t">
                   <tr>
                     <td className="p-3 text-right">Total</td>
                     <td className="p-3"></td>
                     <td className="p-3 text-right">${totals.not_due.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_0_30.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_31_60.toFixed(2)}</td>
                     <td className="p-3 text-right">${totals.balance_60_plus.toFixed(2)}</td>
                     <td className="p-3 text-right text-blue-700">${totals.total_balance}</td>
                   </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SupplierPaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedSupplier(null);
        }}
        supplier={selectedSupplier}
        invoiceLines={conceptualInvoicesForSupplier}
        onPaymentComplete={handlePaymentMade}
      />

      <AddToSheetModal
        open={showAddToSheetModal}
        onClose={() => {
          setShowAddToSheetModal(false);
          setAddToSheetData(null);
        }}
        initialValues={addToSheetData}
      />
    </div>
  );
}