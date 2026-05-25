import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle, XCircle } from 'lucide-react';

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

export default function LankarWOLineItemsTable({ lineItems = [] }) {
  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100">
            <TableHead className="w-20 text-center text-xs font-semibold p-2">Qty</TableHead>
            <TableHead className="w-20 text-center text-xs font-semibold p-2">Hrs</TableHead>
            <TableHead className="min-w-0 text-left text-xs font-semibold p-2">Description</TableHead>
            <TableHead className="w-28 text-center text-xs font-semibold p-2">Parts<br />Ea.</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Tot.<br />Parts</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Labour</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Other</TableHead>
            <TableHead className="w-12 text-center text-xs font-semibold p-2">Tx</TableHead>
            <TableHead className="w-24 text-right text-xs font-semibold p-2">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.map((line, index) => {
            const isEven = index % 2 === 0;
            const rowBgClass = isEven ? 'bg-white' : 'bg-slate-50';
            const isBold = String(line.LBold || '').toLowerCase() === 'true' || String(line.LBold || '').toLowerCase() === 'y';
            const boldClass = isBold ? 'font-bold' : '';
            const taxable = String(line.tx || '').toLowerCase() === 'y' || String(line.tx || '').toLowerCase() === 'true';

            return (
              <TableRow key={line.id || index} className={`${rowBgClass} hover:bg-slate-100 transition-colors`}>
                <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>{line.qty || '-'}</TableCell>
                <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>{line.hrs || '-'}</TableCell>
                <TableCell className="min-w-0 flex-1 pr-2 p-2 align-top">
                  <div className="space-y-1">
                    <p className={`text-sm ${boldClass}`}>{line.description || '-'}</p>
                    {line.partserial && <p className="text-xs text-slate-500 font-mono">{line.partserial}</p>}
                  </div>
                </TableCell>
                <TableCell className={`w-28 p-2 align-top text-right ${boldClass}`}>${toNumber(line.partsea).toFixed(2)}</TableCell>
                <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>${toNumber(line.totparts).toFixed(2)}</TableCell>
                <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>${toNumber(line.labour).toFixed(2)}</TableCell>
                <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>${toNumber(line.otherchargeamt).toFixed(2)}</TableCell>
                <TableCell className="w-12 p-2 align-top text-center">
                  {taxable ? <CheckCircle className="w-4 h-4 text-green-600 mx-auto" /> : <XCircle className="w-4 h-4 text-red-600 mx-auto" />}
                </TableCell>
                <TableCell className={`w-24 text-right text-sm p-2 align-top ${boldClass}`}>${toNumber(line.total).toFixed(2)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}