import React from 'react';
import { FileText, Link2 } from 'lucide-react';

export default function NoteWorkOrderButton({ workOrderNumber, hasWorkOrder, disabled = true, onClick, linkedClassName = '', unlinkedClassName = '' }) {
  const isInteractive = !disabled && typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${isInteractive ? 'cursor-pointer' : 'cursor-default'} ${hasWorkOrder ? linkedClassName : unlinkedClassName}`}
    >
      {hasWorkOrder ? <FileText className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      <span>{hasWorkOrder ? `WO# ${workOrderNumber}` : 'Connect WO'}</span>
    </button>
  );
}