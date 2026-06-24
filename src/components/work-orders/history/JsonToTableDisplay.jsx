import React, { useEffect, useMemo, useState } from 'react';
import { ChartOfAccount } from '@/entities/all';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import HistoryComparisonTable from './HistoryComparisonTable';

const financialFieldKeys = ['parts_total', 'labor_total', 'shop_supply_total', 'tax_amount', 'total_amount', 'amount_paid'];
const excludedKeys = new Set(['last_updated', 'line_items', 'payments', 'accounting_details', ...financialFieldKeys]);

function isDateLikeKey(key) {
  return key.toLowerCase().includes('date') || key.toLowerCase().includes('time') || key.toLowerCase().includes('updated_at') || key.toLowerCase().includes('changed_at');
}

function normalizeCompareValue(value) {
  if (Array.isArray(value)) return value.map(normalizeCompareValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeCompareValue(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function valuesEqual(left, right) {
  return JSON.stringify(normalizeCompareValue(left)) === JSON.stringify(normalizeCompareValue(right));
}

function formatMountainDateTimeSafe(value) {
  if (!value) return '';
  try {
    const rawValue = String(value).trim();
    if (!rawValue) return '';
    let normalizedValue = rawValue.replace(' ', 'T');
    if (/^[\d-]+$/.test(normalizedValue)) {
      const [year, month, day] = normalizedValue.split('-').map(Number);
      return format(new Date(year, month - 1, day), 'MMM d, yyyy');
    }
    if (/([+-]\d{2})$/.test(normalizedValue)) {
      normalizedValue = normalizedValue.replace(/([+-]\d{2})$/, '$1:00');
    }
    if (!normalizedValue.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(normalizedValue)) {
      normalizedValue = `${normalizedValue}Z`;
    }
    const dateObj = new Date(normalizedValue);
    if (Number.isNaN(dateObj.getTime())) return rawValue;
    return format(toMountainTime(dateObj), 'MMM d, yyyy h:mm a');
  } catch {
    return String(value);
  }
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isDateLikeKey(key)) return formatMountainDateTimeSafe(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function parseHistoryObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function parseHistoryArray(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeHistoryLineItem(line) {
  return {
    ...line,
    qty: toNumber(line?.qty),
    hrs: toNumber(line?.hrs),
    parts_ea: toNumber(line?.parts_ea),
    tot_parts: toNumber(line?.tot_parts),
    labour: toNumber(line?.labour),
    total: toNumber(line?.total),
    price: toNumber(line?.price),
    quantity: toNumber(line?.quantity),
    qty_on_order: toNumber(line?.qty_on_order),
    Core_num: toNumber(line?.Core_num),
    core_ret: toNumber(line?.core_ret),
    core_cost: toNumber(line?.core_cost),
  };
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `$${toNumber(value).toFixed(2)}`;
}

function HistoryFinancialItem({ label, currentValue, previousValue }) {
  const isChanged = !valuesEqual(previousValue, currentValue);

  return (
    <div className={`text-center px-4 py-3 rounded-lg min-w-[160px] ${isChanged ? 'bg-black text-white' : 'bg-slate-50'}`}>
      <p className={`text-xs font-medium uppercase tracking-wider ${isChanged ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-sm md:text-base font-bold whitespace-pre-wrap break-words ${isChanged ? 'text-white' : 'text-slate-800'}`}>
        {isChanged ? `${formatCurrency(previousValue)} --> ${formatCurrency(currentValue)}` : formatCurrency(currentValue)}
      </p>
    </div>
  );
}

export default function JsonToTableDisplay({ data, compareData }) {
  const [chartOfAccounts, setChartOfAccounts] = useState([]);

  useEffect(() => {
    const loadChartOfAccounts = async () => {
      const accounts = await ChartOfAccount.list();
      setChartOfAccounts(accounts || []);
    };

    loadChartOfAccounts();
  }, []);

  const accountNameMap = useMemo(() => {
    return new Map(chartOfAccounts.map((account) => [String(account.account_number), account.account_name]));
  }, [chartOfAccounts]);

  const currentData = useMemo(() => parseHistoryObject(data), [data]);
  const previousData = useMemo(() => parseHistoryObject(compareData), [compareData]);

  const otherFieldKeys = useMemo(() => {
    return Array.from(new Set([...Object.keys(previousData), ...Object.keys(currentData)]))
      .filter((key) => !excludedKeys.has(key))
      .sort();
  }, [currentData, previousData]);

  const parsedLineItems = useMemo(() => parseHistoryArray(currentData.line_items).map(normalizeHistoryLineItem), [currentData]);
  const previousLineItems = useMemo(() => parseHistoryArray(previousData.line_items).map(normalizeHistoryLineItem), [previousData]);
  const parsedPayments = useMemo(() => parseHistoryArray(currentData.payments), [currentData]);
  const previousPayments = useMemo(() => parseHistoryArray(previousData.payments), [previousData]);
  const parsedAccountingDetails = useMemo(() => parseHistoryArray(currentData.accounting_details), [currentData]);
  const previousAccountingDetails = useMemo(() => parseHistoryArray(previousData.accounting_details), [previousData]);

  const hasFinancialData = financialFieldKeys.some((key) => currentData[key] !== undefined || previousData[key] !== undefined);
  const hasAnyDetails = otherFieldKeys.length || parsedPayments.length || previousPayments.length || parsedAccountingDetails.length || previousAccountingDetails.length || parsedLineItems.length || previousLineItems.length || hasFinancialData;

  if (!hasAnyDetails) {
    return <p className="text-sm text-slate-500">No details available for this change.</p>;
  }

  return (
    <div className="space-y-6">
      {otherFieldKeys.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Field</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {otherFieldKeys.map((key) => {
                const previousValue = previousData[key];
                const currentValue = currentData[key];
                const isChanged = !valuesEqual(previousValue, currentValue);

                return (
                  <TableRow key={key} className={isChanged ? 'bg-black text-white hover:bg-black' : ''}>
                    <TableCell className={`font-medium align-top ${isChanged ? 'text-white font-semibold' : ''}`}>{key}</TableCell>
                    <TableCell className={`align-top whitespace-pre-wrap break-words ${isChanged ? 'text-white font-semibold' : ''}`}>
                      {isChanged ? `${formatValue(key, previousValue)} --> ${formatValue(key, currentValue)}` : formatValue(key, currentValue)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <HistoryComparisonTable
        title="Payments"
        currentRows={parsedPayments}
        previousRows={previousPayments}
        getRowKey={(payment, index) => String(payment?.id || payment?.payment_id || payment?.reference || `payment-${index}`)}
        columns={[
          { key: 'payment_date', label: 'Payment Date', formatValue: (value) => formatValue('payment_date', value) },
          { key: 'amount', label: 'Amount', formatValue: (value) => formatCurrency(value) },
          { key: 'payment_method', label: 'Payment Method', formatValue: (value) => formatValue('payment_method', value) },
          { key: 'reference', label: 'Reference', formatValue: (value) => formatValue('reference', value) },
          { key: 'advance_pmt', label: 'Advance Payment', formatValue: (value) => formatValue('advance_pmt', value) },
        ]}
      />

      <HistoryComparisonTable
        title="Accounting Details"
        currentRows={parsedAccountingDetails}
        previousRows={previousAccountingDetails}
        getRowKey={(entry, index) => String(entry?.id || `${entry?.account_number || 'acct'}-${entry?.reference || 'ref'}-${index}`)}
        columns={[
          {
            key: 'account_number',
            label: 'Account Number',
            formatValue: (value) => {
              if (value === null || value === undefined || value === '') return '—';
              const accountNumber = String(value);
              const accountName = accountNameMap.get(accountNumber);
              return accountName ? `${accountNumber} - ${accountName}` : accountNumber;
            },
          },
          { key: 'transaction_date', label: 'Transaction Date', formatValue: (value) => formatValue('transaction_date', value) },
          { key: 'description', label: 'Description', formatValue: (value) => formatValue('description', value) },
          { key: 'reference', label: 'Reference', formatValue: (value) => formatValue('reference', value) },
          { key: 'debit_amount', label: 'Debit Amount', formatValue: (value) => formatCurrency(value), cellClassName: 'text-right' },
          { key: 'credit_amount', label: 'Credit Amount', formatValue: (value) => formatCurrency(value), cellClassName: 'text-right' },
        ]}
      />

      <HistoryComparisonTable
        title="Line Items"
        currentRows={parsedLineItems}
        previousRows={previousLineItems}
        getRowKey={(line, index) => String(line?.line_uuid || line?.uuid || line?.id || line?.line_id || line?.selection_id || `line-${index}`)}
        columns={[
          { key: 'line_type', label: 'Type', formatValue: (value) => formatValue('line_type', value) },
          { key: 'description', label: 'Description', formatValue: (value) => formatValue('description', value) },
          { key: 'part_number', label: 'Part #', formatValue: (value) => formatValue('part_number', value) },
          { key: 'qty', label: 'Qty', formatValue: (value) => formatValue('qty', value), cellClassName: 'text-center' },
          { key: 'hrs', label: 'Hrs', formatValue: (value) => formatValue('hrs', value), cellClassName: 'text-center' },
          { key: 'parts_ea', label: 'Part Price', formatValue: (value) => formatCurrency(value), cellClassName: 'text-right' },
          { key: 'labour', label: 'Labour', formatValue: (value) => formatCurrency(value), cellClassName: 'text-right' },
          { key: 'total', label: 'Total', formatValue: (value) => formatCurrency(value), cellClassName: 'text-right' },
        ]}
      />

      {hasFinancialData && (
        <Card>
          <CardContent className="p-3 flex flex-wrap justify-around items-center gap-x-4 gap-y-3">
            <HistoryFinancialItem label="Parts Total" currentValue={currentData.parts_total} previousValue={previousData.parts_total} />
            <HistoryFinancialItem label="Labour Total" currentValue={currentData.labor_total} previousValue={previousData.labor_total} />
            <HistoryFinancialItem label="Shop Supplies" currentValue={currentData.shop_supply_total} previousValue={previousData.shop_supply_total} />
            <HistoryFinancialItem label="GST (5%)" currentValue={currentData.tax_amount} previousValue={previousData.tax_amount} />
            <HistoryFinancialItem label="Total" currentValue={currentData.total_amount} previousValue={previousData.total_amount} />
            <HistoryFinancialItem label="Payments" currentValue={currentData.amount_paid} previousValue={previousData.amount_paid} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}