import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

const FinancialItem = ({ label, value, className = '' }) => (
  <div className={`text-center px-4 py-2 rounded-lg ${className}`}>
    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
    <p className="text-xl font-bold text-slate-800">{value}</p>
  </div>
);

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

export default function LankarWOFinancialSummary({ info, lineItems = [] }) {
  const totals = useMemo(() => {
    const partsTotal = lineItems.reduce((sum, item) => sum + toNumber(item.totparts), 0);
    const laborTotal = lineItems.reduce((sum, item) => sum + toNumber(item.labour), 0);
    const otherChargesTotal = lineItems.reduce((sum, item) => sum + toNumber(item.otherchargeamt), 0);
    const taxableSubtotal = lineItems.reduce((sum, item) => {
      const txValue = String(item.tx || '').trim().toUpperCase();
      if (txValue !== 'GST') return sum;
      return sum + toNumber(item.totparts) + toNumber(item.labour) + toNumber(item.otherchargeamt);
    }, 0);
    const gstTotal = taxableSubtotal * 0.05;
    const subtotal = toNumber(info?.screensubtotal) || (partsTotal + laborTotal + otherChargesTotal);
    const discount = toNumber(info?.screentotdiscount);
    const total = toNumber(info?.totalinvoiceamt);
    return { partsTotal, laborTotal, otherChargesTotal, subtotal, discount, gstTotal, total };
  }, [info, lineItems]);

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap justify-around items-center gap-x-6 gap-y-2">
        <FinancialItem label="Parts Total" value={`$${totals.partsTotal.toFixed(2)}`} />
        <FinancialItem label="Labour Total" value={`$${totals.laborTotal.toFixed(2)}`} />
        <FinancialItem label="Other Charges" value={`$${totals.otherChargesTotal.toFixed(2)}`} />
        <FinancialItem label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
        <FinancialItem label="Discount" value={`$${totals.discount.toFixed(2)}`} />
        <FinancialItem label="GST" value={`$${totals.gstTotal.toFixed(2)}`} />
        <FinancialItem label="Total" value={`$${totals.total.toFixed(2)}`} className="bg-slate-100" />
      </CardContent>
    </Card>
  );
}