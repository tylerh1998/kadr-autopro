import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import WorkOrderViewLineItemsTable from '../form/WorkOrderViewLineItemsTable';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';

function isDateLikeKey(key) {
  return key.toLowerCase().includes('date') || key.toLowerCase().includes('time') || key.toLowerCase().includes('updated_at') || key.toLowerCase().includes('changed_at');
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

export default function JsonToTableDisplay({ data }) {
  const rawEntries = Object.entries(data || {}).filter(([key]) => key !== 'last_updated');
  const lineItemsEntry = rawEntries.find(([key]) => key === 'line_items');
  const otherEntries = rawEntries.filter(([key]) => key !== 'line_items');

  if (!rawEntries.length) {
    return <p className="text-sm text-slate-500">No details available for this change.</p>;
  }

  let parsedLineItems = null;
  if (lineItemsEntry) {
    parsedLineItems = lineItemsEntry[1];
    if (typeof parsedLineItems === 'string') {
      try {
        parsedLineItems = JSON.parse(parsedLineItems);
      } catch {
        parsedLineItems = null;
      }
    }
    if (Array.isArray(parsedLineItems)) {
      parsedLineItems = parsedLineItems.map(normalizeHistoryLineItem);
    }
  }

  return (
    <div className="space-y-6">
      {otherEntries.map(([key, value]) => (
        <div key={key} className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Field</TableHead>
                <TableHead>New Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium align-top">{key}</TableCell>
                <TableCell className="align-top whitespace-pre-wrap break-words">{formatValue(key, value)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ))}

      {Array.isArray(parsedLineItems) && (
        <div key="line_items" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Line Items</h3>
          <WorkOrderViewLineItemsTable lineItems={parsedLineItems} workOrder={{ stage: 'work_order' }} />
        </div>
      )}
    </div>
  );
}