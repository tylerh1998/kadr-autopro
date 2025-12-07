import React, { useState, useEffect, useMemo } from 'react';
import { Supplier, SupplierInvoiceLine, SupplierPayment, BankAccount, LinesOfCredit } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Calendar as CalendarIcon, DollarSign, FileText } from 'lucide-react';
import { format, subMonths, endOfMonth, differenceInDays, parseISO, isValid } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils'; // Corrected import
import SupplierPaymentModal from '../components/suppliers/SupplierPaymentModal';

export default function APSummaryPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [lines, setLines] = useState([]);
  const [payments, setPayments] = useState([]);
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

  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [suppliersData, linesData, paymentsData] = await Promise.all([
          Supplier.list(),
          SupplierInvoiceLine.list(),
          SupplierPayment.list(),
        ]);
        setSuppliers(suppliersData);
        setLines(linesData);
        setPayments(paymentsData);
      } catch (error) {
        console.error('Error loading AP data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const summaryData = useMemo(() => {
    if (loading || !suppliers.length) return [];
    
    // 1. Group lines by (supplier_id, invoice_number, invoice_date) to create conceptual invoices
    const invoiceMap = {};
    
    lines.forEach(line => {
      const key = `${line.supplier_id}_${line.invoice_number}_${line.invoice_date}`;
      
      if (!invoiceMap[key]) {
        invoiceMap[key] = {
          supplier_id: line.supplier_id,
          invoice_number: line.invoice_number,
          invoice_date: line.invoice_date,
          lines: [],
          total_amount: 0,
          amount_paid: 0,
          owing: 0
        };
      }
      
      // Add line to invoice
      invoiceMap[key].lines.push(line);
      
      // Calculate total (purchase_amount + gst_amount)
      invoiceMap[key].total_amount += (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0);
    });

    // Convert to array
    const conceptualInvoices = Object.values(invoiceMap);

    // 2. Match payments to conceptual invoices
    payments.forEach(payment => {
      const matchingInvoice = conceptualInvoices.find(inv => 
        inv.supplier_id === payment.supplier_id && 
        inv.invoice_number === payment.invoice_number
      );
      
      if (matchingInvoice) {
        matchingInvoice.amount_paid += parseFloat(payment.amount) || 0;
      }
    });

    // 3. Calculate owing and daysOld for each conceptual invoice
    const invoiceOwings = conceptualInvoices.map(invoice => {
      const owing = invoice.total_amount - invoice.amount_paid;
      const invoiceDate = new Date(invoice.invoice_date);
      const daysOld = differenceInDays(asOfDate, invoiceDate);

      return {
        supplier_id: invoice.supplier_id,
        owing,
        daysOld,
      };
    });

    // 4. Aggregate by supplier
    const supplierSummary = suppliers.map(supplier => {
      const supplierInvoices = invoiceOwings.filter(inv => inv.supplier_id === supplier.id && inv.owing > 0.01);
      
      let balance_0_30 = 0;
      let balance_31_60 = 0;
      let balance_60_plus = 0;

      supplierInvoices.forEach(inv => {
        if (inv.daysOld <= 30) {
          balance_0_30 += inv.owing;
        } else if (inv.daysOld <= 60) {
          balance_31_60 += inv.owing;
        } else {
          balance_60_plus += inv.owing;
        }
      });

      const total_balance = balance_0_30 + balance_31_60 + balance_60_plus;

      return {
        ...supplier,
        balance_0_30,
        balance_31_60,
        balance_60_plus,
        total_balance,
      };
    });

    // 5. Filter out suppliers with no balance
    return supplierSummary.filter(s => s.total_balance > 0.01);
  }, [suppliers, lines, payments, loading, asOfDate]);

  const totals = useMemo(() => {
    return summaryData.reduce((acc, curr) => {
      acc.balance_0_30 += curr.balance_0_30;
      acc.balance_31_60 += curr.balance_31_60;
      acc.balance_60_plus += curr.balance_60_plus;
      acc.total_balance += curr.total_balance;
      return acc;
    }, { balance_0_30: 0, balance_31_60: 0, balance_60_plus: 0, total_balance: 0 });
  }, [summaryData]);

  const handleApplyDate = () => {
    setAsOfDate(pendingAsOfDate);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePaymentMade = () => {
    // Reload data after payment is made
    const loadData = async () => {
      setLoading(true);
      try {
        const [suppliersData, linesData, paymentsData] = await Promise.all([
          Supplier.list(),
          SupplierInvoiceLine.list(),
          SupplierPayment.list(),
        ]);
        setSuppliers(suppliersData);
        setLines(linesData);
        setPayments(paymentsData);
      } catch (error) {
        console.error('Error loading AP data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    setShowPaymentModal(false);
    setSelectedSupplier(null);
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
      const url = createPageUrl('SupplierTx') + `?id=${selectedSupplier.id}`;
      navigate(url);
    }
  };

  return (
    <>
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
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">AP Summary</h1>
              <p className="text-slate-600 mt-1">Aged accounts payable for all suppliers.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>As of Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Apply
                </Button>
              </div>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print Summary
              </Button>
            </div>
          </div>
          
          <div className="print-area">
             <div className="print-title">Accounts Payable Summary - As of {format(asOfDate, 'MMMM d, yyyy')}</div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Supplier</th>
                        <th className="text-right p-3 font-semibold text-slate-700">0-30 Days</th>
                        <th className="text-right p-3 font-semibold text-slate-700">31-60 Days</th>
                        <th className="text-right p-3 font-semibold text-slate-700">60+ Days</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Total Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan="5" className="p-6 text-center">Loading...</td></tr>
                      ) : summaryData.length > 0 ? (
                        summaryData.map(supplier => (
                          <ContextMenu key={supplier.id} onOpenChange={() => handleContextMenu(supplier)}>
                            <ContextMenuTrigger asChild>
                              <tr className="border-b hover:bg-slate-50 cursor-pointer">
                                <td className="p-3 font-medium text-slate-900">{supplier.name}</td>
                                <td className="p-3 text-right">${supplier.balance_0_30.toFixed(2)}</td>
                                <td className="p-3 text-right">${supplier.balance_31_60.toFixed(2)}</td>
                                <td className="p-3 text-right">${supplier.balance_60_plus.toFixed(2)}</td>
                                <td className="p-3 text-right font-semibold">${supplier.total_balance.toFixed(2)}</td>
                              </tr>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={handleMakePayment}>
                                <DollarSign className="w-4 h-4 mr-2" />
                                Make Payment
                              </ContextMenuItem>
                              <ContextMenuItem onClick={handleViewTransactions}>
                                <FileText className="w-4 h-4 mr-2" />
                                View Transactions
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))
                      ) : (
                        <tr><td colSpan="5" className="p-12 text-center text-slate-500">No outstanding payables found.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold">
                       <tr>
                         <td className="p-3 text-right">Total</td>
                         <td className="p-3 text-right">${totals.balance_0_30.toFixed(2)}</td>
                         <td className="p-3 text-right">${totals.balance_31_60.toFixed(2)}</td>
                         <td className="p-3 text-right">${totals.balance_60_plus.toFixed(2)}</td>
                         <td className="p-3 text-right text-blue-700">${totals.total_balance.toFixed(2)}</td>
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
            onPaymentMade={handlePaymentMade}
          />
        </div>
      </div>
    </>
  );
}