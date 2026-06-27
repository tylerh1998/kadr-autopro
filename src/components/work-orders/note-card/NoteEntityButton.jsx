import React from 'react';

export default function NoteEntityButton({ icon: Icon, label, value, placeholder, disabled = true, onClick }) {
  const isInteractive = !disabled && typeof onClick === 'function';
  const displayValue = value || placeholder;

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-left transition-colors ${isInteractive ? 'cursor-pointer hover:bg-slate-800' : 'cursor-default'}`}
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className={`truncate text-sm ${value ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>
        {displayValue}
      </p>
    </button>
  );
}