import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Supplier, SupplierInvoiceLine, SupplierPayment, ChartOfAccount } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Calendar as CalendarIcon, Save, DollarSign, Trash2, AlertTriangle, ChevronDown, ChevronRight, Search, Lock, Edit, Receipt, Printer, Loader2, FileText, Calculator, ArrowUp, ArrowDown } from 'lucide-react';
import { format, subDays, parseISO, differenceInDays } from 'date-fns';
import { createPageUrl } from '@/utils';
import SupplierPaymentModal from '../components/suppliers/SupplierPaymentModal';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SupplierForm from "../components/suppliers/SupplierForm";
import LineEditModal from '../components/suppliers/LineEditModal';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from "@/components/ui/badge";
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';

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

// Helper function to safely parse date for calendar component
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

// Helper function to format date for input field (MM/DD/YYYY)
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

// Helper function to parse and validate date input with autofill
const parseAndValidateDateInput = (inputDate) => {
    if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
    
    const trimmed = inputDate.trim();
    let month, day, year;
    
    try {
        const parts = trimmed.split('/');
        
        if (parts.length === 2) {
            // MM/DD format - autofill current year
            month = parts[0];
            day = parts[1];
            year = new Date().getFullYear().toString();
        } else if (parts.length === 3) {
            // MM/DD/YY or MM/DD/YYYY format
            month = parts[0];
            day = parts[1];
            year = parts[2];
            
            // Convert 2-digit year to 4-digit
            if (year.length === 2) {
                const currentYear = new Date().getFullYear();
                const currentCentury = Math.floor(currentYear / 100) * 100;
                const twoDigitYear = parseInt(year);
                year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
            }
        } else {
            return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
        }
        
        // Pad month and day
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
        
        // Validate numeric values
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
            return { valid: false, date: null, error: 'Date must contain valid numbers' };
        }
        
        if (monthNum < 1 || monthNum > 12) {
            return { valid: false, date: null, error: 'Month must be between 1 and 12' };
        }
        
        if (dayNum < 1 || dayNum > 31) {
            return { valid: false, date: null, error: 'Day must be between 1 and 31' };
        }
        
        if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) { // Arbitrary but reasonable year range
            return { valid: false, date: null, error: 'Year must be a valid 4-digit year (1900-2100)' };
        }
        
        // Create date and validate it's a real date
        const isoDate = `${year}-${month}-${day}`;
        const testDate = new Date(isoDate + 'T00:00:00'); // Use T00:00:00 to avoid timezone issues
        
        if (isNaN(testDate.getTime())) {
            return { valid: false, date: null, error: 'Invalid date' };
        }
        
        // Verify the date components match (catches invalid dates like Feb 30)
        if (testDate.getFullYear() !== yearNum || 
            testDate.getMonth() + 1 !== monthNum || 
            testDate.getDate() !== dayNum) {
            return { valid: false, date: null, error: 'Invalid date (e.g., Feb 30, April 31 do not exist)' };
        }
        
        return { valid: true, date: isoDate, error: null };
    } catch (error) {
        console.error('Date parsing error:', error, inputDate);
        return { valid: false, date: null, error: 'Error parsing date' };
    }
};

// Helper function to determine if a line should be locked from editing
const isLineLocked = (line) => {
    // A line is locked if it has a non-zero paid_amount, meaning it's been partially or fully paid.
    // Inventory lines are handled separately in the UI to allow GST editing.
    return (typeof line.paid_amount === 'number' && line.paid_amount !== 0);
};

export default function SupplierTxPage() {
    const [supplier, setSupplier] = useState(null);
    const [invoiceLines, setInvoiceLines] = useState([]);
    const [allInvoiceLines, setAllInvoiceLines] = useState([]); // All lines for payment history and old value lookup
    const [conceptualInvoices, setConceptualInvoices] = useState([]);
    const [allConceptualInvoices, setAllConceptualInvoices] = useState([]); // All invoices regardless of date range
    const [payments, setPayments] = useState([]); // Raw payments array
    const [chartOfAccounts, setChartOfAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // New state for saving status
    const [daysBack, setDaysBack] = useState(30);
    const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentActiveTab, setCurrentActiveTab] = useState('invoice-lines');
    const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);

    // New state for LineEditModal
    const [showLineEditModal, setShowLineEditModal] = useState(false);
    const [editingLine, setEditingLine] = useState(null);

    // Pending date range selections (before Apply is clicked)
    const [pendingDaysBack, setPendingDaysBack] = useState(30);
    const [pendingDateRange, setPendingDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

    // Lock management state
    const [currentUser, setCurrentUser] = useState(null);
    const [isLockedByOtherUser, setIsLockedByOtherUser] = useState(false);
    const [lockedByUserName, setLockedByUserName] = useState('');
    const [lockAcquired, setLockAcquired] = useState(false);
    const [checkingLock, setCheckingLock] = useState(true);

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

    // Removed expandedPayments and togglePaymentExpansion for the new payment history display
    const [expandedInvoices, setExpandedInvoices] = useState({});

    const toggleInvoiceExpansion = (invoiceKey) => {
        setExpandedInvoices(prev => ({
            ...prev,
            [invoiceKey]: !prev[invoiceKey]
        }));
    };

    // State to track currently focused/selected line for keyboard shortcuts
    const [selectedLineId, setSelectedLineId] = useState(null);

    // paymentDetails useMemo removed as the new payment history tab iterates directly over the `payments` state
    // and parses the JSON invoice_number directly.

    // Filtered invoice lines based on search term
    const filteredInvoiceLines = useMemo(() => {
        if (!searchTerm.trim()) return invoiceLines;

        const search = searchTerm.toLowerCase();
        return invoiceLines.filter(line =>
            line.invoice_number?.toLowerCase().includes(search) ||
            line.description?.toLowerCase().includes(search) ||
            String(line.charge).toLowerCase().includes(search) ||
            String(line.gst).toLowerCase().includes(search) ||
            String(line.line_total).toLowerCase().includes(search)
        );
    }, [invoiceLines, searchTerm]);

    const ensureEmptyLine = useCallback((lines, defaultGlAccount) => {
        const lastLine = lines[lines.length - 1];
        const isLastLineMeaningful = lastLine && (
            (lastLine.invoice_number && lastLine.invoice_number !== '') ||
            (lastLine.description && lastLine.description !== '') ||
            (typeof lastLine.charge === 'number' && lastLine.charge !== 0) ||
            (typeof lastLine.gst === 'number' && lastLine.gst !== 0) ||
            (lastLine.charge === 'Error' || lastLine.gst === 'Error' || lastLine.line_total === 'Error')
        );

        if (!lastLine || isLastLineMeaningful) {
            const today = format(new Date(), 'yyyy-MM-dd');
            return [...lines, {
                id: `temp_${Date.now()}`,
                invoice_number: '',
                invoice_date: today,
                description: '',
                charge: 0,
                gst: 0,
                line_total: 0,
                gl_account: defaultGlAccount || '',
                isNew: true,
                inventory: false,
                gst_override: false,
                paid_amount: 0, // Initialize paid_amount for new lines
                dateError: null // New state for date validation errors
            }];
        }
        return lines;
    }, []);

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

    const acquireLock = useCallback(async (userToLock) => {
        if (!supplierId || !userToLock) return false;

        try {
            const supplierData = await retryWithBackoff(() => Supplier.get(supplierId));

            if (supplierData.LockedByUser && supplierData.LockedByUser !== userToLock.email) {
                setIsLockedByOtherUser(true);
                setLockedByUserName(supplierData.LockedByUser);
                return false;
            }

            await retryWithBackoff(() => Supplier.update(supplierId, { LockedByUser: userToLock.email }));

            setLockAcquired(true);
            return true;
        } catch (error) {
            console.error('Error acquiring lock:', error);
            return false;
        }
    }, [supplierId, retryWithBackoff]);

    const releaseLock = useCallback(async (userToUnlock) => {
        if (!supplierId || !userToUnlock) return;

        try {
            const currentSupplierData = await retryWithBackoff(() => Supplier.get(supplierId));
            if (currentSupplierData.LockedByUser === userToUnlock.email) {
                await retryWithBackoff(() => Supplier.update(supplierId, { LockedByUser: '' }));
            }
        } catch (error) {
            console.error('Error releasing lock:', error);
        }
    }, [supplierId, retryWithBackoff]);

    // Initialize lock check
    useEffect(() => {
        let userForCleanup = null;
        let acquiredLockSuccessfully = false;

        const initializeLock = async () => {
            if (!supplierId) {
                navigate(createPageUrl('Suppliers'));
                return;
            }

            setCheckingLock(true);
            try {
                const user = await base44.auth.me();
                setCurrentUser(user);
                userForCleanup = user;

                const acquired = await acquireLock(user);
                if (acquired) {
                    acquiredLockSuccessfully = true;
                }
            } catch (error) {
                console.error('Error initializing lock:', error);
            } finally {
                setCheckingLock(false);
            }
        };

        initializeLock();

        return () => {
            if (acquiredLockSuccessfully && supplierId && userForCleanup) {
                releaseLock(userForCleanup);
            }
        };
    }, [supplierId, navigate, acquireLock, releaseLock]);

    // Release lock on window beforeunload event
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            // Check for unsaved changes first
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }

            // Attempt to release lock, without waiting for it
            // beforeunload event cannot be async, so we just fire and forget.
            if (supplierId && currentUser) {
                releaseLock(currentUser);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges, supplierId, currentUser, releaseLock]);

    const loadData = useCallback(async () => {
        if (!supplierId || !lockAcquired) {
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
                chartOfAccounts: chartOfAccountsData,
                payments: paymentsData,
                conceptualInvoices: invoicesInRange,
                invoiceLines: enrichedLines,
                allInvoiceLines: allEnrichedLines,
                currentBalance: totalBalance,
                allConceptualInvoices: allInvoicesData
            } = response.data.data;

            setSupplier(supplierData);
            setChartOfAccounts(chartOfAccountsData);
            setPayments(paymentsData.sort((a,b) => new Date(b.payment_date) - new Date(a.payment_date))); // Sort payments by date descending
            setCurrentBalance(totalBalance);

            // The conceptualInvoices from backend functions already contains the grouped lines
            // Ensure they are correctly formatted and rounded
            const formattedConceptualInvoices = invoicesInRange
                .sort((a, b) => {
                    const dateA = new Date(a.invoice_date);
                    const dateB = new Date(b.invoice_date);
                    if (dateA - dateB !== 0) return dateA - dateB;
                    return (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
                })
                .map(invoice => ({
                    ...invoice,
                    subtotal: Math.round(invoice.subtotal * 100) / 100,
                tax_amount: Math.round(invoice.tax_amount * 100) / 100,
                total_amount: Math.round(invoice.total_amount * 100) / 100,
                amount_paid: Math.round(invoice.amount_paid * 100) / 100,
                balance_due: Math.round(invoice.balance_due * 100) / 100,
                lines: invoice.lines.map(line => ({ // Also format nested lines
                    ...line,
                    charge: typeof line.purchase_amount === 'number' ? Math.round(line.purchase_amount * 100) / 100 : line.purchase_amount,
                    gst: typeof line.gst_amount === 'number' ? Math.round(line.gst_amount * 100) / 100 : line.gst_amount,
                    line_total: typeof line.purchase_amount === 'number' && typeof line.gst_amount === 'number' ? Math.round((line.purchase_amount + line.gst_amount) * 100) / 100 : line.line_total,
                    gst_override: line.gst_override || false
                }))
            }));
            setConceptualInvoices(formattedConceptualInvoices);

            // Use backend's allConceptualInvoices and currentBalance directly
            setAllConceptualInvoices(allInvoicesData || []);
            setCurrentBalance(totalBalance);

            // Apply rounding to all loaded lines to ensure proper GST display
            const roundedLines = enrichedLines
                .sort((a, b) => {
                    const dateA = new Date(a.invoice_date);
                    const dateB = new Date(b.invoice_date);
                    if (dateA - dateB !== 0) return dateA - dateB;
                    return (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true, sensitivity: 'base' });
                })
                .map(line => ({
                    ...line,
                    charge: typeof line.purchase_amount === 'number' ? Math.round(line.purchase_amount * 100) / 100 : line.purchase_amount,
                gst: typeof line.gst_amount === 'number' ? Math.round(line.gst_amount * 100) / 100 : line.gst_amount,
                line_total: typeof line.purchase_amount === 'number' && typeof line.gst_amount === 'number' ? Math.round((line.purchase_amount + line.gst_amount) * 100) / 100 : line.line_total,
                gst_override: line.gst_override || false, // Ensure gst_override is set
                paid_amount: typeof line.paid_amount === 'number' ? Math.round(line.paid_amount * 100) / 100 : 0, // Ensure paid_amount is numeric
                dateError: null // Initialize dateError for loaded lines
            }));

            const roundedAllLines = allEnrichedLines.map(line => ({
                ...line,
                charge: typeof line.purchase_amount === 'number' ? Math.round(line.purchase_amount * 100) / 100 : line.purchase_amount,
                gst: typeof line.gst_amount === 'number' ? Math.round(line.gst_amount * 100) / 100 : line.gst_amount,
                line_total: typeof line.purchase_amount === 'number' && typeof line.gst_amount === 'number' ? Math.round((line.purchase_amount + line.gst_amount) * 100) / 100 : line.line_total,
                gst_override: line.gst_override || false, // Ensure gst_override is set
                paid_amount: typeof line.paid_amount === 'number' ? Math.round(line.paid_amount * 100) / 100 : 0, // Ensure paid_amount is numeric
                dateError: null // Initialize dateError for loaded lines
            }));

            setInvoiceLines(ensureEmptyLine(roundedLines, supplierData?.default_gl_account));
            setAllInvoiceLines(roundedAllLines);

        } catch (error) {
            console.error('Error loading supplier data:', error);
            if (error.response?.status === 429) {
                alert('The system is currently experiencing high load. Please wait a moment and try refreshing the page.');
            } else {
                alert('Failed to load data. Please try again.');
            }
        } finally {
            setLoading(false);
            setHasUnsavedChanges(false);
        }
    }, [supplierId, dateRange, ensureEmptyLine, lockAcquired]);

    useEffect(() => {
        if (!lockAcquired || isLockedByOtherUser || !supplierId) {
            return;
        }

        loadData();
    }, [lockAcquired, isLockedByOtherUser, supplierId, dateRange, loadData]);

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

    const handleLineChange = (lineId, field, value) => {
        setInvoiceLines(prev => {
            const updatedLines = prev.map(line => {
                if (line.id !== lineId) return line;
                if (isLineLocked(line)) return line; // Prevent changes to locked lines

                // For inventory lines, only allow GST-related changes
                if (line.inventory) {
                    if (field !== 'gst' && field !== 'gst_override') {
                        return line;
                    }
                    if (field === 'gst' && !line.gst_override) {
                        return line;
                    }
                }

                const updatedLine = { ...line };

                // Handle date field - store raw value during typing, clear error
                if (field === 'invoice_date') {
                    updatedLine[field] = value; // Store raw input
                    updatedLine.dateError = null; // Clear any previous error
                    return updatedLine;
                }

                if (updatedLine.gst_override) {
                    // Manual GST mode - charge and gst are independent, line_total is their sum
                    updatedLine[field] = value; // Store the raw input for charge/gst
                    
                    // Always recalculate line_total based on current charge and gst values
                    const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
                    const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);
                    
                    if (!isNaN(numericCharge) && !isNaN(numericGst)) {
                        updatedLine.line_total = Math.round((numericCharge + numericGst) * 100) / 100;
                    } else if (updatedLine.charge === '' || updatedLine.gst === '') {
                        updatedLine.line_total = 0; // If either is empty, line total can be 0
                    }
                    else {
                        updatedLine.line_total = 'Error';
                    }
                } else {
                    // Automatic GST calculation mode (existing logic)
                    if (field === 'charge') {
                        updatedLine.charge = value; // Store the raw input
                        const numericCharge = parseFloat(value);

                        if (!isNaN(numericCharge)) {
                            const calculatedGst = numericCharge * GST_RATE;
                            updatedLine.gst = Math.round(calculatedGst * 100) / 100;
                            updatedLine.line_total = Math.round((numericCharge + updatedLine.gst) * 100) / 100;
                        } else if (value === '' || value === '-') { // Empty or just minus sign, treat as zero conceptually
                            updatedLine.gst = 0;
                            updatedLine.line_total = 0;
                        } else { // Non-numeric, non-empty/non-minus input
                            updatedLine.gst = 'Error';
                            updatedLine.line_total = 'Error';
                        }
                    } else if (field === 'gst') {
                        updatedLine.gst = value; // Store the raw input
                        const numericGst = parseFloat(value);
                        // Ensure charge is treated as numeric for calculation, if it's currently a valid number
                        const currentNumericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);

                        if (!isNaN(numericGst) && !isNaN(currentNumericCharge)) {
                            updatedLine.line_total = Math.round((currentNumericCharge + numericGst) * 100) / 100;
                        } else if (value === '' || value === '-') { // Empty or just minus sign
                            // If GST is empty/minus, line_total is just charge (if numeric)
                            updatedLine.line_total = !isNaN(currentNumericCharge) ? Math.round(currentNumericCharge * 100) / 100 : 'Error';
                        } else { // Non-numeric, non-empty/non-minus input for GST, or charge is also an error
                            updatedLine.line_total = 'Error';
                        }
                    } else if (field === 'line_total') {
                        updatedLine.line_total = value; // Store the raw input
                        const numericTotal = parseFloat(value);

                        if (!isNaN(numericTotal)) {
                            const calculatedCharge = numericTotal / (1 + GST_RATE);
                            updatedLine.charge = Math.round(calculatedCharge * 100) / 100;
                            updatedLine.gst = Math.round((numericTotal - updatedLine.charge) * 100) / 100;
                        } else if (value === '' || value === '-') { // Empty or just minus sign
                            updatedLine.charge = 0;
                            updatedLine.gst = 0;
                        } else { // Non-numeric, non-empty/non-minus input
                            updatedLine.charge = 'Error';
                            updatedLine.gst = 'Error';
                        }
                    } else {
                        updatedLine[field] = value;
                    }
                }

                return updatedLine;
            });

            return ensureEmptyLine(updatedLines, supplier?.default_gl_account);
        });

        setHasUnsavedChanges(true);
    };

    const handleDateBlur = async (lineId, value) => {
        const line = invoiceLines.find(l => l.id === lineId);
        if (isLineLocked(line) || line.inventory) return;

        const parseResult = parseAndValidateDateInput(value);
        
        if (!parseResult.valid) {
            setInvoiceLines(prev => prev.map(l => {
                if (l.id !== lineId) return l;
                return {
                    ...l,
                    dateError: parseResult.error
                };
            }));
            alert(`Invalid date for invoice line "${line.description || line.invoice_number || 'New Line'}": ${parseResult.error}`);
            return;
        }
        
        // Check fiscal period
        const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
        
        if (!fiscalCheck.isValid) {
            setInvoiceLines(prev => prev.map(l => {
                if (l.id !== lineId) return l;
                return {
                    ...l,
                    dateError: fiscalCheck.message
                };
            }));
            alert(`Fiscal Period Error for invoice line "${line.description || line.invoice_number || 'New Line'}": ${fiscalCheck.message}`);
            return;
        }
        
        // Date is valid and in open fiscal period
        setInvoiceLines(prev => prev.map(l => {
            if (l.id !== lineId) return l;
            return {
                ...l,
                invoice_date: parseResult.date,
                dateError: null
            };
        }));
        setHasUnsavedChanges(true); // Blurring and parsing is also a change
    };

    const handleValueBlur = (lineId, field, value) => {
        const line = invoiceLines.find(l => l.id === lineId);
        if (isLineLocked(line)) return; // Prevent blur actions on locked lines
        if (line.inventory && field !== 'gst') return; // Only allow GST blur for inventory lines

        if (field === 'charge' || field === 'gst' || field === 'line_total') {
            const numValue = parseFloat(value);
            // Only proceed if the value is a valid number after parsing
            if (!isNaN(numValue)) {
                const roundedValue = Math.round(numValue * 100) / 100;

                setInvoiceLines(prev => prev.map(line => {
                    if (line.id !== lineId) return line;

                    const updatedLine = { ...line };

                    if (updatedLine.gst_override) {
                        // Manual GST mode - only round the value, don't recalculate (except for line_total sum)
                        if (field === 'charge') {
                            updatedLine.charge = roundedValue;
                        } else if (field === 'gst') {
                            updatedLine.gst = roundedValue;
                        } else if (field === 'line_total') {
                            // In override mode, line_total is always derived.
                            // If user tries to manually blur line_total, it will be immediately recalculated.
                            // The field itself is disabled for input, but this handles potential edge cases.
                        }

                        // Recalculate line_total as sum after potential field change
                        const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
                        const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);

                        if (!isNaN(numericCharge) && !isNaN(numericGst)) {
                            updatedLine.line_total = Math.round((numericCharge + numericGst) * 100) / 100;
                        } else if (updatedLine.charge === '' || updatedLine.gst === '') {
                             updatedLine.line_total = 0;
                        } else {
                            updatedLine.line_total = 'Error';
                        }
                    } else {
                        // Automatic GST calculation mode (existing logic)
                        if (field === 'charge') {
                            updatedLine.charge = roundedValue;
                            const calculatedGst = roundedValue * GST_RATE;
                            updatedLine.gst = Math.round(calculatedGst * 100) / 100;
                            updatedLine.line_total = Math.round((roundedValue + updatedLine.gst) * 100) / 100;
                        } else if (field === 'gst') {
                            updatedLine.gst = roundedValue;
                            // Use the current numeric value of charge for recalculation if it's valid
                            const currentNumericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
                            if (!isNaN(currentNumericCharge)) {
                                updatedLine.line_total = Math.round((currentNumericCharge + roundedValue) * 100) / 100;
                            } else {
                                updatedLine.line_total = 'Error';
                            }
                        } else if (field === 'line_total') {
                            updatedLine.line_total = roundedValue;
                            const calculatedCharge = roundedValue / (1 + GST_RATE);
                            updatedLine.charge = Math.round(calculatedCharge * 100) / 100;
                            updatedLine.gst = Math.round((roundedValue - updatedLine.charge) * 100) / 100;
                        }
                    }

                    return updatedLine;
                }));
            }
            // If numValue is NaN, do nothing on blur.
            // The input field will retain its current (invalid) string or 'Error' state.
        }
    };

    const handleToggleGstOverride = (lineId) => {
        setInvoiceLines(prev => prev.map(line => {
            if (line.id !== lineId) return line;
            if (isLineLocked(line)) return line; // Prevent toggling GST override on locked lines

            const updatedLine = { ...line };
            updatedLine.gst_override = !updatedLine.gst_override;

            // If toggling OFF (back to automatic), recalculate GST from charge
            if (!updatedLine.gst_override) {
                const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);

                if (!isNaN(numericCharge)) {
                    const calculatedGst = numericCharge * GST_RATE;
                    updatedLine.gst = Math.round(calculatedGst * 100) / 100;
                    updatedLine.line_total = Math.round((numericCharge + updatedLine.gst) * 100) / 100;
                } else {
                    // If charge is not numeric, reset gst and line_total
                    updatedLine.gst = 0;
                    updatedLine.line_total = 0;
                }
            } else {
                // If toggling ON (to manual override), keep current values.
                // Re-sum line_total in case it was off due to direct input
                const numericCharge = typeof updatedLine.charge === 'number' ? updatedLine.charge : parseFloat(updatedLine.charge);
                const numericGst = typeof updatedLine.gst === 'number' ? updatedLine.gst : parseFloat(updatedLine.gst);
                if (!isNaN(numericCharge) && !isNaN(numericGst)) {
                    updatedLine.line_total = Math.round((numericCharge + numericGst) * 100) / 100;
                } else {
                    updatedLine.line_total = 'Error';
                }
            }

            return updatedLine;
        }));

        setHasUnsavedChanges(true);
    };

    const handleSaveAll = useCallback(async () => {
        if (isLockedByOtherUser || !lockAcquired) {
            alert('Cannot save: Supplier is locked by another user or you do not have the lock.');
            return false; // Indicate save failed
        }

        // Check for date errors before saving
        const linesWithDateErrors = invoiceLines.filter(line => line.dateError);
        if (linesWithDateErrors.length > 0) {
            alert(`Cannot save: Please correct all invalid dates before saving. Found ${linesWithDateErrors.length} errors.`);
            return false; // Indicate save failed
        }

        setIsSaving(true);
        try {
            const linesToSave = invoiceLines.filter(line => {
                // Only consider saving lines that are new OR existing lines that might have content
                // Skip empty new lines
                if ((line.id.startsWith('temp_') || line.isNew) && !line.invoice_number && !line.description && (line.charge === 0 || line.charge === '') && (line.gst === 0 || line.gst === '')) return false;
                
                // Ensure existing lines are included if they have content or were simply fetched
                const hasContent = line.invoice_number || line.description ||
                                   (typeof line.charge === 'number' && line.charge !== 0) ||
                                   (typeof line.gst === 'number' && line.gst !== 0) ||
                                   line.charge === 'Error' || line.gst === 'Error' || line.line_total === 'Error';
                return hasContent || (line.id && !line.id.startsWith('temp_'));
            });

            // PHASE 2: Validate numeric fields before saving
            const invalidNumericFields = [];
            linesToSave.forEach((line, index) => {
                // Skip validation for lines that are locked from editing amounts
                if (isLineLocked(line)) {
                    return;
                }

                // Check if any numeric field contains 'Error'
                if (line.charge === 'Error') {
                    invalidNumericFields.push({
                        lineNumber: index + 1,
                        field: 'Charge',
                        invoice: line.invoice_number || 'New Line'
                    });
                }
                if (line.gst === 'Error') {
                    invalidNumericFields.push({
                        lineNumber: index + 1,
                        field: 'GST',
                        invoice: line.invoice_number || 'New Line'
                    });
                }
                if (line.line_total === 'Error') {
                    invalidNumericFields.push({
                        lineNumber: index + 1,
                        field: 'Line Total',
                        invoice: line.invoice_number || 'New Line'
                    });
                }

                // Check if numeric fields are actually numeric (and not empty strings that would become NaN)
                // Only if they aren't already marked 'Error'
                if (line.charge !== 'Error') {
                    const chargeValue = line.charge === '' ? 0 : parseFloat(line.charge);
                    if (isNaN(chargeValue) && line.charge !== '') {
                        invalidNumericFields.push({
                            lineNumber: index + 1,
                            field: 'Charge',
                            value: line.charge,
                            invoice: line.invoice_number || 'New Line'
                        });
                    }
                }
                if (line.gst !== 'Error') {
                    const gstValue = line.gst === '' ? 0 : parseFloat(line.gst);
                    if (isNaN(gstValue) && line.gst !== '') {
                        invalidNumericFields.push({
                            lineNumber: index + 1,
                            field: 'GST',
                            value: line.gst,
                            invoice: line.invoice_number || 'New Line'
                        });
                    }
                }
                if (line.line_total !== 'Error') {
                    const lineTotalValue = line.line_total === '' ? 0 : parseFloat(line.line_total);
                    if (isNaN(lineTotalValue) && line.line_total !== '') {
                        invalidNumericFields.push({
                            lineNumber: index + 1,
                            field: 'Line Total',
                            value: line.line_total,
                            invoice: line.invoice_number || 'New Line'
                        });
                    }
                }
            });

            // If there are invalid lines, show error and stop
            if (invalidNumericFields.length > 0) {
                const errorMessage = invalidNumericFields.length === 1
                    ? `Invalid value in ${invalidNumericFields[0].field} field for invoice "${invalidNumericFields[0].invoice}".\n\nPlease correct the value before saving.`
                    : `Found ${invalidNumericFields.length} invalid numeric values:\n\n` +
                      invalidNumericFields.map(line => `• Invoice "${line.invoice}" - ${line.field}`).join('\n') +
                      '\n\nPlease correct these values before saving.';

                alert(errorMessage);
                setIsSaving(false);
                return false; // Indicate save failed
            }

            // Existing validation for GL accounts
            const invalidGLLines = linesToSave.filter(line =>
                (line.invoice_number || line.description || (typeof line.charge === 'number' && line.charge !== 0) || (typeof line.gst === 'number' && line.gst !== 0) || line.charge !== 0 || line.gst !== 0) && // Check if any meaningful content is present
                !line.gl_account?.trim() && !line.inventory && !isLineLocked(line) // Do not validate GL for inventory lines or lines locked by payment
            );

            if (invalidGLLines.length > 0) {
                alert('Please select a GL Account for all new or modified invoice lines before saving.');
                setIsSaving(false);
                return false; // Indicate save failed
            }

            let anyExistingLineAmountChanged = false; // Flag to track if existing line amounts were changed

            // Process saves
            for (const line of linesToSave) {
                // Skip completely empty new lines
                if ((line.id.startsWith('temp_') || line.isNew) && !line.invoice_number && !line.description && (line.charge === 0 || line.charge === '') && (line.gst === 0 || line.gst === '')) continue;
                
                // If line is locked by payment, it should not be possible to change amounts or GL.
                // Other fields (invoice number, description, date) *could* theoretically be changed,
                // but for simplicity and robustness, if a line is locked, we assume it's entirely read-only through this interface.
                // The `handleLineChange` already prevents this, so this check primarily protects the backend.
                if (isLineLocked(line) && !line.isNew && !line.id.startsWith('temp_')) {
                    // Only update non-amount/GL fields if specifically requested, or skip if only amounts are different.
                    // For now, if line is locked, its amounts should not be passed as changed.
                    // The UI disables these fields, so current `line.charge` etc. will be original values.
                }

                const lineData = {
                    supplier_id: supplierId,
                    invoice_number: line.invoice_number,
                    invoice_date: line.invoice_date, // This should already be validated ISO format
                    description: line.description,
                    purchase_amount: parseFloat(line.charge) || 0, // Should be safe now after validation
                    gst_amount: parseFloat(line.gst) || 0,         // Should be safe now after validation
                    gl_account: line.gl_account,
                    gst_override: line.gst_override
                };

                let savedLine = null;
                let glAction = '';
                let oldValues = null;

                if (line.id.startsWith('temp_') || line.isNew) {
                    savedLine = await SupplierInvoiceLine.create(lineData);
                    glAction = 'create';
                } else {
                    // Check if existing line's amounts have changed
                    const existingLineOriginal = allInvoiceLines.find(l => l.id === line.id);
                    if (existingLineOriginal) {
                        const currentPurchaseAmount = parseFloat(line.charge) || 0;
                        const currentGstAmount = parseFloat(line.gst) || 0;
                        const oldPurchaseAmount = existingLineOriginal.purchase_amount || 0;
                        const oldGstAmount = existingLineOriginal.gst_amount || 0;

                        if (currentPurchaseAmount !== oldPurchaseAmount || currentGstAmount !== oldGstAmount) {
                            anyExistingLineAmountChanged = true;
                        }
                    }

                    oldValues = {
                        id: existingLineOriginal.id,
                        supplier_id: existingLineOriginal.supplier_id,
                        invoice_number: existingLineOriginal.invoice_number,
                        invoice_date: existingLineOriginal.invoice_date,
                        description: existingLineOriginal.description,
                        purchase_amount: existingLineOriginal.purchase_amount,
                        gst_amount: existingLineOriginal.gst_amount,
                        gl_account: existingLineOriginal.gl_account,
                        gst_override: existingLineOriginal.gst_override
                    };
                    await SupplierInvoiceLine.update(line.id, lineData);
                    savedLine = { ...lineData, id: line.id };
                    glAction = 'update';
                }

                try {
                    const glResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                        supplierInvoiceLine: savedLine,
                        action: glAction,
                        oldValues: oldValues
                    });

                    if (!glResponse.data.success) {
                        console.error('GL posting failed:', glResponse.data);
                        alert(`Warning: GL transactions may not have been posted correctly for line: ${line.description}`);
                    }
                } catch (glError) {
                    console.error('Error posting GL transactions:', glError);
                    alert(`Warning: Failed to post GL transactions for line: ${line.description}`);
                }

                // REMOVED: await new Promise(resolve => setTimeout(resolve, 100));
            }

            // --- Start of payment recalculation logic after line saves ---
            if (anyExistingLineAmountChanged) {
                console.log("Existing invoice line amounts changed. Reallocating payments proportionally across lines.");
                const paymentsToProcess = await SupplierPayment.filter({ supplier_id: supplierId });

                for (const payment of paymentsToProcess) {
                    let appliedInvoices = [];
                    try {
                        const parsed = JSON.parse(payment.invoice_number || '[]');
                        if (Array.isArray(parsed)) {
                            appliedInvoices = parsed;
                        } else if (payment.invoice_number) { // If it parsed to a string or some non-array type, treat as old format
                            appliedInvoices = [{
                                invoice_number: payment.invoice_number,
                                amount_applied: payment.amount
                            }];
                        }
                    } catch (error) {
                        // JSON.parse failed, assume it's a plain string that was not valid JSON
                        if (payment.invoice_number && typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
                            appliedInvoices = [{
                                invoice_number: payment.invoice_number,
                                amount_applied: payment.amount
                            }];
                        } else {
                            appliedInvoices = [];
                        }
                    }

                    for (const appliedDetail of appliedInvoices) {
                        if (appliedDetail.invoice_number === "On Account") {
                            continue;
                        }

                        // Fetch the latest lines for this invoice after all previous line updates are committed
                        const invoiceLinesForPayment = await SupplierInvoiceLine.filter({
                            supplier_id: supplierId,
                            invoice_number: appliedDetail.invoice_number
                        });

                        if (invoiceLinesForPayment && invoiceLinesForPayment.length > 0) {
                            const invoiceTotal = invoiceLinesForPayment.reduce((sum, line) => {
                                const lineTotal = (line.purchase_amount || 0) + (line.gst_amount || 0);
                                return sum + lineTotal;
                            }, 0);

                            for (const line of invoiceLinesForPayment) {
                                const lineTotal = (line.purchase_amount || 0) + (line.gst_amount || 0);
                                const proportion = invoiceTotal !== 0 ? lineTotal / invoiceTotal : 0;
                                const newPaidAmount = appliedDetail.amount_applied * proportion;

                                await SupplierInvoiceLine.update(line.id, {
                                    paid_amount: Math.round(newPaidAmount * 100) / 100
                                });
                            }
                        }
                    }
                }
            }
            // --- End of payment recalculation logic ---


            // Reload data after save
            // The existing `loadData()` call will refresh all related states.
            await loadData();
            alert('Changes saved successfully!');
            return true; // Indicate save successful


        } catch (error) {
            console.error('Error saving changes:', error);
            alert('Failed to save changes. Please try again.');
            return false; // Indicate save failed
        } finally {
            setIsSaving(false);
        }
    }, [isLockedByOtherUser, lockAcquired, invoiceLines, allInvoiceLines, supplierId, loadData]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = async (e) => {
            // Ctrl + $ or Ctrl + 4 - Open payment modal
            if (e.ctrlKey && (e.key === '$' || e.key === '4')) {
                e.preventDefault();
                if (!isLockedByOtherUser && lockAcquired) {
                    if (hasUnsavedChanges) {
                        const userChoice = window.confirm(
                            'You have unsaved changes. Would you like to save them before making a payment?\n\n' +
                            'Click "OK" to save and continue, or "Cancel" to continue without saving.'
                        );
                        
                        if (userChoice) {
                            const saveSuccessful = await handleSaveAll();
                            if (saveSuccessful) {
                                setShowPaymentModal(true);
                            }
                        } else {
                            setShowPaymentModal(true);
                        }
                    } else {
                        setShowPaymentModal(true);
                    }
                }
            }

            // Ctrl + X - Toggle GST override on selected line
            if (e.ctrlKey && e.key === 'x') {
                e.preventDefault();
                if (selectedLineId && !isLockedByOtherUser && lockAcquired) {
                    const line = invoiceLines.find(l => l.id === selectedLineId);
                    if (line && !isLineLocked(line)) {
                        handleToggleGstOverride(selectedLineId);
                    }
                }
            }

            // Ctrl + S - Save changes
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (hasUnsavedChanges && !isLockedByOtherUser && lockAcquired) {
                    await handleSaveAll(); // Await handleSaveAll for better user experience
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLineId, invoiceLines, isLockedByOtherUser, lockAcquired, hasUnsavedChanges, handleToggleGstOverride, handleSaveAll]);

    // New: handlePaymentComplete function to reload data after payment
    const handlePaymentComplete = useCallback(() => {
        setShowPaymentModal(false);
        loadData();
    }, [loadData]);

    const handleEditLineClick = (line) => {
        setEditingLine(line);
        setShowLineEditModal(true);
    };

    // New: handleLineUpdate function for LineEditModal to save changes
    const handleLineUpdate = useCallback(async (updatedLineData) => {
        if (!updatedLineData || !updatedLineData.id) return;
        if (isLineLocked(updatedLineData)) { // Prevent update if line is locked
            alert('This line cannot be updated because it has a payment applied or is an inventory line.');
            return;
        }

        // New validation for 'Error' states from LineEditModal
        if (updatedLineData.charge === 'Error' || updatedLineData.gst === 'Error' || updatedLineData.line_total === 'Error') {
            alert('Please correct the invalid numeric inputs in the line editor before saving.');
            return; // Do not proceed with saving
        }

        // Check date validity from modal
        const parseResult = parseAndValidateDateInput(updatedLineData.invoice_date);
        if (!parseResult.valid) {
            alert(`Invalid date in line editor: ${parseResult.error}`);
            return;
        }
        const fiscalCheck = await checkFiscalPeriodStatus(parseResult.date);
        if (!fiscalCheck.isValid) {
            alert(`Fiscal Period Error in line editor: ${fiscalCheck.message}`);
            return;
        }

        setLoading(true);
        try {
            const isNew = updatedLineData.id.startsWith('temp_');
            const lineDataForAPI = {
                supplier_id: supplierId,
                invoice_number: updatedLineData.invoice_number,
                invoice_date: parseResult.date, // Use the validated ISO date
                description: updatedLineData.description,
                purchase_amount: parseFloat(updatedLineData.charge),
                gst_amount: parseFloat(updatedLineData.gst),
                gl_account: updatedLineData.gl_account,
                gst_override: updatedLineData.gst_override // Pass gst_override
            };

            let savedLine = null;
            let glAction = '';
            let oldValues = null;

            if (isNew) {
                savedLine = await SupplierInvoiceLine.create(lineDataForAPI);
                glAction = 'create';
            } else {
                const existingLine = allInvoiceLines.find(l => l.id === updatedLineData.id);
                if (existingLine) {
                    oldValues = {
                        id: existingLine.id,
                        supplier_id: existingLine.supplier_id,
                        invoice_number: existingLine.invoice_number,
                        invoice_date: existingLine.invoice_date,
                        description: existingLine.description,
                        purchase_amount: existingLine.purchase_amount,
                        gst_amount: existingLine.gst_amount,
                        gl_account: existingLine.gl_account,
                        gst_override: existingLine.gst_override
                    };
                }
                await SupplierInvoiceLine.update(updatedLineData.id, lineDataForAPI);
                savedLine = { ...lineDataForAPI, id: updatedLineData.id };
                glAction = 'update';
            }

            try {
                const glResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                    supplierInvoiceLine: savedLine,
                    action: glAction,
                    oldValues: oldValues
                });

                if (!glResponse.data.success) {
                    console.error('GL posting failed:', glResponse.data);
                    alert(`Warning: GL transactions may not have been posted correctly for line: ${updatedLineData.description}`);
                }
            } catch (glError) {
                console.error('Error posting GL transactions:', glError);
                alert(`Warning: Failed to post GL transactions for line: ${updatedLineData.description}`);
            }

            loadData();
            setShowLineEditModal(false);
            setEditingLine(null);
        } catch (error) {
                console.error('Error updating invoice line:', error);
            alert('Failed to update invoice line. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [supplierId, allInvoiceLines, loadData]);


    const handleTabChange = async (newTab) => {
        if (currentActiveTab === 'invoice-lines' && newTab !== 'invoice-lines' && hasUnsavedChanges) {
            const userChoice = window.confirm(
                'You have unsaved changes. Would you like to save them before switching tabs?\n\n' +
                'Click "OK" to save and continue, or "Cancel" to stay on this tab.'
            );

            if (userChoice) {
                const saveSuccessful = await handleSaveAll();
                // Check if saving was successful by checking the return value
                if (saveSuccessful) { 
                     setCurrentActiveTab(newTab);
                }
            }
        } else {
            setCurrentActiveTab(newTab);
        }
    };

    const handleDeleteLine = async (lineId) => {
        const line = invoiceLines.find(l => l.id === lineId);
        if (!line) return;

        const locked = isLineLocked(line);
        if (locked || line.inventory) {
            alert('This line cannot be deleted because it has a payment applied or is an inventory line.');
            return;
        }

        if (line.isNew || line.id.startsWith('temp_')) {
            setInvoiceLines(prev => ensureEmptyLine(prev.filter(l => l.id !== lineId), supplier?.default_gl_account));
            setHasUnsavedChanges(true);
        } else {
            if (window.confirm("Are you sure you want to permanently delete this line? This cannot be undone.")) {
                setLoading(true);
                try {
                    const lineToDelete = {
                        id: line.id,
                        supplier_id: supplierId,
                        invoice_number: line.invoice_number,
                        invoice_date: line.invoice_date,
                        description: line.description,
                        purchase_amount: parseFloat(line.charge),
                        gst_amount: parseFloat(line.gst),
                        gl_account: line.gl_account,
                        gst_override: line.gst_override
                    };

                    await SupplierInvoiceLine.delete(line.id);

                    try {
                        const glResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                            supplierInvoiceLine: lineToDelete,
                            action: 'delete'
                        });

                        if (!glResponse.data.success) {
                            console.error('GL reversal failed:', glResponse.data);
                            alert('Warning: GL transactions may not have been reversed correctly.');
                        }
                    } catch (glError) {
                        console.error('Error reversing GL transactions:', glError);
                        alert('Warning: Failed to reverse GL transactions for deleted line.');
                    }

                    // Reload all data after successful delete and GL reversal
                    await loadData();
                } catch(error) {
                    console.error("Error deleting line:", error);
                    alert("Failed to delete line.");
                    setLoading(false);
                }
            }
        }
    };

    const handleAddLineAbove = (lineId) => {
        setInvoiceLines(prev => {
            const lineIndex = prev.findIndex(l => l.id === lineId);
            if (lineIndex === -1) return prev;

            const newLine = {
                id: `temp_${Date.now()}`,
                supplier_id: supplierId,
                invoice_number: '',
                invoice_date: format(new Date(), 'yyyy-MM-dd'),
                description: '',
                charge: 0,
                gst: 0,
                line_total: 0,
                gl_account: supplier?.default_gl_account || '',
                isNew: true,
                inventory: false,
                gst_override: false,
                paid_amount: 0,
                dateError: null
            };

            const newLines = [...prev];
            newLines.splice(lineIndex, 0, newLine);
            return newLines;
        });
        setHasUnsavedChanges(true);
    };

    const handleAddLineBelow = (lineId) => {
        setInvoiceLines(prev => {
            const lineIndex = prev.findIndex(l => l.id === lineId);
            if (lineIndex === -1) return prev;

            const newLine = {
                id: `temp_${Date.now()}`,
                supplier_id: supplierId,
                invoice_number: '',
                invoice_date: format(new Date(), 'yyyy-MM-dd'),
                description: '',
                charge: 0,
                gst: 0,
                line_total: 0,
                gl_account: supplier?.default_gl_account || '',
                isNew: true,
                inventory: false,
                gst_override: false,
                paid_amount: 0,
                dateError: null
            };

            const newLines = [...prev];
            newLines.splice(lineIndex + 1, 0, newLine);
            return newLines;
        });
        setHasUnsavedChanges(true);
    };

    const handleBackNavigation = useCallback(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const fromPage = urlParams.get('from');
        const targetPage = fromPage === 'apsummary' ? 'APSummary' : 'Suppliers';
        
        if (hasUnsavedChanges) {
            const message = `You have unsaved changes. Would you like to save them before returning to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}?\n\n` +
                           `Click "OK" to save changes and return to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}.\n` +
                           'Click "Cancel" to stay on this page, or click "Cancel" again to discard.';

            const userWantsToSave = window.confirm(message);

            if (userWantsToSave) {
                // Perform the save operation
                const saveSuccessful = await handleSaveAll();
                // Check if saving was successful (no errors prevented it)
                if (saveSuccessful) { 
                    if (lockAcquired && supplierId && currentUser) {
                        await releaseLock(currentUser);
                    }
                    navigate(createPageUrl(targetPage));
                }
            } else {
                const discardMessage = `Do you want to discard your changes and return to ${fromPage === 'apsummary' ? 'AP Summary' : 'Suppliers'}?\n\n` +
                                      'Click "OK" to discard changes and leave.\n' +
                                      'Click "Cancel" to stay on this page.';

                const userWantsToDiscard = window.confirm(discardMessage);

                if (userWantsToDiscard) {
                    if (lockAcquired && supplierId && currentUser) {
                        await releaseLock(currentUser);
                    }
                    navigate(createPageUrl(targetPage));
                }
            }
        } else {
            if (lockAcquired && supplierId && currentUser) {
                await releaseLock(currentUser);
            }
            navigate(createPageUrl(targetPage));
        }
    }, [hasUnsavedChanges, supplierId, lockAcquired, currentUser, releaseLock, navigate, handleSaveAll]);

    const handleEditSupplier = () => {
        setShowEditSupplierModal(true);
    };

    const handleSupplierUpdate = async (updatedSupplierData) => {
        try {
            if (!supplier?.id) {
                console.error("No supplier ID found for update.");
                alert('Failed to update supplier: Missing supplier ID.');
                return;
            }
            await Supplier.update(supplier.id, updatedSupplierData);
            setShowEditSupplierModal(false);
            const refreshedSupplier = await Supplier.get(supplier.id);
            setSupplier(refreshedSupplier);
            alert('Supplier updated successfully');
        } catch (error) {
            console.error('Error updating supplier:', error);
            alert('Failed to update supplier. Please try again.');
        }
    };

    const handlePrintCheque = useCallback((chequeReference) => {
        const targetUrl = `${createPageUrl('ChequeWriter')}?chequeReference=${encodeURIComponent(chequeReference)}`;
        window.location.href = targetUrl; // Changed from window.open to window.location.href
    }, []);

    const getAccountName = useCallback((accountId) => {
        // Assuming accountId is the 'id' of the chart of account entry
        const account = chartOfAccounts.find(acc => acc.id === accountId);
        return account ? `${account.account_number} - ${account.account_name}` : 'N/A';
    }, [chartOfAccounts]);

    const dateRangeTotal = invoiceLines
        .filter(l => l.invoice_number && typeof l.line_total === 'number')
        .reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0);

    const handleScrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleScrollToBottom = () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    };

    if (checkingLock) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-lg font-semibold">Checking supplier availability.....</div>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div>
                </div>
            </div>
        );
    }

    if (isLockedByOtherUser) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6">
                        <div className="text-center space-y-4">
                            <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-yellow-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Supplier Currently Being Edited</h2>
                                <p className="text-gray-600">
                                    This supplier is currently being edited by <span className="font-semibold">{lockedByUserName}</span>.
                                </p>
                                <p className="text-gray-500 text-sm mt-2">
                                    You can view it in read-only mode or try again later.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 pt-4">
                                <Button
                                    onClick={() => navigate(createPageUrl(`SupplierTxView?id=${supplierId}`))}
                                    className="w-full"
                                    variant="outline"
                                >
                                    View Read-Only
                                </Button>
                                <Button
                                    onClick={() => window.location.reload()}
                                    className="w-full"
                                    variant="outline"
                                >
                                    Try Again
                                </Button>
                                <Button
                                    onClick={() => navigate(createPageUrl('Suppliers'))}
                                    className="w-full"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading || isSaving) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-lg font-semibold">{isSaving ? 'Saving changes...' : 'Loading supplier data.....'}</div>
                    <div className="text-gray-500 mt-2">This may take a moment</div>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="p-6 min-h-screen">
                <div className="max-w-screen-xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" onClick={handleBackNavigation}>
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <h1 className="text-2xl font-bold text-slate-900">{supplier?.name} - Transactions</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                onClick={handleEditSupplier}
                                disabled={isLockedByOtherUser || !lockAcquired}
                                variant="outline"
                                className="bg-white"
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Supplier
                            </Button>
                            <Button
                                onClick={handleSaveAll}
                                disabled={!hasUnsavedChanges || isSaving || isLockedByOtherUser || !lockAcquired}
                                className="bg-slate-800 hover:bg-slate-700"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving ? 'Saving...' : 'Save All Changes'}
                            </Button>
                            <Button
                                onClick={async () => {
                                    if (hasUnsavedChanges) {
                                        const userChoice = window.confirm(
                                            'You have unsaved changes. Would you like to save them before making a payment?\n\n' +
                                            'Click "OK" to save and continue, or "Cancel" to continue without saving.'
                                        );
                                        
                                        if (userChoice) {
                                            const saveSuccessful = await handleSaveAll();
                                            if (saveSuccessful) {
                                                setShowPaymentModal(true);
                                            }
                                        } else {
                                            setShowPaymentModal(true);
                                        }
                                    } else {
                                        setShowPaymentModal(true);
                                    }
                                }}
                                disabled={isLockedByOtherUser || !lockAcquired}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <DollarSign className="w-4 h-4 mr-2" />
                                Make Payment
                            </Button>
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
                                    className="w-20 bg-white"
                                    disabled={isLockedByOtherUser || !lockAcquired}
                                />
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-64 justify-start text-left font-normal"
                                        disabled={isLockedByOtherUser || !lockAcquired}
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
                                        disabled={isLockedByOtherUser || !lockAcquired}
                                    />
                                </PopoverContent>
                            </Popover>
                            <Button
                                onClick={handleApplyDateRange}
                                disabled={isLockedByOtherUser || !lockAcquired || loading || isSaving}
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
                                    className="w-64 bg-white"
                                    disabled={isLockedByOtherUser || !lockAcquired}
                                />
                            </div>
                        </div>
                        <Card className="bg-white shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex gap-6">
                                    <div className="text-right">
                                        <p className="text-sm text-slate-500">Date Range Total</p>
                                        <p className="text-lg font-bold">${dateRangeTotal.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-slate-500">Total Balance Owing</p>
                                        <p className="text-lg font-bold text-red-600">${currentBalance.toFixed(2)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Tabs value={currentActiveTab} onValueChange={handleTabChange} className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="invoice-lines">Invoice Lines</TabsTrigger>
                            <TabsTrigger value="invoice-summary">Invoice Summary</TabsTrigger>
                            <TabsTrigger value="payment-history">Payment History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="invoice-lines">
                            <Card>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[120px]">Invoice #</TableHead>
                                                <TableHead className="w-[180px]">Date</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead className="w-[120px] text-right">Charge</TableHead>
                                                <TableHead className="w-[120px] text-right">GST</TableHead>
                                                <TableHead className="w-[120px] text-right">Line Total</TableHead>
                                                <TableHead className="w-[200px]">GL Account *</TableHead>
                                                <TableHead className="w-[80px] text-center">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredInvoiceLines.map((line, index) => {
                                                const locked = isLineLocked(line);
                                                const isDisabled = isLockedByOtherUser || !lockAcquired || locked;
                                                return (
                                                <ContextMenu key={line.id}>
                                                    <ContextMenuTrigger asChild>
                                                        <TableRow 
                                                            className={`${line.isNew || line.id.startsWith('temp_') ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                                                            onClick={() => setSelectedLineId(line.id)}
                                                        >
                                                            <TableCell>
                                                                <Input 
                                                                    value={line.invoice_number || ''} 
                                                                    onChange={(e) => !isDisabled && handleLineChange(line.id, 'invoice_number', e.target.value)}
                                                                    onFocus={() => setSelectedLineId(line.id)}
                                                                    readOnly={isDisabled || line.inventory}
                                                                    className={isDisabled || line.inventory ? 'cursor-not-allowed' : ''}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    <Input
                                                                        type="text"
                                                                        value={line.invoice_date && line.invoice_date.length === 10 && line.invoice_date.includes('-') ? formatDateForInput(line.invoice_date) : line.invoice_date || ''}
                                                                        onChange={(e) => !isDisabled && handleLineChange(line.id, 'invoice_date', e.target.value)}
                                                                        onBlur={(e) => !isDisabled && handleDateBlur(line.id, e.target.value)}
                                                                        onFocus={() => setSelectedLineId(line.id)}
                                                                        placeholder="MM/DD/YYYY"
                                                                        className={`w-32 ${line.dateError ? 'text-red-600 border-red-500' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`}
                                                                        readOnly={isDisabled || line.inventory}
                                                                        title={line.dateError || ''}
                                                                    />
                                                                    <Popover>
                                                                        <PopoverTrigger asChild>
                                                                            <Button 
                                                                                variant="outline" 
                                                                                size="icon"
                                                                                disabled={isDisabled || line.inventory}
                                                                                className="h-10 w-10"
                                                                            >
                                                                                <CalendarIcon className="h-4 w-4" />
                                                                            </Button>
                                                                        </PopoverTrigger>
                                                                        <PopoverContent className="w-auto p-0">
                                                                            <Calendar 
                                                                                mode="single" 
                                                                                selected={safeParseDateForCalendar(line.invoice_date)} 
                                                                                onSelect={async (date) => {
                                                                                    if (date && !isDisabled) {
                                                                                        const isoDate = format(date, 'yyyy-MM-dd');
                                                                                        
                                                                                        const fiscalCheck = await checkFiscalPeriodStatus(isoDate);
                                                                                        
                                                                                        if (!fiscalCheck.isValid) {
                                                                                            alert(fiscalCheck.message);
                                                                                            setInvoiceLines(prev => prev.map(l => 
                                                                                                l.id === line.id ? { ...l, dateError: fiscalCheck.message } : l
                                                                                            ));
                                                                                            return;
                                                                                        }
                                                                                        
                                                                                        setInvoiceLines(prev => prev.map(l => 
                                                                                                l.id === line.id ? { ...l, invoice_date: isoDate, dateError: null } : l
                                                                                            ));
                                                                                        setHasUnsavedChanges(true);
                                                                                    }
                                                                                }}
                                                                                disabled={isDisabled} 
                                                                            />
                                                                        </PopoverContent>
                                                                    </Popover>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Textarea 
                                                                    value={line.description || ''} 
                                                                    onChange={(e) => !isDisabled && handleLineChange(line.id, 'description', e.target.value)} 
                                                                    onFocus={() => setSelectedLineId(line.id)}
                                                                    rows={2} 
                                                                    className={`resize-none ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`}
                                                                    readOnly={isDisabled || line.inventory}
                                                                />
                                                            </TableCell>
                                                            <TableCell className={ (typeof line.charge === 'number' && line.charge < 0) || (typeof line.charge === 'string' && line.charge !== '' && isNaN(parseFloat(line.charge))) ? 'text-red-600' : ''}>
                                                                <Input 
                                                                    type="text"
                                                                    value={typeof line.charge === 'number' ? line.charge.toFixed(2) : line.charge || ''} 
                                                                    onChange={(e) => !isDisabled && handleLineChange(line.id, 'charge', e.target.value)}
                                                                    onBlur={(e) => !isDisabled && handleValueBlur(line.id, 'charge', e.target.value)}
                                                                    onFocus={() => setSelectedLineId(line.id)}
                                                                    className={`text-right ${typeof line.charge === 'string' && line.charge !== '' && isNaN(parseFloat(line.charge)) ? 'text-red-600 border-red-300' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`}
                                                                    readOnly={isDisabled || line.inventory}
                                                                />
                                                            </TableCell>
                                                            <TableCell className={ (typeof line.gst === 'number' && line.gst < 0) || (typeof line.gst === 'string' && line.gst !== '' && isNaN(parseFloat(line.gst))) ? 'text-red-600' : ''}>
                                                                <Input 
                                                                    type="text"
                                                                    value={typeof line.gst === 'number' ? line.gst.toFixed(2) : line.gst || ''} 
                                                                    onChange={(e) => !isDisabled && handleLineChange(line.id, 'gst', e.target.value)}
                                                                    onBlur={(e) => !isDisabled && handleValueBlur(line.id, 'gst', e.target.value)}
                                                                    onFocus={() => setSelectedLineId(line.id)}
                                                                    className={`text-right ${typeof line.gst === 'string' && line.gst !== '' && isNaN(parseFloat(line.gst)) ? 'text-red-600 border-red-300' : ''} ${isDisabled || !line.gst_override ? 'cursor-not-allowed' : ''}`}
                                                                    readOnly={isDisabled || !line.gst_override}
                                                                />
                                                            </TableCell>
                                                            <TableCell className={ (typeof line.line_total === 'number' && line.line_total < 0) || line.line_total === 'Error' ? 'text-red-600' : ''}>
                                                                <Input 
                                                                    type="text"
                                                                    value={typeof line.line_total === 'number' ? line.line_total.toFixed(2) : line.line_total || ''} 
                                                                    className={`text-right bg-slate-100 ${line.line_total === 'Error' ? 'text-red-600' : ''} cursor-default`}
                                                                    readOnly
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Select
                                                                    value={line.gl_account || ''}
                                                                    onValueChange={(value) => { !isDisabled && handleLineChange(line.id, 'gl_account', value); setSelectedLineId(line.id); }}
                                                                    disabled={isDisabled || line.inventory}
                                                                >
                                                                    <SelectTrigger className={`${!line.gl_account && (line.invoice_number || line.description || (typeof line.charge === 'number' && line.charge !== 0) || (typeof line.gst === 'number' && line.gst !== 0)) ? 'border-red-300' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`}>
                                                                        <SelectValue placeholder="Select GL Account *">
                                                                            {line.gl_account ? (() => {
                                                                                const account = chartOfAccounts.find(acc => acc.account_number === line.gl_account);
                                                                                const fullText = account ? `${account.account_number} - ${account.account_name}` : line.gl_account;
                                                                                return fullText.length > 25 ? fullText.substring(0, 25) + '...' : fullText;
                                                                            })() : 'Select GL Account *'}
                                                                        </SelectValue>
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {chartOfAccounts.filter(account => !account.controlled || account.account_number === line.gl_account).map(account => (
                                                                            <SelectItem key={account.id} value={account.account_number}>
                                                                                {account.account_number} - {account.account_name}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {locked || line.inventory ? (
                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <div className="inline-flex items-center justify-center w-8 h-8"> {/* Mimics button size */}
                                                                                        <Lock className="w-4 h-4 text-slate-400" />
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent>
                                                                                    <span>This line is locked because it has a payment applied or is an inventory line.</span>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    ) : (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDeleteLine(line.id)}
                                                                            disabled={isLockedByOtherUser || !lockAcquired}
                                                                            className="h-8 w-8"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                                        </Button>
                                                                    )}
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => handleToggleGstOverride(line.id)}
                                                                        disabled={isDisabled}
                                                                        className="h-8 w-8"
                                                                        title={line.gst_override ? "Switch to automatic GST calculation" : "Switch to manual GST entry"}
                                                                    >
                                                                        {line.gst_override ? (
                                                                            <Calculator className="w-4 h-4 text-blue-600" />
                                                                        ) : (
                                                                            <Edit className="w-4 h-4 text-slate-400" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    </ContextMenuTrigger>
                                                    <ContextMenuContent>
                                                        <ContextMenuItem
                                                            onClick={() => handleEditLineClick(line)}
                                                            disabled={isLockedByOtherUser || !lockAcquired || locked || line.inventory}
                                                        >
                                                            Edit Line
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => handleAddLineAbove(line.id)} disabled={isLockedByOtherUser || !lockAcquired}>
                                                            Add Line Above
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => handleAddLineBelow(line.id)} disabled={isLockedByOtherUser || !lockAcquired}>
                                                            Add Line Below
                                                        </ContextMenuItem>
                                                        {!locked && !line.inventory && (
                                                            <ContextMenuItem 
                                                                onClick={() => handleDeleteLine(line.id)} 
                                                                disabled={isLockedByOtherUser || !lockAcquired}
                                                                className="text-red-600"
                                                            >
                                                                Delete Line
                                                            </ContextMenuItem>
                                                        )}
                                                    </ContextMenuContent>
                                                </ContextMenu>
                                            )})}
                                        </TableBody>
                                    </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

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
                                                      // It was a string, but JSON.parse successfully parsed it to a string, means it wasn't JSON.
                                                      // Treat as single invoice.
                                                      appliedInvoices = [{
                                                          invoice_number: parsed,
                                                          amount_applied: payment.amount
                                                      }];
                                                  }
                                              } catch (error) {
                                                  // JSON.parse failed, assume it's a plain string.
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
                                                        e.stopPropagation(); // Prevent row expansion
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

            {/* Floating scroll buttons */}
            <div className="fixed right-8 bottom-8 flex flex-col gap-2 z-50">
                <Button
                    onClick={handleScrollToTop}
                    size="icon"
                    className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
                    title="Scroll to top"
                >
                    <ArrowUp className="w-5 h-5" />
                </Button>
                <Button
                    onClick={handleScrollToBottom}
                    size="icon"
                    className="h-12 w-12 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
                    title="Scroll to bottom"
                >
                    <ArrowDown className="w-5 h-5" />
                </Button>
            </div>

            {/* Edit Supplier Modal */}
            <Dialog open={showEditSupplierModal} onOpenChange={setShowEditSupplierModal}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Supplier</DialogTitle>
                    </DialogHeader>
                    {supplier && (
                        <SupplierForm
                            supplier={supplier}
                            onSubmit={handleSupplierUpdate}
                            onCancel={() => setShowEditSupplierModal(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Line Edit Modal */}
            <LineEditModal
                open={showLineEditModal}
                onClose={() => {
                    setShowLineEditModal(false);
                    setEditingLine(null);
                }}
                line={editingLine}
                onSave={handleLineUpdate}
                chartOfAccounts={chartOfAccounts}
            />

            {/* Supplier Payment Modal */}
            <SupplierPaymentModal
                open={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                supplier={supplier}
                invoiceLines={allConceptualInvoices}
                onPaymentComplete={handlePaymentComplete}
            />
        </>
    );
}