import React from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import NoteCard from './NoteCard';

export default function NoteColumn({ columnKey, cards, onSelect, onColourChange, onCommentSave, isDragDisabled, isDropDisabled }) {
  return (
    <Droppable droppableId={columnKey} isDropDisabled={isDropDisabled}>
      {(dropProvided, dropSnapshot) => (
        <div
          ref={dropProvided.innerRef}
          {...dropProvided.droppableProps}
          className={`min-h-[520px] space-y-3 rounded-2xl transition-colors ${dropSnapshot.isDraggingOver ? 'bg-slate-100/80' : ''}`}
        >
          {cards.length > 0 ? (
            cards.map((card, index) => (
              <Draggable key={card.noteId} draggableId={card.noteId} index={index} isDragDisabled={isDragDisabled}>
                {(dragProvided, dragSnapshot) => (
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                    <NoteCard
                      card={card}
                      onSelect={onSelect}
                      onColourChange={onColourChange}
                      onCommentSave={onCommentSave}
                      dragHandleProps={dragProvided.dragHandleProps}
                      isDragging={dragSnapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              No notes in this column yet.
            </div>
          )}
          {dropProvided.placeholder}
        </div>
      )}
    </Droppable>
  );
}