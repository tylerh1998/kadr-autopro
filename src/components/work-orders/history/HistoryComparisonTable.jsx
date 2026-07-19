import React, { useMemo } from 'react';
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

export default function HistoryComparisonTable({
  title,
  columns = [],
  currentRows = [],
  previousRows = [],
  getRowKey,
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
      return {
        rowKey,
        currentRow,
        previousRow: previousMap.get(rowKey) || null,
      };
    });

    const removedRows = (previousRows || [])
      .filter((previousRow, index) => !currentKeys.has(getRowKey(previousRow, index)))
      .map((previousRow, index) => ({
        rowKey: `removed-${getRowKey(previousRow, index)}`,
        currentRow: null,
        previousRow,
      }));

    return [...activeRows, ...removedRows].filter(({ currentRow, previousRow }) => {
      if (!currentRow || !previousRow) return true;
      return columns.some((column) => {
        const previousValue = column.getValue ? column.getValue(previousRow) : previousRow?.[column.key];
        const currentValue = column.getValue ? column.getValue(currentRow) : currentRow?.[column.key];
        return !valuesEqual(previousValue, currentValue);
      });
    });
  }, [currentRows, previousRows, getRowKey, columns]);

  if (!displayRows.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</h3>
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
            {displayRows.map(({ rowKey, currentRow, previousRow }) => (
              <TableRow key={rowKey}>
                {columns.map((column) => {
                  const previousValue = column.getValue ? column.getValue(previousRow) : previousRow?.[column.key];
                  const currentValue = column.getValue ? column.getValue(currentRow) : currentRow?.[column.key];
                  const cellChanged = !valuesEqual(previousValue, currentValue);
                  const previousDisplay = column.formatValue ? column.formatValue(previousValue, previousRow) : formatDisplayValue(previousValue);
                  const currentDisplay = column.formatValue ? column.formatValue(currentValue, currentRow) : formatDisplayValue(currentValue);
                  const displayValue = cellChanged ? `${previousDisplay} --> ${currentDisplay}` : currentDisplay;

                  return (
                    <TableCell
                      key={column.key}
                      className={`align-top whitespace-pre-wrap break-words ${column.cellClassName || ''}`}
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