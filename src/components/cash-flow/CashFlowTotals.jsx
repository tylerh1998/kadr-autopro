import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function CashFlowTotals({ rows }) {
  // Simple calculation logic for now
  const totalAmount = rows.reduce((sum, row) => {
    const val = parseFloat(row.amount) || 0;
    return sum + val;
  }, 0);

  const totalPaid = rows.reduce((sum, row) => {
    if (row.datePaid) { // Assuming if datePaid is set, it's paid
      const val = parseFloat(row.amount) || 0;
      return sum + val;
    }
    return sum;
  }, 0);

  const totalDue = totalAmount - totalPaid;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-slate-700">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Total In List</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</p>
            </div>
            
            <Separator />
            
            <div>
              <p className="text-sm font-medium text-slate-500">Total Paid</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-slate-500">Outstanding Due</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-700">
        <p className="font-semibold mb-1">Note:</p>
        <p>This section will calculate totals based on the table entries. Currently showing basic sum of all amounts.</p>
      </div>
    </div>
  );
}