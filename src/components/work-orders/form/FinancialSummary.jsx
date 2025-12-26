import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

// A small sub-component for consistently styled financial figures
const FinancialItem = ({ label, value, className = '' }) => (
  <div className={`text-center px-4 py-2 rounded-lg ${className}`}>
    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
    <p className="text-xl font-bold text-slate-800">{value}</p>
  </div>
);

export default function FinancialSummary({ lineItems = [], workOrder = {}, shopSupplyRate = 0.07 }) {
  // Calculate charge totals from line items with new GST logic
  const { partsTotal, laborTotal, otherChargesTotal, shopSupplyTotal, taxAmount, grandTotal } = useMemo(() => {
    // Step 1: Calculate Parts Total, Labor Total, and Other Charges Total separately
    const parts = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const partsEa = parseFloat(item.parts_ea) || 0;
      const coreNum = parseFloat(item.Core_num) || 0;
      const coreRet = parseFloat(item.core_ret) || 0;
      const coreCost = parseFloat(item.core_cost) || 0;
      const coreOsamt = (coreNum - coreRet) * coreCost;
      
      return sum + (qty * partsEa) + coreOsamt;
    }, 0);
    
    const labor = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
    const otherCharges = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
    
    // Step 2: Calculate Grand Total Before Tax
    const grandTotalBeforeTax = parts + labor + otherCharges;

    // Step 3: Calculate Shop Supply Total (using passed rate)
    const shopSupplies = labor * shopSupplyRate;

    // Step 4: Calculate Taxable Base for GST
    let totalTaxableBase = 0;
    
    // Sum up the 'total' field of all taxable line items (including other charges)
    lineItems.forEach(item => {
      if (item.taxable === true) {
        const qty = parseFloat(item.qty) || 0;
        const partsEa = parseFloat(item.parts_ea) || 0;
        const labour = parseFloat(item.labour) || 0;
        const coreNum = parseFloat(item.Core_num) || 0;
        const coreRet = parseFloat(item.core_ret) || 0;
        const coreCost = parseFloat(item.core_cost) || 0;
        const coreOsamt = (coreNum - coreRet) * coreCost;
        const ocTotal = parseFloat(item.oc_total) || 0; // <-- Include Other Charges
        
        const totParts = (qty * partsEa) + coreOsamt;
        const total = totParts + labour + ocTotal; // <-- KEY FIX: Include oc_total in taxable base
        
        totalTaxableBase += total;
      }
    });

    // Calculate taxable labor for shop supply calculation
    const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
      if (item.taxable === true) {
        return sum + (parseFloat(item.labour) || 0);
      }
      return sum;
    }, 0);

    // Add taxable shop supplies to the taxable base
    const taxableShopSupplies = taxableLaborForShopSupply * shopSupplyRate;
    totalTaxableBase += taxableShopSupplies;

    // Step 5: Calculate GST (5% of Total Taxable Base)
    const tax = totalTaxableBase * 0.05;

    // Step 6: Calculate Grand Total
    const total = grandTotalBeforeTax + shopSupplies + tax;

    console.log('=== FINANCIAL_SUMMARY CALCULATION ===');
    console.log('Parts Total:', parts);
    console.log('Labor Total:', labor);
    console.log('Other Charges Total:', otherCharges);
    console.log('Shop Supplies Total:', shopSupplies);
    console.log('Total Taxable Base:', totalTaxableBase);
    console.log('Tax Amount:', tax);
    console.log('FINANCIAL_SUMMARY: grandTotal =', total);
    console.log('Line Items:', lineItems);
    console.log('=====================================');

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
      console.error("Failed to parse payments JSON in FinancialSummary:", e);
      payments = [];
    }
    
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const due = grandTotal - paid;

    return { amountPaid: paid, balanceDue: due };
  }, [workOrder.payments, grandTotal]);

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap justify-around items-center gap-x-6 gap-y-2">
        <FinancialItem label="Parts Total" value={`$${(partsTotal || 0).toFixed(2)}`} />
        <FinancialItem label="Labour Total" value={`$${(laborTotal || 0).toFixed(2)}`} />
        <FinancialItem label="Other Charges" value={`$${(otherChargesTotal || 0).toFixed(2)}`} />
        <FinancialItem label="Shop Supplies" value={`$${(shopSupplyTotal || 0).toFixed(2)}`} />
        <FinancialItem label="GST (5%)" value={`$${(taxAmount || 0).toFixed(2)}`} />
        
        <div className="w-px h-10 bg-slate-200 hidden md:block" />

        <FinancialItem label="Total" value={`$${(grandTotal || 0).toFixed(2)}`} className="bg-slate-100" />
        <FinancialItem label="Payments" value={`$${(amountPaid || 0).toFixed(2)}`} className="text-green-700" />
        <FinancialItem label="Amount Owing" value={`$${(balanceDue || 0).toFixed(2)}`} className={`font-extrabold ${balanceDue > 0.005 ? 'text-red-700' : 'text-slate-900'}`} />
      </CardContent>
    </Card>
  );
}