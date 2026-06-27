import React from 'react';
import NoteCard from './NoteCard';

export default function NoteColumn({ cards, onSelect }) {
  return (
    <div className="min-h-[520px] space-y-3">
      {cards.length > 0 ? (
        cards.map((card) => <NoteCard key={card.id} card={card} onSelect={onSelect} />)
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
          No notes in this column yet.
        </div>
      )}
    </div>
  );
}