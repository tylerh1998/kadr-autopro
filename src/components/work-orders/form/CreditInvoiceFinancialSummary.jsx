import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

export default function CreditInvoiceFinancialSummary({ lineItems, selectedLines }) {
  // Only calculate totals for selected lines
  const selectedLineItems = lineItems.filter((_, index) => selectedLines[index]);

  const partsTotal = selectedLineItems.reduce((sum, item) => 
    sum + (parseFloat(item.tot_parts) || 0), 0);
  
  const laborTotal = selectedLineItems.reduce((sum, item) => 
    sum + (parseFloat(item.labour) || 0), 0);

  const otherChargesTotal = selectedLineItems.reduce((sum, item) => {
    // If it's an Other Charge line type, use total, otherwise use oc_total
    const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
    if (isOtherChargeLine) {
        return sum + (parseFloat(item.total) || 0);
    }
    return sum + (parseFloat(item.oc_total) || 0);
  }, 0);
  
  const shopSupplyTotal = laborTotal * 0.07;
  
  const subtotal = partsTotal + laborTotal + otherChargesTotal + shopSupplyTotal;

  // Calculate tax only on taxable items
  const taxableAmount = selectedLineItems.reduce((sum, item) => {
    if (item.taxable !== false) {
      const parts = parseFloat(item.tot_parts) || 0;
      const labor = parseFloat(item.labour) || 0;
      let other = parseFloat(item.oc_total) || 0;
      
      const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
      if (isOtherChargeLine) {
         other = parseFloat(item.total) || 0;
      }

      return sum + parts + labor + other;
    }
    return sum;
  }, 0);
  
  const taxableSubtotal = taxableAmount + shopSupplyTotal;
  const taxAmount = taxableSubtotal * 0.05; // 5% GST

  const grandTotal = subtotal + taxAmount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Credit Amount Summary
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Customer will be refunded the following amount
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
          {/* Parts Total */}
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Parts Total</p>
            <p className="text-2xl font-bold text-slate-900">
              ${partsTotal.toFixed(2)}
            </p>
          </div>

          {/* Labor Total */}
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Labor Total</p>
            <p className="text-2xl font-bold text-slate-900">
              ${laborTotal.toFixed(2)}
            </p>
          </div>

          {/* Other Charges */}
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Other Charges</p>
            <p className="text-2xl font-bold text-slate-900">
              ${otherChargesTotal.toFixed(2)}
            </p>
          </div>

          {/* Shop Supplies */}
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Shop Supplies (7%)</p>
            <p className="text-2xl font-bold text-slate-900">
              ${shopSupplyTotal.toFixed(2)}
            </p>
          </div>

          {/* Tax */}
          <div className="space-y-1">
            <p className="text-sm text-slate-600">GST (5%)</p>
            <p className="text-2xl font-bold text-slate-900">
              ${taxAmount.toFixed(2)}
            </p>
          </div>

          {/* Grand Total */}
          <div className="space-y-1 border-l-2 border-red-500 pl-6">
            <p className="text-sm text-slate-600 font-semibold">Credit Amount</p>
            <p className="text-3xl font-bold text-red-600">
              -${grandTotal.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            * This amount represents the total credit that will be issued to the customer. 
            The negative sign indicates this is a refund.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}