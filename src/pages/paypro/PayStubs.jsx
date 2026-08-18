import React from 'react';
import { Receipt } from 'lucide-react';
import PayrollPagePlaceholder from '@/components/paypro/PayrollPagePlaceholder';

export default function PayStubs() {
  return <PayrollPagePlaceholder icon={Receipt} title="Pay Stubs" phase="6" />;
}
