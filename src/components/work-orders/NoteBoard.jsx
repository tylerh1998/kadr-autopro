import React from 'react';
import NoteColumn from './NoteColumn';

const columns = [
  { key: 'column_1' },
  { key: 'column_2' },
  { key: 'column_3' }
];

const getCustomerName = (workOrder, customers) => {
  const customer = workOrder.Customer || customers.find((item) => item.id === workOrder.customer_id);
  if (!customer) return 'No customer linked';
  return customer.org_name?.trim() || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
};

const getVehicleName = (workOrder, vehicles) => {
  const vehicle = workOrder.Vehicle || vehicles.find((item) => item.id === workOrder.vehicle_id);
  if (!vehicle) return 'No vehicle linked';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || 'Vehicle linked';
};

export default function NoteBoard({ workOrders, customers, vehicles, onSelect }) {
  const cards = workOrders
    .filter((workOrder) => workOrder.stage === 'estimate' || workOrder.stage === 'work_order')
    .map((workOrder) => ({
      id: workOrder.id,
      workOrder,
      title: workOrder.description || workOrder.customer_complaint || `Work Order ${workOrder.wo_number || workOrder.ro_number || ''}`,
      comment: workOrder.notes_to_customer || workOrder.customer_complaint || 'No comment added yet.',
      customer: getCustomerName(workOrder, customers),
      vehicle: getVehicleName(workOrder, vehicles),
      woNumber: workOrder.wo_number || workOrder.ro_number || 'Unassigned'
    }));

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
        />
      ))}
    </div>
  );
}