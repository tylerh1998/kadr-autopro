import React from 'react';
import { Car, FileText, MoreHorizontal, Palette, Pin, Share2, User } from 'lucide-react';
import NoteEntityButton from './note-card/NoteEntityButton';
import NoteUtilityButton from './note-card/NoteUtilityButton';
import NoteWorkOrderButton from './note-card/NoteWorkOrderButton';

const actionsDisabled = true;

export default function NoteCard({ card, onSelect }) {
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[#171717] p-4 text-left text-white shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="mb-4 h-1.5 w-full rounded-full bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-400" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Note Card</span>
        <Pin className="h-4 w-4 text-slate-500" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <NoteEntityButton icon={User} label="Customer" value={card.customer} placeholder="+ Add Customer" disabled={actionsDisabled} />
        <NoteEntityButton icon={Car} label="Vehicle" value={card.vehicle} placeholder="+ Add Vehicle" disabled={actionsDisabled} />
      </div>

      {card.title && (
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">
          {card.title}
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
          <FileText className="h-4 w-4 text-slate-500" />
          <span>Comments / Text Body</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{card.comment}</p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <div className="flex items-center gap-2">
          <NoteUtilityButton icon={Share2} label="Share" disabled={actionsDisabled} />
          <NoteUtilityButton icon={Palette} label="Colour" disabled={actionsDisabled} />
          <NoteUtilityButton icon={MoreHorizontal} label="More" disabled={actionsDisabled} />
        </div>

        <NoteWorkOrderButton
          workOrderNumber={card.woNumber}
          hasWorkOrder={card.hasWorkOrder}
          disabled={actionsDisabled}
          onClick={() => onSelect?.(card.workOrder)}
        />
      </div>
    </article>
  );
}