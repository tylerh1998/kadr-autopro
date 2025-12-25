import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Card } from "@/components/ui/card";
import { FileText, Car, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function KanbanCard({ wo, index, customers, vehicles, handleEdit, kanbanColumnSizes }) {
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return '';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const customer = customers.find(c => c.id === wo.customer_id);
  const vehicle = vehicles.find(v => v.id === wo.vehicle_id);
  const displayNumber = wo.stage === 'estimate' ? wo.est_number : wo.wo_number;
  const relevantDate = wo.stage === 'estimate' ? wo.est_date : wo.wo_date;
  const cardFields = kanbanColumnSizes.cardFields || {};

  return (
    <Draggable draggableId={wo.id} index={index}>
      {(provided, snapshot) => (
        <Card 
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            opacity: snapshot.isDragging ? 0.5 : 1,
            minWidth: '200px', 
            maxWidth: '232px',
          }}
          className="p-3 cursor-pointer hover:shadow-md transition-shadow flex-grow bg-white border-slate-200 mb-3"
          onClick={() => handleEdit(wo)}
        >
          <div className="space-y-2">
            {(cardFields.showCustomer !== false) && (
              <div className="flex justify-between items-start">
                <p className="font-semibold text-sm">
                  {customer ? getCustomerName(customer.id) : 'Customer Not Found'}
                </p>
              </div>
            )}
            {(cardFields.showDescription !== false) && (
              <p className="text-xs text-slate-600 line-clamp-2">{wo.description}</p>
            )}
            {(cardFields.showWONumber !== false) && displayNumber && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {displayNumber}
              </p>
            )}
            {(cardFields.showVehicle !== false) && vehicle && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Car className="w-3 h-3" />
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            )}
            {(cardFields.showDate !== false) && relevantDate && !isNaN(new Date(relevantDate).getTime()) && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(relevantDate), 'MMM d, yyyy')}
              </p>
            )}
            <div className="flex justify-between items-center pt-2">
              {(cardFields.showAmount !== false) && (
                <p className="text-xs font-semibold text-slate-900">
                  ${(wo.total_amount || 0).toFixed(2)}
                </p>
              )}
              {(cardFields.showScheduledDate !== false) && wo.scheduled_date && !isNaN(new Date(wo.scheduled_date).getTime()) && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(wo.scheduled_date), 'MMM d')}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </Draggable>
  );
}