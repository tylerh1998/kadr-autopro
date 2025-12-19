import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

// A small sub-component for consistently styled financial figures
const FinancialItem = ({ label, value, className = '', onClick }) => (
  <div 
    className={`text-center px-4 py-2 rounded-lg ${className} ${onClick ? 'cursor-pointer hover:bg-opacity-80 transition-all active:scale-95' : ''}`}
    onClick={onClick}
  >
    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
    <p className="text-xl font-bold text-slate-800">{value}</p>
  </div>
);

export default function WorkOrderViewFinancialSummary({ lineItems = [], workOrder = {}, onPaymentsClick }) {
  // Calculate charge totals from line items with GST logic
  const { partsTotal, laborTotal, otherChargesTotal, shopSupplyTotal, taxAmount, grandTotal } = useMemo(() => {
    const parts = lineItems.reduce((sum, item) => sum + (parseFloat(item.tot_parts) || 0), 0);
    const labor = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
    const otherCharges = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
    
    const grandTotalBeforeTax = parts + labor + otherCharges;
    const shopSupplies = labor * 0.07;

    let totalTaxableBase = 0;
    lineItems.forEach(item => {
      if (item.taxable === true) {
        totalTaxableBase += (parseFloat(item.total) || 0);
      }
    });

    const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
      if (item.taxable === true) {
        return sum + (parseFloat(item.labour) || 0);
      }
      return sum;
    }, 0);

    const taxableShopSupplies = taxableLaborForShopSupply * 0.07;
    totalTaxableBase += taxableShopSupplies;

    const tax = totalTaxableBase * 0.05;
    const total = grandTotalBeforeTax + shopSupplies + tax;

    return { 
      partsTotal: parts, 
      laborTotal: labor, 
      otherChargesTotal: otherCharges,
      shopSupplyTotal: shopSupplies, 
      taxAmount: tax, 
      grandTotal: total 
    };
  }, [lineItems]);

  // Calculate payment totals from workOrder.payments JSON string
  const { amountPaid, balanceDue } = useMemo(() => {
    let payments = [];
    try {
      payments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
      if (!Array.isArray(payments)) payments = [];
    } catch (e) {
      console.error("Failed to parse payments JSON in WorkOrderViewFinancialSummary:", e);
      payments = [];
    }
    
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const due = grandTotal - paid;

    return { amountPaid: paid, balanceDue: due };
  }, [workOrder.payments, grandTotal]);

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap justify-around items-center gap-x-6 gap-y-2">
        <FinancialItem label="Parts Total" value={`$${partsTotal.toFixed(2)}`} />
        <FinancialItem label="Labour Total" value={`$${laborTotal.toFixed(2)}`} />
        <FinancialItem label="Other Charges" value={`$${otherChargesTotal.toFixed(2)}`} />
        <FinancialItem label="Shop Supplies" value={`$${shopSupplyTotal.toFixed(2)}`} />
        <FinancialItem label="GST (5%)" value={`$${taxAmount.toFixed(2)}`} />
        
        <div className="w-px h-10 bg-slate-200 hidden md:block" />

        <FinancialItem label="Total" value={`$${grandTotal.toFixed(2)}`} className="bg-slate-100" />
        <FinancialItem 
          label="Payments" 
          value={`$${amountPaid.toFixed(2)}`} 
          className="text-green-700 hover:bg-green-50" 
          onClick={onPaymentsClick}
        />
        <FinancialItem label="Amount Owing" value={`$${balanceDue.toFixed(2)}`} className={`font-extrabold ${balanceDue > 0.005 ? 'text-red-700' : 'text-slate-900'}`} />
      </CardContent>
    </Card>
  );
}