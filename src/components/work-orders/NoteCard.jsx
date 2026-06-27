import React from 'react';
import { Car, FileText, MoreHorizontal, Palette, Pin, Share2, User } from 'lucide-react';
import NoteEntityButton from './note-card/NoteEntityButton';
import NoteUtilityButton from './note-card/NoteUtilityButton';
import NoteWorkOrderButton from './note-card/NoteWorkOrderButton';

const actionsDisabled = true;

const cardTheme = {
  wrapper: 'overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
  icon: 'text-slate-400',
  entityButton: 'border-slate-200 bg-slate-50',
  entityLabel: 'text-slate-500',
  entityValue: 'font-semibold text-slate-900',
  entityPlaceholder: 'text-slate-400',
  title: 'mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-700',
  body: 'mb-5 rounded-2xl border border-slate-200 bg-white p-4',
  bodyLabel: 'text-slate-600',
  bodyText: 'text-slate-700',
  divider: 'border-slate-200',
  utilityButton: 'border-slate-200 bg-white text-slate-500',
  utilityIcon: 'text-slate-500',
  workOrderLinked: 'border-blue-200 bg-blue-500 text-white',
  workOrderUnlinked: 'border-slate-300 bg-slate-50 text-slate-700'
};

export default function NoteCard({ card, onSelect }) {
  return (
    <article className={cardTheme.wrapper}>
      <div className="mb-4 flex items-center justify-end gap-3">
        <Pin className={`h-4 w-4 ${cardTheme.icon}`} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <NoteEntityButton
          icon={User}
          label="Customer"
          value={card.customer}
          placeholder="+ Add Customer"
          disabled={actionsDisabled}
          className={cardTheme.entityButton}
          labelClassName={cardTheme.entityLabel}
          valueClassName={cardTheme.entityValue}
          placeholderClassName={cardTheme.entityPlaceholder}
        />
        <NoteEntityButton
          icon={Car}
          label="Vehicle"
          value={card.vehicle}
          placeholder="+ Add Vehicle"
          disabled={actionsDisabled}
          className={cardTheme.entityButton}
          labelClassName={cardTheme.entityLabel}
          valueClassName={cardTheme.entityValue}
          placeholderClassName={cardTheme.entityPlaceholder}
        />
      </div>

      {card.title && <div className={cardTheme.title}>{card.title}</div>}

      <div className={cardTheme.body}>
        <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${cardTheme.bodyLabel}`}>
          <FileText className={`h-4 w-4 ${cardTheme.icon}`} />
          <span>Comments / Text Body</span>
        </div>
        <p className={`whitespace-pre-wrap text-sm leading-6 ${cardTheme.bodyText}`}>{card.comment}</p>
      </div>

      <div className={`flex items-center justify-between gap-3 border-t pt-4 ${cardTheme.divider}`}>
        <div className="flex items-center gap-2">
          <NoteUtilityButton icon={Share2} label="Share" disabled={actionsDisabled} className={cardTheme.utilityButton} iconClassName={cardTheme.utilityIcon} />
          <NoteUtilityButton icon={Palette} label="Colour" disabled={actionsDisabled} className={cardTheme.utilityButton} iconClassName={cardTheme.utilityIcon} />
          <NoteUtilityButton icon={MoreHorizontal} label="More" disabled={actionsDisabled} className={cardTheme.utilityButton} iconClassName={cardTheme.utilityIcon} />
        </div>

        <NoteWorkOrderButton
          workOrderNumber={card.woNumber}
          hasWorkOrder={card.hasWorkOrder}
          disabled={actionsDisabled}
          onClick={() => onSelect?.(card.workOrder)}
          linkedClassName={cardTheme.workOrderLinked}
          unlinkedClassName={cardTheme.workOrderUnlinked}
        />
      </div>
    </article>
  );
}