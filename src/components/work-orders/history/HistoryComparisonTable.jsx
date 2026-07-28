import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function getRowState(currentRow, previousRow, columns, extraTrackedKeys = []) {
  if (currentRow && !previousRow) return 'added';
  if (!currentRow && previousRow) return 'deleted';
  
  const hasColumnChanges = columns.some((column) => {
    const previousValue = column.getValue ? column.getValue(previousRow) : previousRow?.[column.key];
    const currentValue = column.getValue ? column.getValue(currentRow) : currentRow?.[column.key];
    return !valuesEqual(previousValue, currentValue);
  });
  if (hasColumnChanges) return 'changed';

  const hasExtraChanges = extraTrackedKeys.some((key) => {
    return !valuesEqual(previousRow?.[key], currentRow?.[key]);
  });
  return hasExtraChanges ? 'changed' : 'unchanged';
}

function getRowClasses(rowState) {
  if (rowState === 'added') return 'bg-emerald-50 hover:bg-emerald-50';
  if (rowState === 'changed') return 'bg-amber-50 hover:bg-amber-50';
  if (rowState === 'deleted') return 'bg-rose-50 hover:bg-rose-50';
  return '';
}

export default function HistoryComparisonTable({
  title,
  columns = [],
  currentRows = [],
  previousRows = [],
  getRowKey,
  showAllCurrentRows = false,
  showLegend = false,
  extraTrackedKeys = [],
}) {
  const displayRows = useMemo(() => {
    const previousMap = new Map();
    const currentKeys = new Set();

    (previousRows || []).forEach((row, index) => {
      previousMap.set(getRowKey(row, index), row);
    });

    const activeRows = (currentRows || []).map((currentRow, index) => {
      const rowKey = getRowKey(currentRow, index);
      currentKeys.add(rowKey);
      const previousRow = previousMap.get(rowKey) || null;
      return {
        rowKey,
        currentRow,
        previousRow,
        rowState: getRowState(currentRow, previousRow, columns, extraTrackedKeys),
      };
    });

    const removedRows = (previousRows || [])
      .filter((previousRow, index) => !currentKeys.has(getRowKey(previousRow, index)))
      .map((previousRow, index) => ({
        rowKey: `removed-${getRowKey(previousRow, index)}`,
        currentRow: null,
        previousRow,
        rowState: 'deleted',
      }));

    const rows = [...activeRows, ...removedRows];
    return showAllCurrentRows ? rows : rows.filter((row) => row.rowState !== 'unchanged');
  }, [currentRows, previousRows, getRowKey, columns, showAllCurrentRows, extraTrackedKeys]);

  if (!displayRows.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</h3>
        {showLegend && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Added</Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Changed</Badge>
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Deleted</Badge>
          </div>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName || ''}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map(({ rowKey, currentRow, previousRow, rowState }) => (
              <TableRow key={rowKey} className={getRowClasses(rowState)}>
                {columns.map((column) => {
                  const sourceRow = currentRow || previousRow;
                  const sourceValue = currentRow
                    ? (column.getValue ? column.getValue(currentRow) : currentRow?.[column.key])
                    : (column.getValue ? column.getValue(previousRow) : previousRow?.[column.key]);
                  const displayValue = column.formatValue
                    ? column.formatValue(sourceValue, sourceRow)
                    : formatDisplayValue(sourceValue);

                  return (
                    <TableCell
                      key={column.key}
                      className={`align-top whitespace-pre-wrap break-words ${rowState === 'deleted' ? 'line-through text-slate-500' : ''} ${column.cellClassName || ''}`}
                    >
                      {displayValue}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}