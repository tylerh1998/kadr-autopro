import React from 'react';
import { UserCheck } from 'lucide-react';
import PayrollPagePlaceholder from '@/components/paypro/PayrollPagePlaceholder';

export default function EditEmployee() {
  return <PayrollPagePlaceholder icon={UserCheck} title="Edit Employee" phase="3" />;
}
