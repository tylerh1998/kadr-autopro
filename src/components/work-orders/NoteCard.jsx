import React from 'react';
import { Car, FileText, User } from 'lucide-react';

export default function NoteCard({ card, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(card.workOrder)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-md shadow-slate-300/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Note Card</p>
          <h4 className="mt-1 text-sm font-semibold text-slate-900">{card.title}</h4>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">WO# {card.woNumber}</span>
      </div>

      <div className="space-y-2 text-xs text-slate-600">
        <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /><span>{card.customer}</span></div>
        <div className="flex items-center gap-2"><Car className="h-3.5 w-3.5" /><span>{card.vehicle}</span></div>
        <div className="flex items-start gap-2"><FileText className="mt-0.5 h-3.5 w-3.5" /><span className="leading-5 text-slate-500">{card.comment}</span></div>
      </div>
    </button>
  );
}