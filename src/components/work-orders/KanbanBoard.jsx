import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import KanbanColumn from './KanbanColumn';

export default function KanbanBoard({ 
  workOrders, 
  customers, 
  vehicles, 
  workOrderStatuses, 
  kanbanColumnSizes, 
  handleEdit,
  refreshData
}) {

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Find the moved work order
    const movedWorkOrder = workOrders.find(wo => wo.id === draggableId);
    if (!movedWorkOrder) return;

    const oldStatus = source.droppableId;
    const newStatus = destination.droppableId;

    if (oldStatus !== newStatus) {
      try {
        // Call backend to validate and update
        const response = await base44.functions.invoke('updateWorkOrderStatus', {
            workOrderId: movedWorkOrder.id,
            newStatus: newStatus
        });

        if (response.data.error) {
            alert(response.data.error);
            // If failed, we should probably force a refresh to revert the UI state
            // since the optimistic drag already happened visually
            refreshData();
        } else {
            // Success - refresh data to update local state fully
            refreshData();
        }
      } catch (error) {
        console.error('Drag end error:', error);
        alert('Failed to update status.');
        refreshData();
      }
    } else {
        // Reordering within same column
        // We'd need to calculate new indices and call update.
        // For now, visual-only or we can implement the logic if needed.
        // Given complexity, let's keep it simple as requested.
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid gap-6 overflow-x-auto pb-4" style={{ 
        gridTemplateColumns: 'repeat(auto-fit, 280px)',
        gridAutoFlow: 'column',
        gridTemplateRows: 'auto auto'
      }}>
        {(() => {
            // Sort statuses by column position
            const sortedStatuses = [...workOrderStatuses]
            .map(statusObj => {
                const config = kanbanColumnSizes[statusObj.name] || { visible: true, row: 'top', columnPosition: 1 };
                return { statusObj, config };
            })
            .filter(({ config }) => config.visible !== false)
            .sort((a, b) => {
                const posA = a.config.columnPosition || 1;
                const posB = b.config.columnPosition || 1;
                if (posA !== posB) return posA - posB;
                const rowOrder = { top: 0, both: 1, bottom: 2 };
                return (rowOrder[a.config.row] || 0) - (rowOrder[b.config.row] || 0);
            });

            return sortedStatuses.map(({ statusObj }) => {
                const statusWorkOrders = workOrders.filter(wo => 
                    wo.status === statusObj.name && 
                    (wo.stage === 'estimate' || wo.stage === 'work_order')
                ).sort((a, b) => (a.kanban_order || 0) - (b.kanban_order || 0)); // Sort by kanban_order

                return (
                    <KanbanColumn 
                        key={statusObj.name}
                        statusObj={statusObj}
                        workOrders={statusWorkOrders}
                        kanbanColumnSizes={kanbanColumnSizes}
                        customers={customers}
                        vehicles={vehicles}
                        handleEdit={handleEdit}
                    />
                );
            });
        })()}
      </div>
    </DragDropContext>
  );
}