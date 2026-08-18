import React from 'react';
import { Settings } from 'lucide-react';
import PayrollPagePlaceholder from '@/components/paypro/PayrollPagePlaceholder';

export default function Setup() {
  return <PayrollPagePlaceholder icon={Settings} title="Payroll Setup" phase="3" />;
}
