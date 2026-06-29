import React from 'react';
import { GripVertical, MoreHorizontal, Palette, Share2 } from 'lucide-react';
import NoteUtilityButton from './note-card/NoteUtilityButton';
import NoteColorPicker from './note-card/NoteColorPicker';
import NoteEditableContent from './note-card/NoteEditableContent';

const actionsDisabled = true;

const cardThemes = {
  white: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-slate-400',
    body: 'mb-4 rounded-2xl border border-slate-200 bg-white p-4',
    bodyText: 'text-slate-700',
    divider: 'border-slate-200',
    utilityButton: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
    utilityIcon: 'text-slate-500',
    headerTitle: 'text-sm font-semibold text-slate-900',
    headerSubtitle: 'text-sm text-slate-600',
    headerLink: 'hover:bg-slate-50'
  },
  blue: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-blue-200 bg-blue-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-blue-400',
    body: 'mb-4 rounded-2xl border border-blue-200 bg-white p-4',
    bodyText: 'text-slate-700',
    divider: 'border-blue-200',
    utilityButton: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-100',
    utilityIcon: 'text-blue-600',
    headerTitle: 'text-sm font-semibold text-slate-900',
    headerSubtitle: 'text-sm text-slate-700',
    headerLink: 'hover:bg-blue-100/60'
  },
  green: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-green-200 bg-green-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-green-400',
    body: 'mb-4 rounded-2xl border border-green-200 bg-white p-4',
    bodyText: 'text-slate-700',
    divider: 'border-green-200',
    utilityButton: 'border-green-200 bg-white text-green-700 hover:bg-green-100',
    utilityIcon: 'text-green-700',
    headerTitle: 'text-sm font-semibold text-slate-900',
    headerSubtitle: 'text-sm text-green-800',
    headerLink: 'hover:bg-green-100/70'
  },
  yellow: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-yellow-200 bg-yellow-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-yellow-500',
    body: 'mb-4 rounded-2xl border border-yellow-200 bg-white p-4',
    bodyText: 'text-slate-700',
    divider: 'border-yellow-200',
    utilityButton: 'border-yellow-200 bg-white text-yellow-700 hover:bg-yellow-100',
    utilityIcon: 'text-yellow-700',
    headerTitle: 'text-sm font-semibold text-slate-900',
    headerSubtitle: 'text-sm text-yellow-800',
    headerLink: 'hover:bg-yellow-100/70'
  },
  pink: {
    wrapper: 'overflow-hidden rounded-[1.75rem] border border-pink-200 bg-pink-50 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    icon: 'text-pink-400',
    body: 'mb-4 rounded-2xl border border-pink-200 bg-white p-4',
    bodyText: 'text-slate-700',
    divider: 'border-pink-200',
    utilityButton: 'border-pink-200 bg-white text-pink-700 hover:bg-pink-100',
    utilityIcon: 'text-pink-700',
    headerTitle: 'text-sm font-semibold text-slate-900',
    headerSubtitle: 'text-sm text-pink-800',
    headerLink: 'hover:bg-pink-100/70'
  }
};

export default function NoteCard({ card, onSelect, onColourChange, onCommentSave, dragHandleProps, isDragging = false }) {
  const cardTheme = cardThemes[card.colour] || cardThemes.white;
  const workOrderTitle = [card.woNumber, card.customer].filter(Boolean).join(' - ');
  const vehicleLabel = card.vehicle || '';

  return (
    <article className={`${cardTheme.wrapper} ${isDragging ? 'shadow-[0_18px_36px_rgba(15,23,42,0.16)]' : ''}`}>
      <div className="mb-3 flex items-start gap-3">
        <div
          {...dragHandleProps}
          className={`mt-1 rounded-full p-1 ${dragHandleProps ? 'cursor-grab active:cursor-grabbing' : ''}`}
          aria-label="Drag note"
        >
          <GripVertical className={`h-4 w-4 ${cardTheme.icon}`} />
        </div>

        <button
          type="button"
          onClick={() => onSelect?.(card)}
          className={`flex-1 rounded-xl px-2 py-1 text-left transition-colors ${cardTheme.headerLink}`}
        >
          {card.hasWorkOrder ? (
            <>
              <div className={cardTheme.headerTitle}>{workOrderTitle || card.woNumber}</div>
              <div className={`mt-0.5 ${cardTheme.headerSubtitle}`}>{vehicleLabel}</div>
            </>
          ) : (
            <div className={cardTheme.headerTitle}>+ Connect WO</div>
          )}
        </button>
      </div>

      <NoteEditableContent
        title={card.title || ''}
        comment={card.comment || ''}
        onSave={(comment) => onCommentSave?.(card.noteId, comment)}
        containerClassName={cardTheme.body}
        titleClassName="mb-1 min-h-[20px] text-sm font-medium text-slate-700"
        contentClassName={`text-sm leading-6 ${cardTheme.bodyText}`}
      />

      <div className={`flex items-center justify-start gap-2 border-t pt-4 ${cardTheme.divider}`}>
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
    </article>
  );
}