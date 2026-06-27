import React from 'react';

export default function NoteEntityButton({ icon: Icon, label, value, placeholder, disabled = true, onClick, className = '', labelClassName = '', valueClassName = '', placeholderClassName = '' }) {
  const isInteractive = !disabled && typeof onClick === 'function';
  const displayValue = value || placeholder;

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`w-full rounded-2xl border p-3 text-left transition-colors ${isInteractive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      <div className={`mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] ${labelClassName}`}>
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className={`truncate text-sm ${value ? valueClassName : placeholderClassName}`}>
        {displayValue}
      </p>
    </button>
  );
}