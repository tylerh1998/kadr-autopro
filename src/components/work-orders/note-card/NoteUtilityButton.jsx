import React from 'react';

export default function NoteUtilityButton({ icon: Icon, label, disabled = true, onClick, className = '', iconClassName = '' }) {
  const isInteractive = !disabled && typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      aria-disabled={!isInteractive}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${isInteractive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      title={label}
    >
      <Icon className={`h-4 w-4 ${iconClassName}`} />
    </button>
  );
}