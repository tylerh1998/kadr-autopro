export const NOTE_BOARD_COLUMNS = [
  { key: 'column_1' },
  { key: 'column_2' },
  { key: 'column_3' }
];

const isValidColumn = (value) => NOTE_BOARD_COLUMNS.some((column) => column.key === value);

const parseBoardOrder = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildNoteBoardColumns = (cards = []) => {
  const columns = NOTE_BOARD_COLUMNS.map((column) => ({ ...column, cards: [] }));
  const columnMap = new Map(columns.map((column) => [column.key, column]));
  const fallbackCounts = Object.fromEntries(columns.map((column) => [column.key, 0]));

  cards.forEach((card, index) => {
    const fallbackColumn = NOTE_BOARD_COLUMNS[index % NOTE_BOARD_COLUMNS.length].key;
    const boardColumn = isValidColumn(card.boardColumn) ? card.boardColumn : fallbackColumn;
    const fallbackOrder = fallbackCounts[boardColumn]++;
    const boardOrder = parseBoardOrder(card.boardOrder) ?? fallbackOrder;

    columnMap.get(boardColumn).cards.push({
      ...card,
      boardColumn,
      boardOrder
    });
  });

  return columns.map((column) => ({
    ...column,
    cards: column.cards
      .sort((a, b) => a.boardOrder - b.boardOrder || String(a.noteId).localeCompare(String(b.noteId)))
      .map((card, index) => ({ ...card, boardOrder: index }))
  }));
};

export const reorderNoteBoardColumns = (columns, source, destination) => {
  if (!destination) return null;

  const nextColumns = columns.map((column) => ({
    ...column,
    cards: [...column.cards]
  }));

  const sourceColumn = nextColumns.find((column) => column.key === source.droppableId);
  const destinationColumn = nextColumns.find((column) => column.key === destination.droppableId);

  if (!sourceColumn || !destinationColumn) return null;

  const [movedCard] = sourceColumn.cards.splice(source.index, 1);
  if (!movedCard) return null;

  destinationColumn.cards.splice(destination.index, 0, movedCard);

  return nextColumns.flatMap((column) =>
    column.cards.map((card, index) => ({
      ...card,
      boardColumn: column.key,
      boardOrder: index
    }))
  );
};