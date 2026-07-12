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

const cleanText = (text) => {
  if (!text) return text;
  return String(text).replace(/^"|"$/g, '').trim();
};

export default function LankarWOLineItemsTable({ lineItems = [] }) {
  const sortedLineItems = [...lineItems].sort((a, b) => toNumber(a.linenum) - toNumber(b.linenum));

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100">
            <TableHead className="w-20 text-center font-bold text-slate-700">Qty</TableHead>
            <TableHead className="w-20 text-center font-bold text-slate-700">Hrs</TableHead>
            <TableHead className="font-bold text-slate-700">Description</TableHead>
            <TableHead className="w-28 text-right font-bold text-slate-700">Unit Price</TableHead>
            <TableHead className="w-24 text-right font-bold text-slate-700">Parts</TableHead>
            <TableHead className="w-24 text-right font-bold text-slate-700">Labor</TableHead>
            <TableHead className="w-24 text-right font-bold text-slate-700">Other</TableHead>
            <TableHead className="w-12 text-center font-bold text-slate-700">Tax</TableHead>
            <TableHead className="w-24 text-right font-bold text-slate-700">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedLineItems.map((line, index) => {
            const isEven = index % 2 === 0;
            const rowBgClass = isEven ? 'bg-white' : 'bg-slate-50';
            const isBold = String(line.LBold || '').toLowerCase() === 'true' || String(line.LBold || '').toLowerCase() === 'y';
            const boldClass = isBold ? 'font-bold' : '';
            const txValue = String(line.tx || '').trim().toUpperCase();
            const taxable = txValue === 'GST';

            return (
              <TableRow key={line.id || index} className={`${rowBgClass} hover:bg-slate-100 transition-colors`}>
                <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>{line.qty || '-'}</TableCell>
                <TableCell className={`w-20 p-2 align-top text-center ${boldClass}`}>{line.hrs || '-'}</TableCell>
                <TableCell className="min-w-0 flex-1 pr-2 p-2 align-top">
                  <div className="space-y-1">
                    <p className={`text-sm ${boldClass}`}>{cleanText(line.description) || '-'}</p>
                    {line.partnum && (
                      <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Part #:</span> {line.partnum}</p>
                    )}
                    {line.c !== null && line.c !== undefined && String(line.c).trim() !== '' && Number(line.c) !== 0 && (
                      <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Cores:</span> {line.c}</p>
                    )}
                    {line.partserial && (
                      <p className="text-xs text-slate-500 font-mono"><span className="font-medium text-slate-600 not-italic font-sans">Serial #:</span> {line.partserial}</p>
                    )}
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