import React from 'react';

export default function NoteUtilityButton({ icon: Icon, label, disabled = true, onClick }) {
  const isInteractive = !disabled && typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition-colors ${isInteractive ? 'cursor-pointer hover:bg-slate-800' : 'cursor-default'}`}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}