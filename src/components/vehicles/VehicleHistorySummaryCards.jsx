import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, DollarSign, Edit3, Printer } from 'lucide-react';
import { getVehicleHistoryStats } from './vehicleHistoryUtils';

const currencyFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD'
});

const ActionCard = ({ icon: Icon, label, onClick }) => (
  <Card className="bg-slate-900 text-white border-slate-900 cursor-pointer transition-colors hover:bg-slate-800 no-print" onClick={onClick}>
    <CardContent className="p-4 flex items-center gap-3">
      <Icon className="w-5 h-5" />
      <span className="font-semibold">{label}</span>
    </CardContent>
  </Card>
);

export default function VehicleHistorySummaryCards({
  workOrders = [],
  onEdit,
  onPrint,
  gridClassName = 'md:grid-cols-4'
}) {
  const { activeRoCount, voidCount, totalWork } = getVehicleHistoryStats(workOrders);

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridClassName}`}>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Number of ROs
          </p>
          <p className="mt-2 text-3xl font-bold text-blue-600">{activeRoCount}</p>
          <p className="text-xs text-slate-500">{voidCount} void</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Total Work
          </p>
          <p className="mt-2 text-3xl font-bold text-green-600">{currencyFormatter.format(totalWork)}</p>
          <p className="text-xs text-slate-500">Excludes estimates and void</p>
        </CardContent>
      </Card>

      <ActionCard icon={Edit3} label="Edit Vehicle" onClick={onEdit} />
      <ActionCard icon={Printer} label="Print History" onClick={onPrint} />
    </div>
  );
}