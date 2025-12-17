import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Supplier, SupplierPayment } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Calendar as CalendarIcon, Search, ChevronDown, ChevronRight, Loader2, FileText } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { createPageUrl } from '@/utils';
import { Badge } from "@/components/ui/badge";

const GST_RATE = 0.05; // 5% GST

// Helper function to safely parse and format dates
const safeFormatDate = (dateString, formatString = 'MM/dd/yyyy') => {
    if (!dateString || dateString === '') return 'N/A';
    try {
        const parsed = parseISO(dateString);
        if (isNaN(parsed.getTime())) return 'N/A';
        return format(parsed, formatString);
    } catch (error) {
        console.error('Date parsing error:', error, dateString);
        return 'N/A';
    }
};

export default function SupplierTxViewPage() {
    const [supplier, setSupplier] = useState(null);
    const [conceptualInvoices, setConceptualInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [daysBack, setDaysBack] = useState(30);
    const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });
    const [currentBalance, setCurrentBalance] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentActiveTab, setCurrentActiveTab] = useState('invoice-summary');

    // Pending date range selections (before Apply is clicked)
    const [pendingDaysBack, setPendingDaysBack] = useState(30);
    const [pendingDateRange, setPendingDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

    const location = useLocation();
    const navigate = useNavigate();
    const supplierId = new URLSearchParams(location.search).get('id');

    // State for expanded payment rows
    const [expandedPayments, setExpandedPayments] = useState(new Set());

    const togglePaymentExpansion = (paymentId) => {
        setExpandedPayments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(paymentId)) {
                newSet.delete(paymentId);
            } else {
                newSet.add(paymentId);
            }
            return newSet;
        });
    };

    const [expandedInvoices, setExpandedInvoices] = useState({});

    const toggleInvoiceExpansion = (invoiceKey) => {
        setExpandedInvoices(prev => ({
            ...prev,
            [invoiceKey]: !prev[invoiceKey]
        }));
    };

    const retryWithBackoff = useCallback(async (apiCall, maxRetries = 5) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await apiCall();
            } catch (error) {
                if (error.response?.status === 429 && attempt < maxRetries - 1) {
                    console.log(`Rate limited, waiting ${Math.pow(2, attempt + 1) * 1000}ms before retry (attempt ${attempt + 1}/${maxRetries})......`);
                    const delay = Math.pow(2, attempt + 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }, []);

    const loadData = useCallback(async () => {
        if (!supplierId) {
            return;
        }

        setLoading(true);
        try {
            const response = await base44.functions.invoke('getSupplierTransactions', {
                supplierId,
                dateRange: {
                    from: dateRange.from.toISOString(),
                    to: dateRange.to.toISOString()
                }
            });

            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to fetch supplier transactions');
            }

            const {
                supplier: supplierData,
                payments: paymentsData,
                conceptualInvoices: invoicesInRange,
                allConceptualInvoices: allInvoicesData,
                currentBalance: totalBalance
            } = response.data.data;

            setSupplier(supplierData);
            setPayments(paymentsData.sort((a,b) => new Date(b.payment_date) - new Date(a.payment_date)));
            
            // Use backend's currentBalance directly (single source of truth)
            setCurrentBalance(totalBalance);

            // Use backend's invoicesInRange directly (already rounded by backend)
            setConceptualInvoices(invoicesInRange);

        } catch (error) {
            console.error('Error loading supplier data:', error);
            if (error.response?.status === 429) {
                alert('The system is currently experiencing high load. Please wait a moment and try refreshing the page.');
            } else {
                alert('Failed to load data. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [supplierId, dateRange]);

    useEffect(() => {
        if (!supplierId) {
            navigate(createPageUrl('Suppliers'));
            return;
        }

        loadData();
    }, [supplierId, dateRange, loadData, navigate]);

    const handlePendingDaysBackChange = (days) => {
        const numDays = parseInt(days, 10);
        if (!isNaN(numDays) && numDays > 0) {
            setPendingDaysBack(numDays);
            setPendingDateRange({ from: subDays(new Date(), numDays), to: new Date() });
        }
    };

    const handlePendingDateRangeChange = (range) => {
        if (range?.from && range?.to) {
            setPendingDateRange(range);
            setPendingDaysBack('');
        }
    };

    const handleApplyDateRange = () => {
        setDateRange(pendingDateRange);
        setDaysBack(pendingDaysBack);
    };

    const handleBackNavigation = useCallback(() => {
        navigate(createPageUrl('Suppliers'));
    }, [navigate]);

    const handlePrintCheque = useCallback((chequeReference) => {
        const targetUrl = `${createPageUrl('ChequeWriter')}?chequeReference=${encodeURIComponent(chequeReference)}`;
        window.location.href = targetUrl;
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-lg font-semibold">Loading supplier data.....</div>
                    <div className="text-gray-500 mt-2">This may take a moment</div>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 min-h-screen">
            <div className="max-w-screen-xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={handleBackNavigation}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        <h1 className="text-2xl font-bold text-slate-900">{supplier?.name} - Transactions (View Only)</h1>
                    </div>
                </div>

                <div className="mb-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="daysBackInput">Days Back:</Label>
                            <Input
                                id="daysBackInput"
                                type="number"
                                value={pendingDaysBack}
                                onChange={(e) => handlePendingDaysBackChange(e.target.value)}
                                className="w-20"
                            />
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-64 justify-start text-left font-normal"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {pendingDateRange.from && pendingDateRange.to ?
                                        `${safeFormatDate(pendingDateRange.from.toISOString())} - ${safeFormatDate(pendingDateRange.to.toISOString())}` :
                                        "Select a date range"
                                    }
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    mode="range"
                                    selected={pendingDateRange}
                                    onSelect={handlePendingDateRangeChange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                        <Button
                            onClick={handleApplyDateRange}
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            Apply
                        </Button>
                        <div className="flex items-center gap-2">
                            <Search className="w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search invoice #, description, or amount..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-64"
                            />
                        </div>
                    </div>
                    <Card className="bg-white shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex gap-6">
                                <div className="text-right">
                                    <p className="text-sm text-slate-500">Total Balance Owing</p>
                                    <p className="text-lg font-bold text-red-600">${currentBalance.toFixed(2)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Tabs value={currentActiveTab} onValueChange={setCurrentActiveTab} className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="invoice-summary">Invoice Summary</TabsTrigger>
                        <TabsTrigger value="payment-history">Payment History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="invoice-summary">
                       <Card>
                           <CardContent className="p-0">
                               <div className="divide-y divide-slate-200">
                                   {conceptualInvoices.length > 0 ? (
                                       conceptualInvoices.map((invoice) => {
                                           const invoiceKey = `${invoice.supplier_id}_${invoice.invoice_number}_${invoice.invoice_date}`;
                                           const isExpanded = expandedInvoices[invoiceKey];

                                           return (
                                               <div key={invoiceKey} className="bg-white">
                                                   {/* Invoice Header Row */}
                                                   <div
                                                       className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer"
                                                       onClick={() => toggleInvoiceExpansion(invoiceKey)}
                                                   >
                                                       <div className="flex items-center gap-4 flex-1">
                                                           <div className="text-slate-400">
                                                               {isExpanded ? (
                                                                   <ChevronDown className="w-5 h-5" />
                                                               ) : (
                                                                   <ChevronRight className="w-5 h-5" />
                                                               )}
                                                           </div>
                                                           <div className="flex-1 grid grid-cols-7 gap-4">
                                                               <div>
                                                                   <p className="text-sm text-slate-500">Invoice #</p>
                                                                   <p className="font-medium text-slate-900">{invoice.invoice_number}</p>
                                                               </div>
                                                               <div>
                                                                   <p className="text-sm text-slate-500">Date</p>
                                                                   <p className="font-medium text-slate-900">
                                                                       {safeFormatDate(invoice.invoice_date)}
                                                                   </p>
                                                               </div>
                                                               <div>
                                                                   <p className="text-sm text-slate-500">Lines</p>
                                                                   <p className="font-medium text-slate-900">{invoice.line_count}</p>
                                                               </div>
                                                               <div className="text-right">
                                                                   <p className="text-sm text-slate-500">Total Charge</p>
                                                                   <p className="font-medium text-slate-900">${invoice.subtotal.toFixed(2)}</p>
                                                               </div>
                                                               <div className="text-right">
                                                                   <p className="text-sm text-slate-500">Total GST</p>
                                                                   <p className="font-medium text-slate-900">${invoice.tax_amount.toFixed(2)}</p>
                                                               </div>
                                                               <div className="text-right">
                                                                   <p className="text-sm text-slate-500">Total Amount</p>
                                                                   <p className="font-medium text-slate-900">${invoice.total_amount.toFixed(2)}</p>
                                                               </div>
                                                               <div className="text-right">
                                                                   <p className="text-sm text-slate-500">Balance</p>
                                                                   <p className="font-bold text-red-600">${invoice.balance_due.toFixed(2)}</p>
                                                               </div>
                                                           </div>
                                                       </div>
                                                   </div>

                                                   {/* Expanded Invoice Lines */}
                                                   {isExpanded && invoice.lines && invoice.lines.length > 0 && (
                                                       <div className="border-t border-slate-200 bg-slate-50">
                                                           <div className="overflow-x-auto">
                                                               <Table>
                                                                   <TableHeader>
                                                                       <TableRow className="bg-slate-100">
                                                                           <TableHead>Description</TableHead>
                                                                           <TableHead className="w-[150px] text-right">Charge</TableHead>
                                                                           <TableHead className="w-[150px] text-right">GST</TableHead>
                                                                           <TableHead className="w-[150px] text-right">Line Total</TableHead>
                                                                       </TableRow>
                                                                   </TableHeader>
                                                                   <TableBody>
                                                                        {invoice.lines.map((line, index) => (
                                                                            <TableRow key={line.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                                               <TableCell>{line.description || '-'}</TableCell>
                                                                               <TableCell className="text-right">
                                                                                   ${parseFloat(line.purchase_amount || 0).toFixed(2)}
                                                                               </TableCell>
                                                                               <TableCell className="text-right">
                                                                                   ${parseFloat(line.gst_amount || 0).toFixed(2)}
                                                                               </TableCell>
                                                                               <TableCell className="text-right font-semibold">
                                                                                   ${((parseFloat(line.purchase_amount || 0) + parseFloat(line.gst_amount || 0)).toFixed(2))}
                                                                               </TableCell>
                                                                           </TableRow>
                                                                       ))}
                                                                   </TableBody>
                                                               </Table>
                                                           </div>
                                                       </div>
                                                   )}

                                                   {/* Empty state when no lines */}
                                                   {isExpanded && (!invoice.lines || invoice.lines.length === 0) && (
                                                       <div className="p-4 border-t border-slate-200 bg-slate-50">
                                                           <p className="text-sm text-slate-500 text-center">
                                                               No invoice lines found.
                                                           </p>
                                                       </div>
                                                   )}
                                               </div>
                                           );
                                       })
                                   ) : (
                                       <div className="p-12 text-center">
                                           <p className="text-slate-500">No invoices found in the selected date range</p>
                                       </div>
                                   )}
                               </div>
                           </CardContent>
                       </Card>
                    </TabsContent>

                    <TabsContent value="payment-history">
                        <Card>
                          <CardHeader>
                            <CardTitle>Payment History</CardTitle>
                          </CardHeader>
                          <CardContent>
                            {loading ? (
                              <div className="flex items-center justify-center h-32">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                              </div>
                            ) : payments.length === 0 ? (
                              <div className="text-center py-12">
                                <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Payments</h3>
                                <p className="text-slate-600">No payment history found for this supplier.</p>
                              </div>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-50">
                                      <TableHead className="font-semibold w-8"></TableHead>
                                      <TableHead className="font-semibold">Date</TableHead>
                                      <TableHead className="font-semibold">Method</TableHead>
                                      <TableHead className="font-semibold">Reference</TableHead>
                                      <TableHead className="font-semibold text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {payments.map((payment) => {
                                      const isExpanded = expandedPayments.has(payment.id);
                                      let appliedInvoices = [];

                                      if (payment.invoice_number) {
                                          try {
                                              const parsed = JSON.parse(payment.invoice_number);
                                              if (Array.isArray(parsed)) {
                                                  appliedInvoices = parsed;
                                              } else if (typeof parsed === 'string' && parsed !== 'On Account') {
                                                  appliedInvoices = [{
                                                      invoice_number: parsed,
                                                      amount_applied: payment.amount
                                                  }];
                                              }
                                          } catch (error) {
                                              if (typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
                                                  appliedInvoices = [{
                                                      invoice_number: payment.invoice_number,
                                                      amount_applied: payment.amount
                                                  }];
                                              }
                                          }
                                      }

                                      return (
                                        <React.Fragment key={payment.id}>
                                          <TableRow
                                            className={`hover:bg-slate-100 cursor-pointer ${payments.indexOf(payment) % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                                            onClick={() => togglePaymentExpansion(payment.id)}
                                          >
                                            <TableCell className="w-8">
                                                {appliedInvoices.length > 0 && (isExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-slate-500" />
                                                ))}
                                            </TableCell>
                                            <TableCell>
                                              {safeFormatDate(payment.payment_date)}
                                            </TableCell>
                                            <TableCell>
                                              {payment.payment_method === 'Cheque' && payment.cheque_number ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintCheque(payment.cheque_number);
                                                  }}
                                                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline bg-transparent border-none p-0 cursor-pointer"
                                                >
                                                  {payment.payment_method}
                                                </button>
                                              ) : (
                                                <span className="capitalize">
                                                  {payment.payment_method?.replace(/_/g, ' ') || 'N/A'}
                                                </span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-slate-600">
                                              {payment.cheque_number || payment.bank_transaction_id || '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-slate-900">
                                              ${payment.amount.toFixed(2)}
                                            </TableCell>
                                          </TableRow>

                                          {isExpanded && appliedInvoices.length > 0 && (
                                            <TableRow>
                                              <TableCell colSpan={5} className="bg-slate-50 p-0">
                                                <div className="p-4 pl-12">
                                                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Invoices Paid:</h4>
                                                  <div className="bg-white rounded border">
                                                    <Table>
                                                      <TableHeader>
                                                        <TableRow className="bg-slate-100">
                                                          <TableHead className="text-xs">Invoice Number</TableHead>
                                                          <TableHead className="text-xs text-right">Amount Applied</TableHead>
                                                        </TableRow>
                                                      </TableHeader>
                                                      <TableBody>
                                                        {appliedInvoices.map((inv, idx) => (
                                                          <TableRow key={idx} className="text-sm">
                                                            <TableCell>{inv.invoice_number}</TableCell>
                                                            <TableCell className="text-right font-medium">
                                                              ${(typeof inv.amount_applied === 'number' ? inv.amount_applied : parseFloat(inv.amount_applied || 0)).toFixed(2)}
                                                            </TableCell>
                                                          </TableRow>
                                                        ))}
                                                      </TableBody>
                                                    </Table>
                                                  </div>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          )}

                                          {isExpanded && appliedInvoices.length === 0 && payment.invoice_number === 'On Account' && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="bg-slate-50 p-0">
                                                    <div className="p-4 pl-12 text-sm text-slate-600">
                                                        This payment was applied "On Account" and not allocated to specific invoices.
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}