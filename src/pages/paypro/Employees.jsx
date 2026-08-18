import React from 'react';
import { Users } from 'lucide-react';
import PayrollPagePlaceholder from '@/components/paypro/PayrollPagePlaceholder';

export default function Employees() {
  return <PayrollPagePlaceholder icon={Users} title="Employees" phase="3" />;
}
