import React from 'react';
import { Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from './financialDashboardUtils';

export default function BankAccountsSummaryReport({ data, cashPosition }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="w-5 h-5" />
          Bank Accounts Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-semibold text-slate-700">Account Name</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-700">Bank</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-700">Type</th>
                <th className="text-right p-3 text-sm font-semibold text-slate-700">Current Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((account) => (
                <tr key={account.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 text-sm font-medium text-slate-900">{account.name}</td>
                  <td className="p-3 text-sm text-slate-600">{account.bank_name}</td>
                  <td className="p-3 text-sm text-slate-600">{account.account_type}</td>
                  <td className="p-3 text-sm text-right font-semibold text-slate-900">{formatCurrency(account.current_balance)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td colSpan="3" className="p-3 text-sm font-bold text-slate-900">Total Cash Position</td>
                <td className="p-3 text-sm text-right font-bold text-slate-900">{formatCurrency(cashPosition)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}