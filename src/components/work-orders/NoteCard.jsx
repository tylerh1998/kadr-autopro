import React from 'react';
import { Car, FileText, User } from 'lucide-react';

export default function NoteCard({ card, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(card.workOrder)}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow transition-colors hover:bg-slate-50"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Note Card</p>
          <h4 className="mt-1 text-base font-bold text-slate-900">{card.title}</h4>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">WO# {card.woNumber}</span>
      </div>

      <div className="space-y-2.5 text-sm text-slate-600">
        <p className="flex items-center gap-2">
          <User className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-800">{card.customer}</span>
        </p>
        <p className="flex items-center gap-2">
          <Car className="h-4 w-4 text-slate-400" />
          <span>{card.vehicle}</span>
        </p>
        <div className="flex items-start gap-2 pt-1">
          <FileText className="mt-0.5 h-4 w-4 text-slate-400" />
          <span className="leading-6 text-slate-600">{card.comment}</span>
        </div>
      </div>
    </button>
  );
}