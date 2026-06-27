import React from 'react';
import { Badge } from '@/components/ui/badge';
import NoteCard from './NoteCard';

export default function NoteColumn({ column, cards, onSelect }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-200/45 p-4 shadow-inner backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{column.title}</h3>
          <p className="text-xs text-slate-500">Notes board layout</p>
        </div>
        <Badge variant="secondary" className="bg-white text-slate-700 shadow-sm">
          {cards.length}
        </Badge>
      </div>

      <div className="min-h-[480px] space-y-3 rounded-[22px] border border-dashed border-white/70 bg-white/25 p-2">
        {cards.length > 0 ? (
          cards.map((card) => <NoteCard key={card.id} card={card} onSelect={onSelect} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-10 text-center text-sm text-slate-500">
            No notes in this column yet.
          </div>
        )}
      </div>
    </div>
  );
}