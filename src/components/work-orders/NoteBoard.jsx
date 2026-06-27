import React from 'react';
import NoteColumn from './NoteColumn';

const columns = [
  { key: 'inbox', title: 'Inbox' },
  { key: 'active', title: 'Active' },
  { key: 'waiting', title: 'Waiting' },
  { key: 'scheduled', title: 'Scheduled' },
  { key: 'done', title: 'Done' }
];

const getColumnKey = (workOrder) => {
  const status = (workOrder.status || '').toLowerCase();
  if (status.includes('completed')) return 'done';
  if (status.includes('scheduled')) return 'scheduled';
  if (status.includes('hold') || status.includes('parts')) return 'waiting';
  if (status.includes('open')) return 'inbox';
  return 'active';
};

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
      columnKey: getColumnKey(workOrder),
      title: workOrder.description || workOrder.customer_complaint || `Work Order ${workOrder.wo_number || workOrder.ro_number || ''}`,
      comment: workOrder.notes_to_customer || workOrder.customer_complaint || 'No comment added yet.',
      customer: getCustomerName(workOrder, customers),
      vehicle: getVehicleName(workOrder, vehicles),
      woNumber: workOrder.wo_number || workOrder.ro_number || 'Unassigned'
    }));

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
      {columns.map((column) => (
        <NoteColumn
          key={column.key}
          column={column}
          cards={cards.filter((card) => card.columnKey === column.key)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}