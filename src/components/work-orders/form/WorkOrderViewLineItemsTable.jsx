import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function WorkOrderViewLineItemsTable({
  lineItems,
  onReturnForWarranty,
  workOrder,
}) {
  // Pre-filter visible items to ensure alternating colors work correctly
  const visibleLineItems = lineItems.filter(line => {
    const isEmptyLine = !line.description && (!line.part_number || line.part_number.trim() === '') && !line.qty && !line.hrs && !line.parts_ea;
    return !isEmptyLine;
  });

  const renderLineItem = (line, index) => {
    const hasPartNumber = line.part_number && line.part_number.trim() !== '';
    
    // Zebra striping
    const isEven = index % 2 === 0;
    const rowBgClass = isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50';

    // Determine if line should be bold
    const isBold = line.bold === true;
    const boldClass = isBold ? 'font-bold' : '';

    // Calculate core_osamt for display
    const coreNum = parseFloat(line.Core_num) || 0;
    const coreRet = parseFloat(line.core_ret) || 0;
    const coreCost = parseFloat(line.core_cost) || 0;
    const coreOutstanding = coreNum - coreRet;
    const coreOsamt = coreOutstanding * coreCost;

    const rowContent = (
      <TableRow key={line.id || index} className={`${rowBgClass} hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`}>
        {/* Qty Column */}
        <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>
          {line.qty || '-'}
        </TableCell>

        {/* Hrs Column */}
        <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>
          {line.hrs || '-'}
        </TableCell>

        {/* Description Column */}
        <TableCell className="min-w-0 flex-1 pr-2 p-2 align-top">
          <div className="space-y-1">
            <p className={`text-sm ${boldClass}`}>{line.description || '-'}</p>
            {hasPartNumber && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono">{line.part_number}</span>
                {coreOutstanding > 0 && (
                  <Badge variant="outline" className="px-1 py-0 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 whitespace-nowrap">
                    Cores ({coreOutstanding}) - ${coreOsamt.toFixed(2)}
                  </Badge>
                )}
                {line.qty_on_order > 0 && (
                  <Badge variant="outline" className="px-1 py-0 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                    On Order {line.qty_on_order}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </TableCell>

        {/* Parts Ea Column */}
        <TableCell className={`w-28 p-2 align-top text-right ${boldClass}`}>
          ${(line.parts_ea || 0).toFixed(2)}
        </TableCell>

        {/* Unit Column */}
        <TableCell className={`w-16 p-2 align-top text-center text-sm text-slate-600 dark:text-slate-400 ${boldClass}`}>
          {line.unit || ''}
        </TableCell>

        {/* Tot. Parts Column */}
        <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>
          ${(line.tot_parts || 0).toFixed(2)}
        </TableCell>

        {/* Labour Column */}
        <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>
          ${(line.labour || 0).toFixed(2)}
        </TableCell>

        {/* Tx Column */}
        <TableCell className="w-12 p-2 align-top text-center">
          {line.taxable !== false ? (
            <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 mx-auto" />
          )}
        </TableCell>

        {/* Total Column */}
        <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>
          ${(line.total || 0).toFixed(2)}
        </TableCell>
      </TableRow>
    );

    // Only wrap in ContextMenu if it's a part line and we're in invoice stage and we have the handler
    if (hasPartNumber && workOrder?.stage === 'invoice' && onReturnForWarranty) {
      return (
        <ContextMenu key={line.id || index}>
          <ContextMenuTrigger asChild>
            {rowContent}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onReturnForWarranty(line)}>
              Return for Warranty
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return rowContent;
  };

  return (
    <div className="border dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 dark:bg-slate-800">
            <TableHead className="w-20 text-center text-xs font-semibold p-2">Qty</TableHead>
            <TableHead className="w-20 text-center text-xs font-semibold p-2">Hrs</TableHead>
            <TableHead className="min-w-0 text-left text-xs font-semibold p-2">Description</TableHead>
            <TableHead className="w-28 text-center text-xs font-semibold p-2">Parts<br />Ea.</TableHead>
            <TableHead className="w-16 text-center text-xs font-semibold p-2">Unit</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Tot.<br />Parts</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Labour</TableHead>
            <TableHead className="w-12 text-center text-xs font-semibold p-2">Tx</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleLineItems.map((line, index) => renderLineItem(line, index))}
        </TableBody>
      </Table>
    </div>
  );
}