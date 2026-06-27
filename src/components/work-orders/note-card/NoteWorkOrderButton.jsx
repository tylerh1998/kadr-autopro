import React from 'react';
import { FileText, Link2 } from 'lucide-react';

export default function NoteWorkOrderButton({ workOrderNumber, hasWorkOrder, disabled = true, onClick }) {
  const isInteractive = !disabled && typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${hasWorkOrder ? 'border-blue-400/40 bg-blue-500 text-white' : 'border-slate-600 bg-transparent text-slate-200'} ${isInteractive ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
    >
      {hasWorkOrder ? <FileText className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      <span>{hasWorkOrder ? `WO# ${workOrderNumber}` : 'Connect WO'}</span>
    </button>
  );
}