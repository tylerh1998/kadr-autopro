import React from 'react';
import NoteColumn from './NoteColumn';

const columns = [
  { key: 'column_1', title: 'Column 1' },
  { key: 'column_2', title: 'Column 2' },
  { key: 'column_3', title: 'Column 3' },
  { key: 'column_4', title: 'Column 4' }
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-4">
      {distributedColumns.map((column) => (
        <NoteColumn
          key={column.key}
          column={column}
          cards={column.cards}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}