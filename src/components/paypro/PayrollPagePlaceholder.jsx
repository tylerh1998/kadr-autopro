import React from 'react';
import { Construction } from 'lucide-react';

// Shared skeleton body for the 10 /paypro/* stub pages created in Phase 2.
// Each page replaces this with its real content in the phase named below.
export default function PayrollPagePlaceholder({ icon: Icon = Construction, title, phase }) {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
          <Icon className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-slate-500 dark:text-slate-400">This page's content ships in Phase {phase}.</p>
        </div>
      </div>

      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500">
        Coming in Phase {phase}
      </div>
    </div>
  );
}
