import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import KanbanCard from './KanbanCard';

export default function KanbanColumn({ statusObj, workOrders, kanbanColumnSizes, customers, vehicles, handleEdit }) {
  
  const config = kanbanColumnSizes[statusObj.name] || { visible: true, row: 'top', columnPosition: 1, width: 280, height: 600 };
  
  if (config.visible === false) return null;

  // Calculate col_span based on width
  const getColSpan = (width) => {
    if (width > 600) return 3;
    if (width > 300) return 2;
    return 1;
  };

  const getColorClass = (color) => {
    const colorMap = {
      slate: 'bg-slate-100 border-slate-300',
      gray: 'bg-gray-100 border-gray-300',
      red: 'bg-red-50 border-red-300',
      orange: 'bg-orange-50 border-orange-300',
      amber: 'bg-amber-50 border-amber-300',
      yellow: 'bg-yellow-50 border-yellow-300',
      lime: 'bg-lime-50 border-lime-300',
      green: 'bg-green-50 border-green-300',
      emerald: 'bg-emerald-50 border-emerald-300',
      teal: 'bg-teal-50 border-teal-300',
      cyan: 'bg-cyan-50 border-cyan-300',
      sky: 'bg-sky-50 border-sky-300',
      blue: 'bg-blue-50 border-blue-300',
      indigo: 'bg-indigo-50 border-indigo-300',
      violet: 'bg-violet-50 border-violet-300',
      purple: 'bg-purple-50 border-purple-300',
      fuchsia: 'bg-fuchsia-50 border-fuchsia-300',
      pink: 'bg-pink-50 border-pink-300',
      rose: 'bg-rose-50 border-rose-300',
    };
    return colorMap[color?.toLowerCase()] || colorMap.slate;
  };

  const colorClass = getColorClass(statusObj.color);
  const colSpan = getColSpan(config.width);
  const gridRow = config.row === 'bottom' ? 2 : (config.row === 'both' ? 'span 2' : 1);

  return (
    <Card 
      className={`${colorClass} border-2`}
      style={{ 
        gridColumn: `span ${colSpan}`,
        gridRow: gridRow,
        width: `${config.width}px`,
        height: `${config.height}px`
      }}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-700 uppercase tracking-wide">
          {statusObj.name}
          <Badge variant="outline" className="ml-2 bg-white">
            {workOrders.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <Droppable droppableId={statusObj.name}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex flex-col gap-1 overflow-y-auto p-4 transition-colors ${snapshot.isDraggingOver ? 'bg-black/5' : ''}`}
            style={{ maxHeight: `${config.height - 80}px`, minHeight: '100px' }}
          >
            {workOrders.map((wo, index) => (
              <KanbanCard 
                key={wo.id}
                wo={wo}
                index={index}
                customers={customers}
                vehicles={vehicles}
                handleEdit={handleEdit}
                kanbanColumnSizes={kanbanColumnSizes}
              />
            ))}
            {provided.placeholder}
            
            {workOrders.length === 0 && !snapshot.isDraggingOver && (
              <div className="h-20 w-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded">
                Drop items here
              </div>
            )}
          </div>
        )}
      </Droppable>
    </Card>
  );
}