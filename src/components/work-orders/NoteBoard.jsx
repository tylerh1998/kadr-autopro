import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import NoteColumn from './NoteColumn';
import { buildNoteBoardColumns, reorderNoteBoardColumns } from '@/components/work-orders/note-board/noteBoardUtils';

export default function NoteBoard({ cards = [], onSelect, onColourChange, onCommentSave, onShareToggle, onReorder, isReorderEnabled = true }) {
  const columns = buildNoteBoardColumns(cards);

  const handleDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const reorderedCards = reorderNoteBoardColumns(columns, source, destination);
    if (!reorderedCards) return;

    onReorder?.(reorderedCards);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {columns.map((column) => (
          <NoteColumn
            key={column.key}
            columnKey={column.key}
            cards={column.cards}
            onSelect={onSelect}
            onColourChange={onColourChange}
            onCommentSave={onCommentSave}
            onShareToggle={onShareToggle}
            isDragDisabled={!isReorderEnabled}
            isDropDisabled={!isReorderEnabled}
          />
        ))}
      </div>
    </DragDropContext>
  );
}