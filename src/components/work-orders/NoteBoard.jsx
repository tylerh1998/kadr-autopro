import React from 'react';
import NoteColumn from './NoteColumn';

const columns = [
  { key: 'column_1' },
  { key: 'column_2' },
  { key: 'column_3' }
];

export default function NoteBoard({ cards = [], onSelect, onColourChange }) {
  const distributedColumns = columns.map((column, index) => ({
    ...column,
    cards: cards.filter((_, cardIndex) => cardIndex % columns.length === index)
  }));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {distributedColumns.map((column) => (
        <NoteColumn
          key={column.key}
          cards={column.cards}
          onSelect={onSelect}
          onColourChange={onColourChange}
        />
      ))}
    </div>
  );
}