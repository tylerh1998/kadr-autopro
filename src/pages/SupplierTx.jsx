import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Calendar as CalendarIcon, Save, DollarSign, AlertTriangle, Search, Edit, Printer, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { createPageUrl } from '@/utils';
import SupplierForm from '../components/suppliers/SupplierForm';
import SupplierTxModals from '../components/suppliers/SupplierTxModals';
import SupplierTxInvoiceLinesTab from '../components/suppliers/SupplierTxInvoiceLinesTab';
import SupplierTxInvoiceSummaryTab from '../components/suppliers/SupplierTxInvoiceSummaryTab';
import SupplierTxPaymentHistoryTab from '../components/suppliers/SupplierTxPaymentHistoryTab';
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';
import { toMountainTime } from '../components/utils/mountainTimeUtils';
import { useSupplierLock } from '../components/context/SupplierLockContext';

const GST_RATE = 0.05;

const safeFormatDate = (dateString, formatString = 'MM/dd/yyyy', useMountainTime = false) => {
  if (!dateString || dateString === '') return 'N/A';
  try {
    const parsed = useMountainTime && dateString.length > 10 ? toMountainTime(dateString) : parseISO(dateString);
    if (isNaN(parsed.getTime())) return 'N/A';
    return format(parsed, formatString);
  } catch (error) {
    console.error('Date parsing error:', error, dateString);
    return 'N/A';
  }
};

const safeParseDateForCalendar = (dateString) => {
  if (!dateString || dateString === '') return undefined;
  try {
    const parsed = parseISO(dateString);
    if (isNaN(parsed.getTime())) return undefined;
    return parsed;
  } catch (error) {
    console.error('Date parsing error for calendar:', error, dateString);
    return undefined;
  }
};

const formatDateForInput = (dateString) => {
  if (!dateString || dateString === '') return '';
  try {
    const parsed = parseISO(dateString);
    if (isNaN(parsed.getTime())) return '';
    return format(parsed, 'MM/dd/yyyy');
  } catch (error) {
    console.error('Date formatting error for input:', error, dateString);
    return '';
  }
};

const parseAndValidateDateInput = (inputDate) => {
  if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
  const trimmed = inputDate.trim();
  let month, day, year;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      [year, month, day] = trimmed.split('-');
    } else {
      const parts = trimmed.split('/');
      if (parts.length === 2) {
        month = parts[0];
        day = parts[1];
        year = new Date().getFullYear().toString();
      } else if (parts.length === 3) {
        month = parts[0];
        day = parts[1];
        year = parts[2];
        if (year.length === 2) {
          const currentYear = new Date().getFullYear();
          const currentCentury = Math.floor(currentYear / 100) * 100;
          const twoDigitYear = parseInt(year);
          year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
        }
      } else {
        return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
      }
    }
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = parseInt(year);
    if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) return { valid: false, date: null, error: 'Date must contain valid numbers' };
    if (monthNum < 1 || monthNum > 12) return { valid: false, date: null, error: 'Month must be between 1 and 12' };
    if (dayNum < 1 || dayNum > 31) return { valid: false, date: null, error: 'Day must be between 1 and 31' };
    if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) return { valid: false, date: null, error: 'Year must be a valid 4-digit year (1900-2100)' };
    const isoDate = `${year}-${month}-${day}`;
    const testDate = new Date(isoDate + 'T00:00:00');
    if (isNaN(testDate.getTime())) return { valid: false, date: null, error: 'Invalid date' };
    if (testDate.getFullYear() !== yearNum || testDate.getMonth() + 1 !== monthNum || testDate.getDate() !== dayNum) return { valid: false, date: null, error: 'Invalid date (e.g., Feb 30, April 31 do not exist)' };
    return { valid: true, date: trimmed.match(/^\d{4}-\d{2}-\d{2}$/) ? trimmed : isoDate, error: null };
  } catch (error) {
    console.error('Date parsing error:', error, inputDate);
    return { valid: false, date: null, error: 'Error parsing date' };
  }
};

const isLineLocked = (line) => {
  const paidAmount = parseFloat(line?.paid_amount);
  return !isNaN(paidAmount) && paidAmount !== 0;
};

const recalculateConceptualInvoices = (lines, existingConceptualInvoices, range) => {
  const grouped = new Map();

  lines.forEach((line) => {
    const hasContent = line.invoice_number || line.description || (parseFloat(line.charge) || 0) !== 0 || (parseFloat(line.gst) || 0) !== 0 || (parseFloat(line.line_total) || 0) !== 0;
    if (!hasContent) return;

    const lineDate = line.invoice_date ? new Date(`${line.invoice_date}T00:00:00`) : null;
    if (!lineDate || Number.isNaN(lineDate.getTime())) return;
    if (lineDate < range.from || lineDate > range.to) return;

    const supplierId = line.supplier_id || existingConceptualInvoices.find(inv => inv.invoice_number === line.invoice_number && inv.invoice_date === line.invoice_date)?.supplier_id || '';
    const key = `${supplierId}_${line.invoice_number || ''}_${line.invoice_date || ''}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        supplier_id: supplierId,
        invoice_number: line.invoice_number || '',
        invoice_date: line.invoice_date || '',
        line_count: 0,
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        amount_paid: 0,
        balance_due: 0,
      });
    }

    const invoice = grouped.get(key);
    invoice.line_count += 1;
    invoice.subtotal += parseFloat(line.charge) || 0;
    invoice.tax_amount += parseFloat(line.gst) || 0;
    invoice.total_amount += parseFloat(line.line_total) || 0;
  });

  return Array.from(grouped.values())
    .map((invoice) => {
      const existing = existingConceptualInvoices.find(
        (item) => item.invoice_number === invoice.invoice_number && item.invoice_date === invoice.invoice_date
      );
      const amountPaid = Math.round((parseFloat(existing?.amount_paid) || 0) * 100) / 100;
      const subtotal = Math.round(invoice.subtotal * 100) / 100;
      const taxAmount = Math.round(invoice.tax_amount * 100) / 100;
      const totalAmount = Math.round(invoice.total_amount * 100) / 100;
      return {
        ...invoice,
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance_due: Math.round((totalAmount - amountPaid) * 100) / 100,
      };
    })
    .sort((a, b) => {
      const dateA = new Date(a.invoice_date);
      const dateB = new Date(b.invoice_date);
      if (dateA - dateB !== 0) return dateA - dateB;
      return (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
    });
};

export default function SupplierTxPage() {
  const [supplier, setSupplier] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [allInvoiceLines, setAllInvoiceLines] = useState([]);
  const [conceptualInvoices, setConceptualInvoices] = useState([]);
  const [allConceptualInvoices, setAllConceptualInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [daysBack, setDaysBack] = useState(30);
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentActiveTab, setCurrentActiveTab] = useState('invoice-lines');
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);
  const [modifiedLineIds, setModifiedLineIds] = useState(new Set());
  const [deletedLineIds, setDeletedLineIds] = useState(new Set());
  const [showLineEditModal, setShowLineEditModal] = useState(false);
  const [showInventoryEditModal, setShowInventoryEditModal] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [pendingDaysBack, setPendingDaysBack] = useState(30);
  const [pendingDateRange, setPendingDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });
  const [currentUser, setCurrentUser] = useState(null);
  const [isLockedByOtherUser, setIsLockedByOtherUser] = useState(false);
  const [lockedByUserName, setLockedByUserName] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);
  const [expandedPayments, setExpandedPayments] = useState(new Set());
  const [expandedInvoices, setExpandedInvoices] = useState({});
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [sourceMap, setSourceMap] = useState({});

  const location = useLocation();
  const navigate = useNavigate();
  const supplierId = new URLSearchParams(location.search).get('id');
  const { registerSupplierLock, updateSupplierLock, clearSupplierLock } = useSupplierLock();

  const togglePaymentExpansion = (paymentId) => setExpandedPayments(prev => {
    const next = new Set(prev);
    if (next.has(paymentId)) next.delete(paymentId); else next.add(paymentId);
    return next;
  });

  const toggleInvoiceExpansion = (invoiceKey) => setExpandedInvoices(prev => ({ ...prev, [invoiceKey]: !prev[invoiceKey] }));

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const locs = await base44.entities.LinesOfCredit.list();
        const map = {};
        locs.forEach(loc => map[loc.id] = loc.name);
        setSourceMap(map);
      } catch (err) {
        console.error('Error fetching sources', err);
      }
    };
    fetchSources();
  }, []);

  const filteredInvoiceLines = useMemo(() => {
    let lines = [...(invoiceLines || [])];
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      lines = lines.filter(line => line.invoice_number?.toLowerCase().includes(search) || line.description?.toLowerCase().includes(search) || String(line.charge).toLowerCase().includes(search) || String(line.gst).toLowerCase().includes(search) || String(line.line_total).toLowerCase().includes(search));
    }
    if (sortConfig.key) {
      lines.sort((a, b) => {
        const isEmpty = (l) => !l.invoice_number && !l.description && (!l.charge || l.charge === 0) && (!l.gst || l.gst === 0) && (!l.line_total || l.line_total === 0);
        if (isEmpty(a) && !isEmpty(b)) return 1;
        if (!isEmpty(a) && isEmpty(b)) return -1;
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (['charge', 'gst', 'line_total'].includes(sortConfig.key)) {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
        } else if (sortConfig.key === 'invoice_date') {
          valA = new Date(valA || '1970-01-01').getTime();
          valB = new Date(valB || '1970-01-01').getTime();
        } else {
          valA = (valA || '').toString().toLowerCase();
          valB = (valB || '').toString().toLowerCase();
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return lines;
  }, [invoiceLines, searchTerm, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const refreshInvoiceSummaryFromLines = useCallback((nextLines) => {
    setConceptualInvoices((prevConceptualInvoices) => {
      const nextConceptualInvoices = recalculateConceptualInvoices(nextLines, prevConceptualInvoices, dateRange);
      setCurrentBalance(Math.round(nextConceptualInvoices.reduce((sum, invoice) => sum + (parseFloat(invoice.balance_due) || 0), 0) * 100) / 100);
      return nextConceptualInvoices;
    });
  }, [dateRange]);

  const ensureEmptyLine = useCallback((lines, defaultGlAccount, defaultTaxable) => {
    const lastLine = lines[lines.length - 1];
    const isLastLineMeaningful = lastLine && ((lastLine.invoice_number && lastLine.invoice_number !== '') || (lastLine.description && lastLine.description !== '') || (typeof lastLine.charge === 'number' && lastLine.charge !== 0) || (typeof lastLine.gst === 'number' && lastLine.gst !== 0) || lastLine.charge === 'Error' || lastLine.gst === 'Error' || lastLine.line_total === 'Error');
    if (!lastLine || isLastLineMeaningful) {
      const today = format(new Date(), 'yyyy-MM-dd');
      return [...lines, { id: `temp_${Date.now()}`, invoice_number: '', invoice_date: today, description: '', charge: 0, gst: 0, line_total: 0, gl_account: defaultGlAccount || '', isNew: true, inventory: false, gst_override: defaultTaxable || false, paid_amount: 0, dateError: null }];
    }
    return lines;
  }, []);

  const retryWithBackoff = useCallback(async (apiCall, maxRetries = 5) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        if (error.response?.status === 429 && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }, []);

  const acquireLock = useCallback(async () => {
    if (!supplierId) return false;
    try {
      const response = await retryWithBackoff(() => base44.functions.invoke('acquireSupplierLock', { supplierId }));
      if (response.data?.success) {
        setLockAcquired(true);
        return true;
      }
      setLockAcquired(false);
      setIsLockedByOtherUser(true);
      setLockedByUserName(response.data?.lockedByUser || 'another user');
      alert(response.data?.message || 'Edit lock was not obtained. This supplier is now read-only.');
      return false;
    } catch {
      setLockAcquired(false);
      alert('Edit lock was not obtained. Please reopen the supplier if you still need to edit it.');
      return false;
    }
  }, [supplierId, retryWithBackoff]);

  const releaseLock = useCallback(async (userToUnlock = currentUser) => {
    if (!supplierId || !userToUnlock) return;
    try {
      const res = await retryWithBackoff(() => base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Supplier', match: { id: supplierId } }));
      if (res.data?.data?.[0]?.LockedByUser === userToUnlock.email) {
        await retryWithBackoff(() => base44.functions.invoke('SupabaseProxy', { action: 'update', table: 'Supplier', id: supplierId, data: { LockedByUser: '' } }));
      }
    } catch {}
  }, [supplierId, retryWithBackoff, currentUser]);

  useEffect(() => { if (!supplierId) navigate(createPageUrl('Suppliers')); }, [supplierId, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
      if (supplierId && currentUser) releaseLock(currentUser);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (supplierId && currentUser) releaseLock(currentUser);
    };
  }, [hasUnsavedChanges, supplierId, currentUser, releaseLock]);

  const loadData = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const [user, response] = await Promise.all([
        base44.auth.me(),
        base44.functions.invoke('getSupplierTransactions', { supplierId, dateRange: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } })
      ]);
      setCurrentUser(user);
      if (!response.data.success) throw new Error(response.data.error || 'Failed to fetch supplier transactions');
      const { supplier: supplierData, chartOfAccounts: chartOfAccountsData, payments: paymentsData, conceptualInvoices: invoicesInRange, invoiceLines: enrichedLines, allInvoiceLines: allEnrichedLines, currentBalance: totalBalance, allConceptualInvoices: allInvoicesData } = response.data.data;
      if (supplierData?.LockedByUser && supplierData.LockedByUser !== user.email) {
        setSupplier(supplierData);
        setIsLockedByOtherUser(true);
        setLockedByUserName(supplierData.LockedByUser);
        setLockAcquired(false);
        return;
      }
      setIsLockedByOtherUser(false);
      setLockedByUserName('');
      setSupplier(supplierData);
      setChartOfAccounts(chartOfAccountsData);
      setPayments(paymentsData.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)));
      setCurrentBalance(totalBalance);
      const mapLine = (line) => {
        const pAmt = parseFloat(line.purchase_amount) || 0;
        const gAmt = parseFloat(line.gst_amount) || 0;
        return { ...line, charge: Math.round(pAmt * 100) / 100, gst: Math.round(gAmt * 100) / 100, line_total: Math.round((pAmt + gAmt) * 100) / 100, gl_account: line.gl_account ? String(line.gl_account) : '', gst_override: line.gst_override || false, paid_amount: Math.round((parseFloat(line.paid_amount) || 0) * 100) / 100, dateError: null };
      };
      const formattedConceptualInvoices = invoicesInRange.sort((a, b) => {
        const dateA = new Date(a.invoice_date);
        const dateB = new Date(b.invoice_date);
        if (dateA - dateB !== 0) return dateA - dateB;
        return (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
      }).map(invoice => ({ ...invoice, subtotal: Math.round(invoice.subtotal * 100) / 100, tax_amount: Math.round(invoice.tax_amount * 100) / 100, total_amount: Math.round(invoice.total_amount * 100) / 100, amount_paid: Math.round(invoice.amount_paid * 100) / 100, balance_due: Math.round(invoice.balance_due * 100) / 100, lines: invoice.lines.map(mapLine) }));
      setConceptualInvoices(formattedConceptualInvoices);
      setAllConceptualInvoices(allInvoicesData || []);
      const roundedLines = enrichedLines.sort((a, b) => {
        const dateA = new Date(a.invoice_date);
        const dateB = new Date(a.invoice_date);
        if (dateA - dateB !== 0) return dateA - dateB;
        return (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
      }).map(mapLine);
      const preparedLines = ensureEmptyLine(roundedLines, supplierData?.default_gl_account, supplierData?.default_taxable);
      setInvoiceLines(preparedLines);
      setConceptualInvoices(recalculateConceptualInvoices(preparedLines, formattedConceptualInvoices, dateRange));
      setAllInvoiceLines(allEnrichedLines.map(mapLine));
      setModifiedLineIds(new Set());
      setDeletedLineIds(new Set());
      setLockAcquired(supplierData?.LockedByUser === user.email);
      if (!supplierData?.LockedByUser) setTimeout(() => acquireLock(), 0);
    } catch (error) {
      console.error('Error loading supplier data:', error);
      alert(error.response?.status === 429 ? 'The system is currently experiencing high load. Please wait a moment and try refreshing the page.' : 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setHasUnsavedChanges(false);
    }
  }, [supplierId, dateRange, ensureEmptyLine, acquireLock]);

  useEffect(() => { if (supplierId) loadData(); }, [supplierId, dateRange, loadData]);

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

  const handleQuickRange = (type) => {
    const mountainNow = toMountainTime(new Date().toISOString());
    const currentYear = mountainNow.getFullYear();
    const currentMonth = mountainNow.getMonth();
    let from, to;
    switch (type) {
      case 'thisMonth': from = new Date(currentYear, currentMonth, 1); to = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999); break;
      case 'lastMonth': from = new Date(currentYear, currentMonth - 1, 1); to = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999); break;
      case 'thisQuarter': { const quarterMonth = Math.floor(currentMonth / 3) * 3; from = new Date(currentYear, quarterMonth, 1); to = new Date(currentYear, quarterMonth + 3, 0, 23, 59, 59, 999); break; }
      case 'thisYear': from = new Date(currentYear, 0, 1); to = new Date(currentYear, 11, 31, 23, 59, 59, 999); break;
      case 'lastYear': from = new Date(currentYear - 1, 0, 1); to = new Date(currentYear - 1, 11, 31, 23, 59, 59, 999); break;
      default: return;
    }
    from.setHours(0, 0, 0, 0);
    setPendingDateRange({ from, to });
    setPendingDaysBack('');
    setDateRange({ from, to });
    setDaysBack('');
  };

  const handleLineChange = (lineId, field, value) => {
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = ensureEmptyLine((prev || []).map(line => {
        if (line.id !== lineId) return line;
        if (isLineLocked(line) && field !== 'gl_account') return line;
        if (line.inventory) {
          if (field !== 'gst' && field !== 'gst_override') return line;
          if (field === 'gst' && !line.gst_override) return line;
        }
        const updatedLine = { ...line };
        if (field === 'invoice_date') {
          updatedLine[field] = value;
          updatedLine.dateError = null;
          return updatedLine;
        }
        if (updatedLine.gst_override) {
          if (field === 'line_total') {
            updatedLine.line_total = value;
            const numericTotal = parseFloat(value);
            if (!isNaN(numericTotal)) updatedLine.charge = Math.round((numericTotal - (typeof updatedLine.gst === 'number' ? updatedLine.gst : (parseFloat(updatedLine.gst) || 0))) * 100) / 100;
            else if (value === '' || value === '-') updatedLine.charge = 0;
            else updatedLine.charge = 'Error';
          } else {
            updatedLine[field] = value;
            const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
            const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);
            if (!isNaN(numericCharge) && !isNaN(numericGst)) updatedLine.line_total = Math.round((numericCharge + numericGst) * 100) / 100;
            else if (updatedLine.charge === '' || updatedLine.gst === '') updatedLine.line_total = 0;
            else updatedLine.line_total = 'Error';
          }
        } else {
          if (field === 'charge') {
            updatedLine.charge = value;
            const numericCharge = parseFloat(value);
            if (!isNaN(numericCharge)) {
              updatedLine.gst = Math.round(numericCharge * GST_RATE * 100) / 100;
              updatedLine.line_total = Math.round((numericCharge + updatedLine.gst) * 100) / 100;
            } else if (value === '' || value === '-') {
              updatedLine.gst = 0;
              updatedLine.line_total = 0;
            } else {
              updatedLine.gst = 'Error';
              updatedLine.line_total = 'Error';
            }
          } else if (field === 'gst') {
            updatedLine.gst = value;
            const numericGst = parseFloat(value);
            const currentNumericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
            if (!isNaN(numericGst) && !isNaN(currentNumericCharge)) updatedLine.line_total = Math.round((currentNumericCharge + numericGst) * 100) / 100;
            else if (value === '' || value === '-') updatedLine.line_total = !isNaN(currentNumericCharge) ? Math.round(currentNumericCharge * 100) / 100 : 'Error';
            else updatedLine.line_total = 'Error';
          } else if (field === 'line_total') {
            updatedLine.line_total = value;
            const numericTotal = parseFloat(value);
            if (!isNaN(numericTotal)) {
              updatedLine.charge = Math.round((numericTotal / (1 + GST_RATE)) * 100) / 100;
              updatedLine.gst = Math.round((numericTotal - updatedLine.charge) * 100) / 100;
            } else if (value === '' || value === '-') {
              updatedLine.charge = 0;
              updatedLine.gst = 0;
            } else {
              updatedLine.charge = 'Error';
              updatedLine.gst = 'Error';
            }
          } else {
            updatedLine[field] = value;
          }
        }
        return updatedLine;
      }), supplier?.default_gl_account, supplier?.default_taxable);
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    if (!lineId.startsWith('temp_')) setModifiedLineIds(prev => new Set(prev).add(lineId));
    setHasUnsavedChanges(true);
  };

  const handleGlAccountChange = async (line, newValue) => {
    if (line.inventory || line.inventory_item_id) return alert('Inventory items can only be posted to the inventory account');
    const fiscalCheck = await checkFiscalPeriodStatus(line.invoice_date);
    if (!fiscalCheck.isValid) return alert(fiscalCheck.message);
    handleLineChange(line.id, 'gl_account', newValue);
    setConceptualInvoices(prev => (prev || []).map(invoice => ({
      ...invoice,
      lines: (invoice.lines || []).map(invoiceLine => invoiceLine.id === line.id ? { ...invoiceLine, gl_account: newValue } : invoiceLine),
    })));
    setSelectedLineId(line.id);
  };

  const handleDateBlur = async (lineId, value) => {
    const line = (invoiceLines || []).find(l => l.id === lineId);
    if (isLineLocked(line) || line.inventory) return;
    const parseResult = parseAndValidateDateInput(value);
    if (!parseResult.valid) {
      setInvoiceLines(prev => (prev || []).map(l => l.id !== lineId ? l : { ...l, dateError: parseResult.error }));
      return alert(`Invalid date for invoice line "${line.description || line.invoice_number || 'New Line'}": ${parseResult.error}`);
    }
    const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
    if (!fiscalCheck.isValid) {
      setInvoiceLines(prev => (prev || []).map(l => l.id !== lineId ? l : { ...l, dateError: fiscalCheck.message }));
      return alert(`Fiscal Period Error for invoice line "${line.description || line.invoice_number || 'New Line'}": ${fiscalCheck.message}`);
    }
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = (prev || []).map(l => l.id !== lineId ? l : { ...l, invoice_date: parseResult.date, dateError: null });
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    if (!lineId.startsWith('temp_')) setModifiedLineIds(prev => new Set(prev).add(lineId));
    setHasUnsavedChanges(true);
  };

  const handleCalendarDateSelect = async (line, date) => {
    if (!date) return;
    const locked = isLineLocked(line);
    const isDisabled = isLockedByOtherUser || !lockAcquired || locked;
    if (isDisabled) return;
    const isoDate = format(date, 'yyyy-MM-dd');
    const fiscalCheck = await checkFiscalPeriodStatus(isoDate);
    if (!fiscalCheck.isValid) {
      alert(fiscalCheck.message);
      setInvoiceLines(prev => (prev || []).map(l => l.id === line.id ? { ...l, dateError: fiscalCheck.message } : l));
      return;
    }
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = (prev || []).map(l => l.id === line.id ? { ...l, invoice_date: isoDate, dateError: null } : l);
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    setHasUnsavedChanges(true);
  };

  const handleValueBlur = (lineId, field, value) => {
    const line = (invoiceLines || []).find(l => l.id === lineId);
    if (isLineLocked(line)) return;
    if (line.inventory && field !== 'gst') return;
    if (field !== 'charge' && field !== 'gst' && field !== 'line_total') return;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    const roundedValue = Math.round(numValue * 100) / 100;
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = (prev || []).map(line => {
        if (line.id !== lineId) return line;
        const updatedLine = { ...line };
        if (updatedLine.gst_override) {
          if (field === 'line_total') {
            updatedLine.line_total = roundedValue;
            updatedLine.charge = Math.round((roundedValue - (typeof updatedLine.gst === 'number' ? updatedLine.gst : (parseFloat(updatedLine.gst) || 0))) * 100) / 100;
          } else {
            if (field === 'charge') updatedLine.charge = roundedValue;
            if (field === 'gst') updatedLine.gst = roundedValue;
            const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
            const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);
            if (!isNaN(numericCharge) && !isNaN(numericGst)) updatedLine.line_total = Math.round((numericCharge + numericGst) * 100) / 100;
            else if (updatedLine.charge === '' || updatedLine.gst === '') updatedLine.line_total = 0;
            else updatedLine.line_total = 'Error';
          }
        } else {
          if (field === 'charge') {
            updatedLine.charge = roundedValue;
            updatedLine.gst = Math.round(roundedValue * GST_RATE * 100) / 100;
            updatedLine.line_total = Math.round((roundedValue + updatedLine.gst) * 100) / 100;
          } else if (field === 'gst') {
            updatedLine.gst = roundedValue;
            const currentNumericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
            updatedLine.line_total = !isNaN(currentNumericCharge) ? Math.round((currentNumericCharge + roundedValue) * 100) / 100 : 'Error';
          } else if (field === 'line_total') {
            updatedLine.line_total = roundedValue;
            updatedLine.charge = Math.round((roundedValue / (1 + GST_RATE)) * 100) / 100;
            updatedLine.gst = Math.round((roundedValue - updatedLine.charge) * 100) / 100;
          }
        }
        return updatedLine;
      });
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    if (!lineId.startsWith('temp_')) setModifiedLineIds(prev => new Set(prev).add(lineId));
    setHasUnsavedChanges(true);
  };

  const handleToggleGstOverride = (lineId) => {
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = (prev || []).map(line => {
        if (line.id !== lineId) return line;
        if (isLineLocked(line)) return line;
        const updatedLine = { ...line, gst_override: !line.gst_override };
        if (!updatedLine.gst_override) {
          const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
          if (!isNaN(numericCharge)) {
            updatedLine.gst = Math.round(numericCharge * GST_RATE * 100) / 100;
            updatedLine.line_total = Math.round((numericCharge + updatedLine.gst) * 100) / 100;
          } else {
            updatedLine.gst = 0;
            updatedLine.line_total = 0;
          }
        } else {
          const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
          const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);
          updatedLine.line_total = !isNaN(numericCharge) && !isNaN(numericGst) ? Math.round((numericCharge + numericGst) * 100) / 100 : 'Error';
        }
        return updatedLine;
      });
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    if (!lineId.startsWith('temp_')) setModifiedLineIds(prev => new Set(prev).add(lineId));
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = useCallback(async () => {
    if (isLockedByOtherUser || !lockAcquired) return alert('Cannot save: Supplier is locked by another user or you do not have the lock.'), false;
    const linesWithDateErrors = (invoiceLines || []).filter(line => line.dateError);
    if (linesWithDateErrors.length > 0) return alert(`Cannot save: Please correct all invalid dates before saving. Found ${linesWithDateErrors.length} errors.`), false;
    setIsSaving(true);
    try {
      const linesToSave = (invoiceLines || []).filter(line => !((line.id.startsWith('temp_') || line.isNew) && !line.invoice_number && !line.description && (line.charge === 0 || line.charge === '') && (line.gst === 0 || line.gst === '')) && (line.id.startsWith('temp_') || modifiedLineIds.has(line.id)));
      const invalidNumericFields = [];
      linesToSave.forEach((line, index) => {
        if (isLineLocked(line)) return;
        if (line.charge === 'Error') invalidNumericFields.push({ lineNumber: index + 1, field: 'Charge', invoice: line.invoice_number || 'New Line' });
        if (line.gst === 'Error') invalidNumericFields.push({ lineNumber: index + 1, field: 'GST', invoice: line.invoice_number || 'New Line' });
        if (line.line_total === 'Error') invalidNumericFields.push({ lineNumber: index + 1, field: 'Line Total', invoice: line.invoice_number || 'New Line' });
        if (line.charge !== 'Error') { const val = line.charge === '' ? 0 : parseFloat(line.charge); if (isNaN(val) && line.charge !== '') invalidNumericFields.push({ lineNumber: index + 1, field: 'Charge', value: line.charge, invoice: line.invoice_number || 'New Line' }); }
        if (line.gst !== 'Error') { const val = line.gst === '' ? 0 : parseFloat(line.gst); if (isNaN(val) && line.gst !== '') invalidNumericFields.push({ lineNumber: index + 1, field: 'GST', value: line.gst, invoice: line.invoice_number || 'New Line' }); }
        if (line.line_total !== 'Error') { const val = line.line_total === '' ? 0 : parseFloat(line.line_total); if (isNaN(val) && line.line_total !== '') invalidNumericFields.push({ lineNumber: index + 1, field: 'Line Total', value: line.line_total, invoice: line.invoice_number || 'New Line' }); }
      });
      if (invalidNumericFields.length > 0) {
        const errorMessage = invalidNumericFields.length === 1 ? `Invalid value in ${invalidNumericFields[0].field} field for invoice "${invalidNumericFields[0].invoice}".\n\nPlease correct the value before saving.` : `Found ${invalidNumericFields.length} invalid numeric values:\n\n${invalidNumericFields.map(line => `• Invoice "${line.invoice}" - ${line.field}`).join('\n')}\n\nPlease correct these values before saving.`;
        alert(errorMessage);
        setIsSaving(false);
        return false;
      }
      const invalidGLLines = linesToSave.filter(line => (line.invoice_number || line.description || (typeof line.charge === 'number' && line.charge !== 0) || (typeof line.gst === 'number' && line.gst !== 0) || line.charge !== 0 || line.gst !== 0) && (!line.gl_account || String(line.gl_account).trim() === '') && !line.inventory);
      if (invalidGLLines.length > 0) {
        alert('Please select a GL Account for all new or modified invoice lines before saving.');
        setIsSaving(false);
        return false;
      }
      const addedLines = linesToSave.filter(l => l.id.startsWith('temp_')).map(line => ({ invoice_number: line.invoice_number, invoice_date: line.invoice_date, description: line.description, purchase_amount: parseFloat(line.charge) || 0, gst_amount: parseFloat(line.gst) || 0, gl_account: line.gl_account, gst_override: line.gst_override }));
      const modifiedLines = linesToSave.filter(l => modifiedLineIds.has(l.id) && !l.id.startsWith('temp_')).map(line => ({ id: line.id, invoice_number: line.invoice_number, invoice_date: line.invoice_date, description: line.description, purchase_amount: parseFloat(line.charge) || 0, gst_amount: parseFloat(line.gst) || 0, gl_account: line.gl_account, gst_override: line.gst_override }));
      const response = await base44.functions.invoke('saveSupplierInvoiceTransactions', { supplierId, addedLines, modifiedLines, deletedLineIds: Array.from(deletedLineIds) });
      if (response.data.success) {
        await loadData();
        return true;
      }
      throw new Error(response.data.error || 'Unknown error');
    } catch (error) {
      console.error('Error saving changes:', error);
      alert(`Failed to save changes: ${error.response?.data?.error || error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isLockedByOtherUser, lockAcquired, invoiceLines, modifiedLineIds, deletedLineIds, supplierId, loadData]);

  useEffect(() => {
    registerSupplierLock({
      supplierId,
      supplierName: supplier?.name || '',
      hasUnsavedChanges,
      releaseLock: async () => await releaseLock(currentUser),
      saveBeforeLeave: handleSaveAll,
    });

    return () => clearSupplierLock();
  }, [supplierId, supplier?.name, hasUnsavedChanges, currentUser, releaseLock, handleSaveAll, registerSupplierLock, clearSupplierLock]);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.ctrlKey && (e.key === '$' || e.key === '4' || e.key === 'm')) {
        e.preventDefault();
        if (!isLockedByOtherUser && lockAcquired) {
          if (hasUnsavedChanges) {
            const userChoice = window.confirm('You have unsaved changes. Would you like to save them before making a payment?\n\nClick "OK" to save and continue, or "Cancel" to continue without saving.');
            if (userChoice) {
              const saveSuccessful = await handleSaveAll();
              if (saveSuccessful) setShowPaymentModal(true);
            } else setShowPaymentModal(true);
          } else setShowPaymentModal(true);
        }
      }
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        if (selectedLineId && !isLockedByOtherUser && lockAcquired) {
          const line = (invoiceLines || []).find(l => l.id === selectedLineId);
          if (line && !isLineLocked(line)) handleToggleGstOverride(selectedLineId);
        }
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !isLockedByOtherUser && lockAcquired) await handleSaveAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLineId, invoiceLines, isLockedByOtherUser, lockAcquired, hasUnsavedChanges, handleSaveAll]);

  const handlePaymentComplete = useCallback(() => {
    setShowPaymentModal(false);
    loadData();
  }, [loadData]);

  const handleCancelPayment = async (payment) => {
    if (!window.confirm('Are you sure you want to cancel this payment? This action cannot be undone and will reverse all associated transactions.')) return;
    setLoading(true);
    try {
      console.log('Cancel supplier payment payload:', payment, 'payment.id:', payment?.id);
      const response = await base44.functions.invoke('cancelSupplierPayment', { paymentId: payment.id });
      if (response.data.success) {
        alert('Payment cancelled successfully.');
        loadData();
      } else {
        alert(response?.data?.error || 'An error occurred while cancelling the payment.');
      }
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert(error?.response?.data?.error || error?.response?.data?.message || 'An error occurred while cancelling the payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditLineClick = (line) => {
    setEditingLine(line);
    ((line.inventory_credit !== true) && line.inventory_item_id ? setShowInventoryEditModal : setShowLineEditModal)(true);
  };

  const handleLineUpdate = useCallback(async (updatedLineData) => {
    if (!updatedLineData || !updatedLineData.id) return;
    if (isLineLocked(updatedLineData)) return alert('This line cannot be updated because it has a payment applied or is an inventory line.');
    if (updatedLineData.charge === 'Error' || updatedLineData.gst === 'Error' || updatedLineData.line_total === 'Error') return alert('Please correct the invalid numeric inputs in the line editor before saving.');
    const parseResult = parseAndValidateDateInput(updatedLineData.invoice_date);
    if (!parseResult.valid) return alert(`Invalid date in line editor: ${parseResult.error}`);
    const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
    if (!fiscalCheck.isValid) return alert(`Fiscal Period Error in line editor: ${fiscalCheck.message}`);
    let nextLines = [];
    setInvoiceLines(prev => {
      nextLines = (prev || []).map(l => l.id !== updatedLineData.id ? l : { ...updatedLineData, invoice_date: parseResult.date, charge: parseFloat(updatedLineData.charge) || 0, gst: parseFloat(updatedLineData.gst) || 0, line_total: parseFloat(updatedLineData.line_total) || 0 });
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    if (!updatedLineData.id.startsWith('temp_')) setModifiedLineIds(prev => new Set(prev).add(updatedLineData.id));
    setHasUnsavedChanges(true);
    setShowLineEditModal(false);
    setEditingLine(null);
  }, []);

  const handleTabChange = async (newTab) => {
    if (currentActiveTab === 'invoice-lines' && newTab !== 'invoice-lines' && hasUnsavedChanges) {
      const userChoice = window.confirm('You have unsaved changes. Would you like to save them before switching tabs?\n\nClick "OK" to save and continue, or "Cancel" to stay on this tab.');
      if (userChoice) {
        const saveSuccessful = await handleSaveAll();
        if (saveSuccessful) setCurrentActiveTab(newTab);
      }
    } else setCurrentActiveTab(newTab);
  };

  const handleDeleteLine = async (lineId) => {
    const line = (invoiceLines || []).find(l => l.id === lineId);
    if (!line) return;
    const locked = isLineLocked(line);
    if (locked || line.inventory) return alert('This line cannot be deleted because it has a payment applied or is an inventory line.');
    if (window.confirm('Are you sure you want to delete this line?')) {
      let nextLines = [];
      if (line.isNew || line.id.startsWith('temp_')) {
        setInvoiceLines(prev => {
          nextLines = ensureEmptyLine((prev || []).filter(l => l.id !== lineId), supplier?.default_gl_account, supplier?.default_taxable);
          return nextLines;
        });
      } else {
        setDeletedLineIds(prev => new Set(prev).add(lineId));
        setInvoiceLines(prev => {
          nextLines = ensureEmptyLine((prev || []).filter(l => l.id !== lineId), supplier?.default_gl_account, supplier?.default_taxable);
          return nextLines;
        });
      }
      refreshInvoiceSummaryFromLines(nextLines);
      setHasUnsavedChanges(true);
    }
  };

  const createNewLine = () => ({ id: `temp_${Date.now()}`, supplier_id: supplierId, invoice_number: '', invoice_date: format(new Date(), 'yyyy-MM-dd'), description: '', charge: 0, gst: 0, line_total: 0, gl_account: supplier?.default_gl_account || '', isNew: true, inventory: false, gst_override: false, paid_amount: 0, dateError: null });

  const handleAddLineAbove = (lineId) => {
    let nextLines = [];
    setInvoiceLines(prev => {
      const idx = (prev || []).findIndex(l => l.id === lineId);
      if (idx === -1) {
        nextLines = prev || [];
        return prev || [];
      }
      nextLines = [...(prev || [])];
      nextLines.splice(idx, 0, createNewLine());
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    setHasUnsavedChanges(true);
  };

  const handleAddLineBelow = (lineId) => {
    let nextLines = [];
    setInvoiceLines(prev => {
      const idx = (prev || []).findIndex(l => l.id === lineId);
      if (idx === -1) {
        nextLines = prev || [];
        return prev || [];
      }
      nextLines = [...(prev || [])];
      nextLines.splice(idx + 1, 0, createNewLine());
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    setHasUnsavedChanges(true);
  };

  const handleAddSummaryLineBelow = (line) => {
    let nextLines = [];
    setInvoiceLines(prev => {
      const safePrev = prev || [];
      const exactIndex = safePrev.findIndex(existingLine => existingLine.id === line.id);
      const fallbackIndex = safePrev.reduce((lastMatchIndex, existingLine, index) => {
        return existingLine.invoice_number === line.invoice_number && existingLine.invoice_date === line.invoice_date
          ? index
          : lastMatchIndex;
      }, -1);
      const insertIndex = exactIndex !== -1 ? exactIndex : fallbackIndex;
      if (insertIndex === -1) {
        nextLines = safePrev;
        return safePrev;
      }

      nextLines = [...(prev || [])];
      nextLines.splice(insertIndex + 1, 0, {
        id: `temp_${Date.now()}`,
        supplier_id: supplierId,
        invoice_number: line.invoice_number || '',
        invoice_date: line.invoice_date,
        conceptual_invoice_key: `${line.supplier_id}_${line.invoice_number}_${line.invoice_date}`,
        description: '',
        charge: 0,
        gst: 0,
        line_total: 0,
        gl_account: supplier?.default_gl_account || '',
        isNew: true,
        inventory: false,
        gst_override: !!supplier?.default_taxable,
        paid_amount: 0,
        dateError: null,
      });
      return nextLines;
    });
    refreshInvoiceSummaryFromLines(nextLines);
    setHasUnsavedChanges(true);
  };

  const handleBackNavigation = useCallback(async () => {
    if (isNavigatingBack) return;
    setIsNavigatingBack(true);
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');
    const targetPage = fromPage === 'apsummary' ? 'APSummary' : 'Suppliers';
    const leavePage = async () => {
      if (lockAcquired && supplierId && currentUser) await releaseLock(currentUser);
      navigate(createPageUrl(targetPage));
    };
    if (hasUnsavedChanges) {
      const message = `You have unsaved changes. Would you like to save them before returning to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}?\n\nClick "OK" to save changes and return to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}.\nClick "Cancel" to stay on this page, or click "Cancel" again to discard.`;
      const userWantsToSave = window.confirm(message);
      if (userWantsToSave) {
        const saveSuccessful = await handleSaveAll();
        if (saveSuccessful) return await leavePage();
      } else {
        const discardMessage = `Do you want to discard your changes and return to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}?\n\nClick "OK" to discard changes and leave.\nClick "Cancel" to stay on this page.`;
        if (window.confirm(discardMessage)) return await leavePage();
      }
    } else return await leavePage();
    setIsNavigatingBack(false);
  }, [hasUnsavedChanges, supplierId, lockAcquired, currentUser, releaseLock, navigate, handleSaveAll, isNavigatingBack]);

  const handleSupplierUpdate = async (updatedSupplierData) => {
    try {
      if (!supplier?.id) return alert('Missing supplier ID.');
      await base44.functions.invoke('SupabaseProxy', { action: 'update', table: 'Supplier', id: supplier.id, data: updatedSupplierData });
      setShowEditSupplierModal(false);
      const res = await base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Supplier', match: { id: supplier.id } });
      setSupplier(res.data?.data?.[0] || supplier);
      alert('Supplier updated successfully');
    } catch {
      alert('Failed to update supplier.');
    }
  };

  const handlePrintCheque = useCallback((chequeReference) => {
    window.location.href = `${createPageUrl('ChequeWriter')}?chequeReference=${encodeURIComponent(chequeReference)}`;
  }, []);

  const dateRangeTotal = useMemo(() => (invoiceLines || []).filter(l => l.invoice_number && (typeof l.line_total === 'number' || !isNaN(parseFloat(l.line_total)))).reduce((sum, line) => sum + ((parseFloat(line.line_total) || 0) - (parseFloat(line.paid_amount) || 0)), 0), [invoiceLines]);

  if (isLockedByOtherUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full"><CardContent className="pt-6"><div className="text-center space-y-4"><div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-yellow-600" /></div><div><h2 className="text-xl font-bold text-gray-900 mb-2">Supplier Currently Being Edited</h2><p className="text-gray-600">This supplier is currently being edited by <span className="font-semibold">{lockedByUserName}</span>.</p><p className="text-gray-500 text-sm mt-2">You can view it in read-only mode or try again later.</p></div><div className="flex flex-col gap-2 pt-4"><Button onClick={() => navigate(createPageUrl(`SupplierTxView?id=${supplierId}`))} className="w-full" variant="outline">View Read-Only</Button><Button onClick={() => window.location.reload()} className="w-full" variant="outline">Try Again</Button><Button onClick={() => navigate(createPageUrl('Suppliers'))} className="w-full" variant="ghost">Cancel</Button></div></div></CardContent></Card>
      </div>
    );
  }

  if (loading || isSaving) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="text-lg font-semibold">{isSaving ? 'Saving changes...' : 'Loading supplier data.....'}</div><div className="text-gray-500 mt-2">This may take a moment</div><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div></div></div>;
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: landscape; margin: 5mm; }
          * { color: #000 !important; background-color: #fff !important; border-color: #000 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 9px; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.1; }
          nav, header, button, .no-print, [role="dialog"], .fixed, .lucide:not(.check-icon), input[type="search"] { display: none !important; }
          [role="tablist"] { display: none !important; }
          .p-6, .p-4 { padding: 0 !important; }
          .min-h-screen { min-height: auto !important; }
          .flex.items-center.justify-between.mb-6 { display: none !important; }
          .mb-4.flex.justify-between.items-start { display: none !important; }
          table { font-size: 9px !important; width: 100% !important; border-collapse: collapse !important; margin-bottom: 0 !important; }
          th, td { border: 1px solid #ccc !important; padding: 1px 2px !important; page-break-inside: avoid; height: auto !important; vertical-align: middle; }
          thead { display: table-header-group; background: #f0f0f0 !important; font-weight: bold; }
          tr { page-break-inside: avoid; }
          input, textarea, select { border: none !important; background: none !important; padding: 0 !important; width: auto !important; resize: none !important; -webkit-appearance: none; box-shadow: none !important; color: #000 !important; font-size: inherit !important; line-height: inherit !important; height: auto !important; min-height: 0 !important; margin: 0 !important; overflow: hidden; }
          .border, .shadow-sm, .rounded-lg, .rounded-md { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .max-w-screen-xl { max-width: none !important; margin: 0 !important; }
          .print-header { display: block !important; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 5px; }
          .print-header-grid { display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: end; }
          .print-totals { display: flex; gap: 20px; justify-content: flex-end; margin-top: 5px; }
          .print-total-item { text-align: right; }
          .print-total-label { font-size: 8px; color: #666 !important; text-transform: uppercase; letter-spacing: 0.5px; }
          .print-total-value { font-size: 10px; font-weight: bold; }
          table.lines-table { table-layout: fixed !important; width: 100% !important; }
          table.lines-table th, table.lines-table td { font-size: 12px !important; padding: 0 2px !important; }
          table.lines-table th:nth-child(1), table.lines-table td:nth-child(1) { width: 10% !important; }
          table.lines-table th:nth-child(2), table.lines-table td:nth-child(2) { width: 10% !important; }
          table.lines-table th:nth-child(3), table.lines-table td:nth-child(3) { width: 35% !important; }
          table.lines-table th:nth-child(4), table.lines-table td:nth-child(4) { width: 10% !important; text-align: right !important; }
          table.lines-table th:nth-child(5), table.lines-table td:nth-child(5) { width: 8% !important; text-align: right !important; }
          table.lines-table th:nth-child(6), table.lines-table td:nth-child(6) { width: 10% !important; text-align: right !important; }
          table.lines-table th:nth-child(7), table.lines-table td:nth-child(7) { width: 17% !important; }
          table.lines-table th:nth-child(8), table.lines-table td:nth-child(8) { display: none !important; }
          .gl-print-text { display: block !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px !important; }
          .gl-select-trigger { display: none !important; }
          .summary-print-table { display: table !important; width: 100% !important; border-collapse: collapse !important; margin-top: 10px; }
          .summary-print-table th, .summary-print-table td { border: 1px solid #000 !important; padding: 6px 8px !important; font-size: 18px !important; text-align: right; }
          .summary-print-table th { background: #eee !important; font-weight: bold; text-align: center; font-size: 18px !important; }
          .summary-print-table td:first-child { text-align: left; }
          .summary-print-table td:nth-child(2) { text-align: center; }
          .summary-screen-list { display: none !important; }
          .invoice-summary-total-row { display: none !important; }
        }
        .print-header { display: none; }
        .gl-print-text { display: none; }
        .summary-print-table { display: none; }
      `}</style>
      <div className="p-6 min-h-screen">
        <div className="max-w-screen-xl mx-auto">
          <div className="print-header"><div className="print-header-grid"><div><h2 style={{ fontSize: '14pt', margin: 0, fontWeight: 'bold' }}>{supplier?.name}</h2><div style={{ fontSize: '9px' }}>Transaction Report • {dateRange.from && dateRange.to ? `${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')}` : 'All Dates'}</div></div><div className="text-right"><div style={{ fontSize: '8px', color: '#666', marginBottom: '4px' }}>Printed: {format(new Date(), 'MMM dd, yyyy HH:mm')}</div><div className="print-totals"><div className="print-total-item"><div className="print-total-label">Date Range Total</div><div className="print-total-value">${dateRangeTotal.toFixed(2)}</div></div><div className="print-total-item"><div className="print-total-label">Balance Owing</div><div className="print-total-value">${currentBalance.toFixed(2)}</div></div></div></div></div></div>
          <div className="mb-6"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button variant="outline" onClick={handleBackNavigation} disabled={isNavigatingBack} className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900">{isNavigatingBack ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowLeft className="w-4 h-4 mr-2" />}Back</Button><div className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm"><h1 className="text-2xl font-bold text-slate-900 truncate max-w-[600px]" title={supplier?.name}>{supplier?.name}</h1></div></div><div className="flex flex-wrap items-center gap-3"><Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white"><Printer className="w-4 h-4 mr-2" />Print</Button><Button onClick={() => setShowEditSupplierModal(true)} disabled={isLockedByOtherUser || !lockAcquired} variant="outline" className="bg-white border-slate-300 hover:bg-slate-50"><Edit className="w-4 h-4 mr-2" />Edit Supplier</Button><Button onClick={handleSaveAll} disabled={!hasUnsavedChanges || isSaving || isLockedByOtherUser || !lockAcquired} className="bg-slate-900 hover:bg-slate-800 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? 'Saving...' : 'Save All Changes'}</Button><Button onClick={async () => { if (hasUnsavedChanges) { const userChoice = window.confirm('You have unsaved changes. Would you like to save them before making a payment?\n\nClick "OK" to save and continue, or "Cancel" to continue without saving.'); if (userChoice) { const saveSuccessful = await handleSaveAll(); if (saveSuccessful) setShowPaymentModal(true); } else setShowPaymentModal(true); } else setShowPaymentModal(true); }} disabled={isLockedByOtherUser || !lockAcquired} className="bg-green-600 hover:bg-green-700 text-white"><DollarSign className="w-4 h-4 mr-2" />Make Payment</Button></div></div></div>
          <div className="mb-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Label htmlFor="daysBackInput">Days Back:</Label><Input id="daysBackInput" type="number" value={pendingDaysBack} onChange={(e) => handlePendingDaysBackChange(e.target.value)} className="w-20 bg-white" disabled={isLockedByOtherUser || !lockAcquired} /></div>
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-64 justify-start text-left font-normal" disabled={isLockedByOtherUser || !lockAcquired}><CalendarIcon className="mr-2 h-4 w-4" />{pendingDateRange.from && pendingDateRange.to ? `${safeFormatDate(pendingDateRange.from.toISOString())} - ${safeFormatDate(pendingDateRange.to.toISOString())}` : 'Select a date range'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={pendingDateRange} onSelect={handlePendingDateRangeChange} numberOfMonths={2} disabled={isLockedByOtherUser || !lockAcquired} /></PopoverContent></Popover>
                <Button onClick={handleApplyDateRange} disabled={isLockedByOtherUser || !lockAcquired || loading || isSaving} className="bg-blue-600 hover:bg-blue-700">Apply</Button>
                <div className="flex items-center gap-2"><Search className="w-4 h-4 text-slate-400" /><Input placeholder="Search invoice #, description, or amount..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-96 bg-white" disabled={isLockedByOtherUser || !lockAcquired} /></div>
              </div>
              <div className="flex gap-4 text-sm px-1">
                <button onClick={() => handleQuickRange('thisMonth')} className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLockedByOtherUser || !lockAcquired}>This Month</button>
                <button onClick={() => handleQuickRange('lastMonth')} className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLockedByOtherUser || !lockAcquired}>Last Month</button>
                <button onClick={() => handleQuickRange('thisQuarter')} className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLockedByOtherUser || !lockAcquired}>This Quarter</button>
                <button onClick={() => handleQuickRange('thisYear')} className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLockedByOtherUser || !lockAcquired}>This Year</button>
                <button onClick={() => handleQuickRange('lastYear')} className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLockedByOtherUser || !lockAcquired}>Last Year</button>
              </div>
            </div>
            <Card className="bg-white shadow-sm"><CardContent className="p-4"><div className="flex gap-6"><div className="text-right"><p className="text-sm text-slate-500">Date Range Total</p><p className="text-lg font-bold">${dateRangeTotal.toFixed(2)}</p></div><div className="text-right"><p className="text-sm text-slate-500">Total Balance Owing</p><p className="text-lg font-bold text-red-600">${currentBalance.toFixed(2)}</p></div></div></CardContent></Card>
          </div>
          <Tabs value={currentActiveTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList><TabsTrigger value="invoice-lines">Invoice Lines</TabsTrigger><TabsTrigger value="invoice-summary">Invoice Summary</TabsTrigger><TabsTrigger value="payment-history">Payment History</TabsTrigger></TabsList>
            <TabsContent value="invoice-lines"><Card><CardContent className="p-0"><SupplierTxInvoiceLinesTab filteredInvoiceLines={filteredInvoiceLines} sortConfig={sortConfig} requestSort={requestSort} isLockedByOtherUser={isLockedByOtherUser} lockAcquired={lockAcquired} setSelectedLineId={setSelectedLineId} handleLineChange={handleLineChange} handleDateBlur={handleDateBlur} formatDateForInput={formatDateForInput} safeParseDateForCalendar={safeParseDateForCalendar} handleCalendarDateSelect={handleCalendarDateSelect} handleValueBlur={handleValueBlur} chartOfAccounts={chartOfAccounts} handleGlAccountChange={handleGlAccountChange} handleDeleteLine={handleDeleteLine} handleToggleGstOverride={handleToggleGstOverride} handleEditLineClick={handleEditLineClick} handleAddLineAbove={handleAddLineAbove} handleAddLineBelow={handleAddLineBelow} isLineLocked={isLineLocked} /></CardContent></Card></TabsContent>
            <TabsContent value="invoice-summary"><SupplierTxInvoiceSummaryTab conceptualInvoices={conceptualInvoices} invoiceLines={invoiceLines} expandedInvoices={expandedInvoices} toggleInvoiceExpansion={toggleInvoiceExpansion} safeFormatDate={safeFormatDate} isLockedByOtherUser={isLockedByOtherUser} lockAcquired={lockAcquired} chartOfAccounts={chartOfAccounts} handleLineChange={handleLineChange} handleDateBlur={handleDateBlur} formatDateForInput={formatDateForInput} handleValueBlur={handleValueBlur} handleGlAccountChange={handleGlAccountChange} handleDeleteLine={handleDeleteLine} handleToggleGstOverride={handleToggleGstOverride} handleAddSummaryLineBelow={handleAddSummaryLineBelow} isLineLocked={isLineLocked} /></TabsContent>
            <TabsContent value="payment-history"><SupplierTxPaymentHistoryTab loading={loading} payments={payments} expandedPayments={expandedPayments} togglePaymentExpansion={togglePaymentExpansion} safeFormatDate={safeFormatDate} handlePrintCheque={handlePrintCheque} handleCancelPayment={handleCancelPayment} sourceMap={sourceMap} isLockedByOtherUser={isLockedByOtherUser} lockAcquired={lockAcquired} /></TabsContent>
          </Tabs>
        </div>
      </div>
      <div className="fixed right-8 bottom-8 flex flex-col gap-2 z-50"><Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} size="icon" className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700" title="Scroll to top"><ArrowUp className="w-5 h-5" /></Button><Button onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })} size="icon" className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700" title="Scroll to bottom"><ArrowDown className="w-5 h-5" /></Button></div>
      <Dialog open={showEditSupplierModal} onOpenChange={setShowEditSupplierModal}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>{supplier && <SupplierForm supplier={supplier} onSubmit={handleSupplierUpdate} onCancel={() => setShowEditSupplierModal(false)} />}</DialogContent></Dialog>
      <SupplierTxModals showLineEditModal={showLineEditModal} setShowLineEditModal={setShowLineEditModal} showInventoryEditModal={showInventoryEditModal} setShowInventoryEditModal={setShowInventoryEditModal} editingLine={editingLine} setEditingLine={setEditingLine} handleLineUpdate={handleLineUpdate} chartOfAccounts={chartOfAccounts} loadData={loadData} showPaymentModal={showPaymentModal} setShowPaymentModal={setShowPaymentModal} supplier={supplier} allConceptualInvoices={allConceptualInvoices} handlePaymentComplete={handlePaymentComplete} />
    </>
  );
}