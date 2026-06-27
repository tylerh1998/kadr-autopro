import React from 'react';
import { Car, FileText, MoreHorizontal, Palette, Pin, Share2, User } from 'lucide-react';
import NoteEntityButton from './note-card/NoteEntityButton';
import NoteUtilityButton from './note-card/NoteUtilityButton';
import NoteWorkOrderButton from './note-card/NoteWorkOrderButton';
import NoteColorPicker from './note-card/NoteColorPicker';

const actionsDisabled = true;

const cardThemes = {
  white: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-slate-400',
    entityButton: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    entityLabel: 'text-slate-500',
    entityValue: 'font-semibold text-slate-900',
    entityPlaceholder: 'text-slate-400',
    title: 'mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-700',
    body: 'mb-5 rounded-2xl border border-slate-200 bg-white p-4',
    bodyLabel: 'text-slate-600',
    bodyText: 'text-slate-700',
    divider: 'border-slate-200',
    utilityButton: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
    utilityIcon: 'text-slate-500',
    workOrderLinked: 'border-blue-200 bg-blue-500 text-white',
    workOrderUnlinked: 'border-slate-300 bg-slate-50 text-slate-700'
  },
  blue: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-blue-200 bg-blue-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-blue-400',
    entityButton: 'border-blue-200 bg-white hover:bg-blue-50',
    entityLabel: 'text-blue-600',
    entityValue: 'font-semibold text-slate-900',
    entityPlaceholder: 'text-blue-300',
    title: 'mb-4 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700',
    body: 'mb-5 rounded-2xl border border-blue-200 bg-white p-4',
    bodyLabel: 'text-blue-700',
    bodyText: 'text-slate-700',
    divider: 'border-blue-200',
    utilityButton: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-100',
    utilityIcon: 'text-blue-600',
    workOrderLinked: 'border-blue-200 bg-blue-500 text-white',
    workOrderUnlinked: 'border-blue-200 bg-white text-blue-700'
  },
  green: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-green-200 bg-green-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-green-400',
    entityButton: 'border-green-200 bg-white hover:bg-green-50',
    entityLabel: 'text-green-700',
    entityValue: 'font-semibold text-slate-900',
    entityPlaceholder: 'text-green-300',
    title: 'mb-4 rounded-2xl border border-green-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-green-700',
    body: 'mb-5 rounded-2xl border border-green-200 bg-white p-4',
    bodyLabel: 'text-green-700',
    bodyText: 'text-slate-700',
    divider: 'border-green-200',
    utilityButton: 'border-green-200 bg-white text-green-700 hover:bg-green-100',
    utilityIcon: 'text-green-700',
    workOrderLinked: 'border-green-200 bg-green-500 text-white',
    workOrderUnlinked: 'border-green-200 bg-white text-green-700'
  },
  yellow: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-yellow-200 bg-yellow-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-yellow-500',
    entityButton: 'border-yellow-200 bg-white hover:bg-yellow-50',
    entityLabel: 'text-yellow-700',
    entityValue: 'font-semibold text-slate-900',
    entityPlaceholder: 'text-yellow-400',
    title: 'mb-4 rounded-2xl border border-yellow-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-yellow-700',
    body: 'mb-5 rounded-2xl border border-yellow-200 bg-white p-4',
    bodyLabel: 'text-yellow-700',
    bodyText: 'text-slate-700',
    divider: 'border-yellow-200',
    utilityButton: 'border-yellow-200 bg-white text-yellow-700 hover:bg-yellow-100',
    utilityIcon: 'text-yellow-700',
    workOrderLinked: 'border-yellow-200 bg-yellow-500 text-white',
    workOrderUnlinked: 'border-yellow-200 bg-white text-yellow-700'
  },
  pink: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-pink-200 bg-pink-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-pink-400',
    entityButton: 'border-pink-200 bg-white hover:bg-pink-50',
    entityLabel: 'text-pink-700',
    entityValue: 'font-semibold text-slate-900',
    entityPlaceholder: 'text-pink-300',
    title: 'mb-4 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-pink-700',
    body: 'mb-5 rounded-2xl border border-pink-200 bg-white p-4',
    bodyLabel: 'text-pink-700',
    bodyText: 'text-slate-700',
    divider: 'border-pink-200',
    utilityButton: 'border-pink-200 bg-white text-pink-700 hover:bg-pink-100',
    utilityIcon: 'text-pink-700',
    workOrderLinked: 'border-pink-200 bg-pink-500 text-white',
    workOrderUnlinked: 'border-pink-200 bg-white text-pink-700'
  }
};

export default function NoteCard({ card, onSelect, onColourChange }) {
  const cardTheme = cardThemes[card.colour] || cardThemes.white;

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
          <NoteColorPicker
            icon={Palette}
            currentColour={card.colour}
            onSelect={(colour) => onColourChange?.(card.noteId, colour)}
            buttonClassName={cardTheme.utilityButton}
            buttonIconClassName={cardTheme.utilityIcon}
          />
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