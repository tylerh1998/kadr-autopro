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

export default function JsonToTableDisplay({ data }) {
  const entries = Object.entries(data || {});

  if (!entries.length) {
    return <p className="text-sm text-slate-500">No details available for this change.</p>;
  }

  return (
    <div className="space-y-6">
      {entries.map(([key, value]) => {
        if (key === 'line_items' && Array.isArray(value)) {
          return (
            <div key={key} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Line Items</h3>
              <WorkOrderViewLineItemsTable lineItems={value} workOrder={{ stage: 'work_order' }} />
            </div>
          );
        }

        return (
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
        );
      })}
    </div>
  );
}