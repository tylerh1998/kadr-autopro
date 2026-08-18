import React, { useState, useEffect } from "react";
import { PayStub, Employee, ValidPayType, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, X, Columns3, Printer, ChevronDown, ChevronUp } from "lucide-react";

// D2: no stored employer-EI field exists on PayPro_PayStub, so the employer-portion columns
// derive it from PayPro_TaxYearConstant.ei_rate_employer_multiplier for the stub's own year,
// instead of a hardcoded 1.4 - same fix applied everywhere else this pattern was found
// (Phase 6/7's paystub/remittance files, this phase's TrendsDataProcessor.jsx).
const getEmployerMultiplier = (taxYearConstants, year) => {
  const row = taxYearConstants.find((c) => c.year === year);
  return row?.ei_rate_employer_multiplier ?? 1.4;
};

// Static Column Configuration (base columns)
const baseColumnsConfig = [
  {
    id: 'paycheque_number',
    label: 'Paycheque #',
    renderCell: (stub) => stub.paycheque_number || 'N/A',
    sortField: 'paycheque_number',
    isNumeric: false,
    defaultVisible: false,
  },
  {
    id: 'status',
    label: 'Status',
    renderCell: (stub) => {
      if (stub.is_cancelled) {
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Cancelled</Badge>;
      } else if (stub.is_paid) {
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      } else {
        return <Badge variant="secondary">Unpaid</Badge>;
      }
    },
    sortField: 'is_paid',
    isNumeric: false,
    defaultVisible: false,
  },
  {
    id: 'employeeName',
    label: 'Employee Name',
    renderCell: (stub, employees) => {
      const employee = employees.find(e => e.employee_id === stub.employee_id);
      return employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown';
    },
    sortField: 'employee',
    isNumeric: false,
    defaultVisible: true,
  },
  {
    id: 'pay_date',
    label: 'Pay Date',
    renderCell: (stub) => stub.pay_date ? new Date(stub.pay_date).toLocaleDateString('en-CA') : 'N/A',
    sortField: 'pay_date',
    isNumeric: false,
    defaultVisible: false,
  },
  {
    id: 'payPeriod',
    label: 'Pay Period',
    renderCell: (stub) => {
      const start = stub.pay_period_start ? new Date(stub.pay_period_start).toLocaleDateString('en-CA') : 'N/A';
      const end = stub.pay_period_end ? new Date(stub.pay_period_end).toLocaleDateString('en-CA') : 'N/A';
      return `${start} - ${end}`;
    },
    sortField: 'pay_period_start',
    isNumeric: false,
    defaultVisible: true,
  },
  {
    id: 'gross_pay',
    label: 'Gross Pay',
    renderCell: (stub) => `$${stub.gross_pay?.toFixed(2) || '0.00'}`,
    sortField: 'gross_pay',
    isNumeric: true,
    defaultVisible: true,
  },
  {
    id: 'income_tax',
    label: 'Income Tax',
    renderCell: (stub) => {
      const total = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
      return `$${total.toFixed(2)}`;
    },
    sortField: null,
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'cpp_deduction',
    label: 'CPP (Employee)',
    renderCell: (stub) => `$${stub.cpp_deduction?.toFixed(2) || '0.00'}`,
    sortField: 'cpp_deduction',
    isNumeric: true,
    defaultVisible: false,
  },
  {
    id: 'cpp_employer',
    label: 'CPP (Employer)',
    renderCell: (stub) => `$${stub.cpp_deduction?.toFixed(2) || '0.00'}`,
    sortField: 'cpp_deduction', // Sort by employee deduction as employer matches
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'cpp_both',
    label: 'CPP (Both)',
    renderCell: (stub) => {
      const total = (stub.cpp_deduction || 0) * 2;
      return `$${total.toFixed(2)}`;
    },
    sortField: null, // This combined field doesn't have a direct sort field
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'cpp2_deduction',
    label: 'CPP2 (Employee)',
    renderCell: (stub) => `$${(stub.cpp2_deduction || 0).toFixed(2)}`,
    sortField: 'cpp2_deduction',
    isNumeric: true,
    defaultVisible: false,
  },
  {
    id: 'cpp2_employer',
    label: 'CPP2 (Employer)',
    renderCell: (stub) => `$${(stub.cpp2_deduction || 0).toFixed(2)}`,
    sortField: 'cpp2_deduction', // Sort by employee deduction as employer matches
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'cpp2_both',
    label: 'CPP2 (Both)',
    renderCell: (stub) => {
      const total = (stub.cpp2_deduction || 0) * 2;
      return `$${total.toFixed(2)}`;
    },
    sortField: null, // This combined field doesn't have a direct sort field
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'ei_deduction',
    label: 'EI (Employee)',
    renderCell: (stub) => `$${stub.ei_deduction?.toFixed(2) || '0.00'}`,
    sortField: 'ei_deduction',
    isNumeric: true,
    defaultVisible: false,
  },
  {
    id: 'ei_employer',
    label: 'EI (Employer)',
    renderCell: (stub, employees, taxYearConstants = []) => {
      const employerEI = (stub.ei_deduction || 0) * getEmployerMultiplier(taxYearConstants, stub.year);
      return `$${employerEI.toFixed(2)}`;
    },
    sortField: null, // This combined field doesn't have a direct sort field
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'ei_both',
    label: 'EI (Both)',
    renderCell: (stub, employees, taxYearConstants = []) => {
      const multiplier = getEmployerMultiplier(taxYearConstants, stub.year);
      const total = (stub.ei_deduction || 0) * (1 + multiplier); // Employee + Employer
      return `$${total.toFixed(2)}`;
    },
    sortField: null, // This combined field doesn't have a direct sort field
    isNumeric: true,
    defaultVisible: false,
    isCombinedField: true,
  },
  {
    id: 'total_deductions',
    label: 'Total Deductions',
    renderCell: (stub) => `$${stub.total_deductions?.toFixed(2) || '0.00'}`,
    sortField: 'total_deductions',
    isNumeric: true,
    defaultVisible: false,
  },
  {
    id: 'net_pay',
    label: 'Net Pay',
    renderCell: (stub) => `$${stub.net_pay?.toFixed(2) || '0.00'}`,
    sortField: 'net_pay',
    isNumeric: true,
    defaultVisible: true,
  },
  {
    id: 'paid_via',
    label: 'Paid Via',
    renderCell: (stub) => stub.paid_via || 'N/A',
    sortField: 'paid_via',
    isNumeric: false,
    defaultVisible: false,
    hideFromSelector: true,
  },
];

export default function PaychequesReport() {
  // Pending filter states (what user is currently selecting in the UI)
  const [pendingDateFrom, setPendingDateFrom] = useState('');
  const [pendingDateTo, setPendingDateTo] = useState('');
  const [pendingEmployee, setPendingEmployee] = useState('all');
  const [pendingStatus, setPendingStatus] = useState('all');
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');

  // Applied filter states (what's actually filtering the data)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [sortField, setSortField] = useState('pay_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [columnsConfig, setColumnsConfig] = useState(baseColumnsConfig);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [visibleColumnIds, setVisibleColumnIds] = useState(
    baseColumnsConfig.filter(col => col.defaultVisible).map(col => col.id)
  );

  const { data: payStubs = [], isLoading: loadingStubs } = useQuery({
    queryKey: ['paypro', 'payStubs'],
    queryFn: () => PayStub.list('-created_date'),
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['paypro', 'employees'],
    queryFn: () => Employee.list(),
  });

  const { data: validPayTypes = [], isLoading: loadingPayTypes } = useQuery({
    queryKey: ['paypro', 'validPayTypes'],
    queryFn: () => ValidPayType.list('-created_date'),
  });

  const { data: taxYearConstants = [], isLoading: loadingConstants } = useQuery({
    queryKey: ['paypro', 'taxYearConstants'],
    queryFn: () => TaxYearConstant.list(),
  });

  // Set default date range on mount (last 3 months to start of that month)
  useEffect(() => {
    const today = new Date();
    // Set to the first day of the month, 3 months ago
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    const defaultFrom = threeMonthsAgo.toISOString().split('T')[0];
    const defaultTo = today.toISOString().split('T')[0]; // Today's date

    setPendingDateFrom(defaultFrom);
    setPendingDateTo(defaultTo);
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  }, []);

  useEffect(() => {
    if (validPayTypes.length > 0) {
      const dynamicColumns = validPayTypes.map(payType => ({
        id: `income_${payType.name.toLowerCase().replace(/\s+/g, '_')}`,
        label: payType.name,
        renderCell: (stub) => {
          if (!stub.income_breakdown || !Array.isArray(stub.income_breakdown)) {
            return '$0.00';
          }
          const incomeItem = stub.income_breakdown.find(item => item.type === payType.name);
          return incomeItem ? `$${(incomeItem.amount || 0).toFixed(2)}` : '$0.00';
        },
        sortField: null,
        isNumeric: true,
        defaultVisible: false,
        payTypeName: payType.name,
      }));

      const vacationPayColumn = {
        id: 'vacation_pay_this_period',
        label: 'Vacation Pay',
        renderCell: (stub) => `$${(stub.vacation_pay_this_period || 0).toFixed(2)}`,
        sortField: 'vacation_pay_this_period',
        isNumeric: true,
        defaultVisible: false,
      };

      setColumnsConfig([...baseColumnsConfig, vacationPayColumn, ...dynamicColumns]);
    }
  }, [validPayTypes]);

  const loading = loadingStubs || loadingEmployees || loadingPayTypes || loadingConstants;

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 ml-1 inline" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 ml-1 inline" />
      : <ArrowDown className="w-4 h-4 ml-1 inline" />;
  };

  const applyFilters = () => {
    setDateFrom(pendingDateFrom);
    setDateTo(pendingDateTo);
    setSelectedEmployee(pendingEmployee);
    setSelectedStatus(pendingStatus);
    setSearchQuery(pendingSearchQuery);
  };

  const clearFilters = () => {
    // Reset to default 3-month range
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const defaultFrom = threeMonthsAgo.toISOString().split('T')[0];
    const defaultTo = today.toISOString().split('T')[0];

    setPendingDateFrom(defaultFrom);
    setPendingDateTo(defaultTo);
    setPendingEmployee('all');
    setPendingStatus('all');
    setPendingSearchQuery('');

    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setSelectedEmployee('all');
    setSelectedStatus('all');
    setSearchQuery('');
    setFiltersOpen(false); // Close filters after clearing and applying
  };

  const getEmployee = (employeeId) => {
    return employees.find(e => e.employee_id === employeeId);
  };

  const filteredAndSortedStubs = payStubs
    .filter(stub => {
      // Use pay_period_end for date filtering
      if (dateFrom && new Date(stub.pay_period_end) < new Date(dateFrom)) return false;
      if (dateTo && new Date(stub.pay_period_end) > new Date(dateTo)) return false;
      if (selectedEmployee !== 'all' && stub.employee_id !== selectedEmployee) return false;
      if (selectedStatus === 'paid' && !stub.is_paid) return false;
      if (selectedStatus === 'unpaid' && stub.is_paid) return false;
      if (selectedStatus === 'cancelled' && !stub.is_cancelled) return false;

      if (searchQuery) {
        const employee = getEmployee(stub.employee_id);
        const employeeName = employee ? `${employee.first_name} ${employee.last_name}`.toLowerCase() : '';
        const paychequeNum = (stub.paycheque_number || '').toLowerCase();
        const query = searchQuery.toLowerCase();

        if (!employeeName.includes(query) && !paychequeNum.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let aVal, bVal;

      if (sortField === 'employee') {
        const empA = getEmployee(a.employee_id);
        const empB = getEmployee(b.employee_id);
        aVal = empA ? `${empA.last_name} ${empA.first_name}` : '';
        bVal = empB ? `${empB.last_name} ${empB.first_name}` : '';
      } else if (sortField === 'pay_date' || sortField === 'pay_period_start') {
        // Use pay_period_end for consistent date filtering and sorting if possible
        // or ensure `sortField` matches `pay_date` or `pay_period_start` directly.
        // For 'pay_date' sort, we should stick to 'pay_date', not 'pay_period_end'
        aVal = new Date(a[sortField] || a.created_date);
        bVal = new Date(b[sortField] || b.created_date);
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const calculateTotals = () => {
    const totals = {};

    visibleColumnIds.forEach(colId => {
      const columnConfig = columnsConfig.find(c => c.id === colId);
      if (columnConfig && columnConfig.isNumeric) {
        if (columnConfig.payTypeName) {
          // Handle dynamic pay type columns
          totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
            if (!stub.income_breakdown || !Array.isArray(stub.income_breakdown)) return sum;
            const incomeItem = stub.income_breakdown.find(item => item.type === columnConfig.payTypeName);
            return sum + (incomeItem ? (incomeItem.amount || 0) : 0);
          }, 0);
        } else if (columnConfig.isCombinedField) {
          // Handle all combined fields
          if (colId === 'income_tax') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.federal_tax || 0) + (stub.provincial_tax || 0);
            }, 0);
          } else if (colId === 'cpp_employer') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.cpp_deduction || 0);
            }, 0);
          } else if (colId === 'cpp_both') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.cpp_deduction || 0) * 2;
            }, 0);
          } else if (colId === 'cpp2_employer') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.cpp2_deduction || 0);
            }, 0);
          } else if (colId === 'cpp2_both') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.cpp2_deduction || 0) * 2;
            }, 0);
          } else if (colId === 'ei_employer') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              return sum + (stub.ei_deduction || 0) * getEmployerMultiplier(taxYearConstants, stub.year);
            }, 0);
          } else if (colId === 'ei_both') {
            totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
              const multiplier = getEmployerMultiplier(taxYearConstants, stub.year);
              return sum + (stub.ei_deduction || 0) * (1 + multiplier);
            }, 0);
          }
        } else {
          // Handle regular numeric fields
          const fieldName = columnConfig.sortField || colId;
          totals[colId] = filteredAndSortedStubs.reduce((sum, stub) => {
            return sum + (stub[fieldName] || 0);
          }, 0);
        }
      }
    });

    return totals;
  };

  const totals = calculateTotals();

  const handleExportCSV = () => {
    const visibleColumns = columnsConfig.filter(col => visibleColumnIds.includes(col.id));
    const headers = visibleColumns.map(col => col.label);

    const rows = filteredAndSortedStubs.map(stub => {
      return visibleColumns.map(col => {
        const cellContent = col.renderCell(stub, employees, taxYearConstants);
        // Clean cellContent for CSV: remove HTML tags, handle badges, escape quotes
        let displayValue = '';
        if (typeof cellContent === 'string') {
          displayValue = cellContent;
        } else if (React.isValidElement(cellContent) && cellContent.props && typeof cellContent.props.children === 'string') {
          displayValue = cellContent.props.children;
        } else if (React.isValidElement(cellContent) && cellContent.type === Badge) {
            // For Badge components, extract children as text
            displayValue = cellContent.props.children;
        } else if (React.isValidElement(cellContent)) {
          // For other complex React elements, we might just use a placeholder or try to get text if possible
          displayValue = '...'; // or more sophisticated text extraction if needed
        }
        return `"${displayValue.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleColumnToggle = (columnId, checked) => {
    setVisibleColumnIds(prev =>
      checked
        ? [...prev, columnId]
        : prev.filter(id => id !== columnId)
    );
  };

  const handlePrint = () => {
    const visibleColumns = columnsConfig.filter(col => visibleColumnIds.includes(col.id));

    const printHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payroll Report - ${new Date().toLocaleDateString('en-CA')}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { -webkit-print-color-adjust: exact; font-family: sans-serif; }
        .text-xs { font-size: 0.75rem; }
        .text-sm { font-size: 0.875rem; }
        .w-full { width: 100%; }
        .border-collapse { border-collapse: collapse; }
        .border { border: 1px solid #e2e8f0; }
        .p-1 { padding: 0.25rem; }
        .p-2 { padding: 0.5rem; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .bg-gray-100 { background-color: #f3f4f6; }
        .bg-gray-700 { background-color: #374151; }
        .text-white { color: #fff; }
        .mb-2 { margin-bottom: 0.5rem; }
        .mb-4 { margin-bottom: 1rem; }
        .mb-6 { margin-bottom: 1.5rem; }
        .mt-4 { margin-top: 1rem; }
        .mx-auto { margin-left: auto; margin-right: auto; }
        .max-w-full { max-width: 100%; }
        .flex { display: flex; }
        .justify-center { justify-content: center; }
        .items-center { align-items: center; }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body class="p-8">
      <div class="max-w-full mx-auto bg-white">
        <!-- Header -->
        <div class="flex justify-center items-center mb-6">
          <img
            src="https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg"
            alt="Ken's Auto & Diesel Repair"
            style="max-width: 100%; height: auto; max-height: 120px;"
          />
        </div>

        <!-- Title Bar -->
        <div class="bg-gray-700 text-white p-2 text-center font-bold text-sm mb-4">
          PAYROLL REPORT - Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>

        <!-- Filter Summary -->
        ${dateFrom || dateTo || selectedEmployee !== 'all' || selectedStatus !== 'all' || searchQuery ? `
        <div class="mb-4 p-2 border text-xs">
          <strong>Filters Applied:</strong>
          ${dateFrom ? `<span>Date From: ${new Date(dateFrom).toLocaleDateString('en-CA')}&nbsp;&nbsp;</span>` : ''}
          ${dateTo ? `<span>Date To: ${new Date(dateTo).toLocaleDateString('en-CA')}&nbsp;&nbsp;</span>` : ''}
          ${selectedEmployee !== 'all' ? `<span>Employee: ${employees.find(e => e.employee_id === selectedEmployee)?.first_name} ${employees.find(e => e.employee_id === selectedEmployee)?.last_name}&nbsp;&nbsp;</span>` : ''}
          ${selectedStatus !== 'all' ? `<span>Status: ${selectedStatus}&nbsp;&nbsp;</span>` : ''}
          ${searchQuery ? `<span>Search: "${searchQuery}"&nbsp;&nbsp;</span>` : ''}
        </div>
        ` : ''}

        <!-- Data Table -->
        <table class="w-full border-collapse border text-xs">
          <thead>
            <tr class="bg-gray-100">
              ${visibleColumns.map(col => `
                <th class="border p-1 ${col.isNumeric ? 'text-right' : 'text-left'}">${col.label}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${filteredAndSortedStubs.map(stub => `
              <tr>
                ${visibleColumns.map(col => {
                  const cellContent = col.renderCell(stub, employees, taxYearConstants);
                  let displayValue = '';
                  if (typeof cellContent === 'string') {
                    displayValue = cellContent;
                  } else if (React.isValidElement(cellContent) && cellContent.props && typeof cellContent.props.children === 'string') {
                    displayValue = cellContent.props.children;
                  } else if (React.isValidElement(cellContent) && cellContent.type === Badge) {
                    displayValue = cellContent.props.children;
                  } else if (React.isValidElement(cellContent)) {
                    displayValue = '...';
                  }
                  return `<td class="border p-1 ${col.isNumeric ? 'text-right' : ''}">${displayValue}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="bg-gray-100 font-bold">
              ${visibleColumns.map((col, index) => {
                const total = col.isNumeric ? `$${totals[col.id]?.toFixed(2) || '0.00'}` : '';
                return `
                  <td class="border p-1 ${col.isNumeric ? 'text-right' : (index === 0 ? 'text-left' : '')}">
                    ${col.isNumeric ? total : (index === 0 ? 'Totals:' : '')}
                  </td>
                `;
              }).join('')}
            </tr>
          </tfoot>
        </table>

        <!-- Summary -->
        <div class="mt-4 text-xs text-right">
          <strong>Total Records:</strong> ${filteredAndSortedStubs.length}
        </div>
      </div>
    </body>
    </html>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
        printWindow.print();
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Paycheque Report</h2>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handlePrint}
            disabled={filteredAndSortedStubs.length === 0}
            variant="outline"
            className="border-slate-600 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button onClick={handleExportCSV} disabled={filteredAndSortedStubs.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
            <Download className="w-4 h-4 mr-2" />
            Export to CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm mb-6 dark:bg-slate-900 dark:border-slate-800">
        <CardHeader className="cursor-pointer" onClick={() => setFiltersOpen(!filtersOpen)}>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 dark:text-slate-100">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              {!filtersOpen && (dateFrom || dateTo || selectedEmployee !== 'all' || selectedStatus !== 'all' || searchQuery) && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">Active</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen); }} className="dark:text-slate-300 dark:hover:bg-slate-800">
                {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {filtersOpen && (
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Search</Label>
                  <Input
                    placeholder="Name or Paycheque #"
                    value={pendingSearchQuery}
                    onChange={(e) => setPendingSearchQuery(e.target.value)}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Date From <span className="text-xs text-slate-500 dark:text-slate-400">(by period end)</span></Label>
                  <Input
                    type="date"
                    value={pendingDateFrom}
                    onChange={(e) => setPendingDateFrom(e.target.value)}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Date To <span className="text-xs text-slate-500 dark:text-slate-400">(by period end)</span></Label>
                  <Input
                    type="date"
                    value={pendingDateTo}
                    onChange={(e) => setPendingDateTo(e.target.value)}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Employee</Label>
                  <Select value={pendingEmployee} onValueChange={setPendingEmployee}>
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.employee_id}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">Status</Label>
                  <Select value={pendingStatus} onValueChange={setPendingStatus}>
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={clearFilters} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <X className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
                <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700">
                  Apply Filters
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Data Table */}
      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="dark:text-slate-100">Paycheque Data</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30">
                  <Columns3 className="w-4 h-4 mr-2" />
                  Customize Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 dark:bg-slate-900 dark:border-slate-700">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-3 dark:text-slate-100">Select Columns to Display</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {columnsConfig
                        .filter(col => !col.hideFromSelector)
                        .map(col => (
                          <div key={col.id} className="flex items-center space-x-2 column-checkbox">
                            <Checkbox
                              id={col.id}
                              checked={visibleColumnIds.includes(col.id)}
                              onCheckedChange={(checked) => handleColumnToggle(col.id, checked)}
                            />
                            <Label htmlFor={col.id} className="cursor-pointer dark:text-slate-300">
                              {col.label}
                            </Label>
                          </div>
                        ))}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={() => setVisibleColumnIds(baseColumnsConfig.filter(col => col.defaultVisible).map(col => col.id))}
                  >
                    Reset to Default
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-blue-800 dark:text-blue-400"/>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumnIds.map(colId => {
                      const col = columnsConfig.find(c => c.id === colId);
                      if (!col) return null;
                      return (
                        <TableHead
                          key={colId}
                          className={`cursor-pointer dark:text-slate-300 ${col.isNumeric ? 'text-right' : ''}`}
                          onClick={() => col.sortField && handleSort(col.sortField)}
                        >
                          {col.label} {col.sortField && getSortIcon(col.sortField)}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedStubs.map(stub => (
                    <TableRow key={stub.id}>
                      {visibleColumnIds.map(colId => {
                        const col = columnsConfig.find(c => c.id === colId);
                        if (!col) return null;
                        return (
                          <TableCell
                            key={colId}
                            className={`dark:text-slate-200 ${col.isNumeric ? 'text-right font-semibold' : ''}`}
                          >
                            {col.renderCell(stub, employees, taxYearConstants)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {filteredAndSortedStubs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={visibleColumnIds.length} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        No records found matching your filters
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {filteredAndSortedStubs.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold">
                      {visibleColumnIds.map((colId, index) => {
                        const col = columnsConfig.find(c => c.id === colId);
                        if (!col) return null;
                        return (
                          <TableCell
                            key={colId}
                            className={`dark:text-slate-100 ${col.isNumeric ? 'text-right' : ''}`}
                          >
                            {col.isNumeric ? `$${totals[colId]?.toFixed(2) || '0.00'}` : (index === 0 ? 'Totals:' : '')}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
