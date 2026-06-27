import React from 'react';
import { Badge } from '@/components/ui/badge';
import NoteCard from './NoteCard';

export default function NoteColumn({ column, cards, onSelect }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">{column.title}</h3>
          <p className="text-xs text-slate-500">Display lane</p>
        </div>
        <Badge variant="secondary" className="bg-white text-slate-700 shadow-sm">
          {cards.length}
        </Badge>
      </div>

      <div className="min-h-[520px] space-y-3">
        {cards.length > 0 ? (
          cards.map((card) => <NoteCard key={card.id} card={card} onSelect={onSelect} />)
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            No notes in this column yet.
          </div>
        )}
      </div>
    </div>
  );
}