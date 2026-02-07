import React from 'react';
import WorkOrderViewHeaderInfo from './form/WorkOrderViewHeaderInfo';
import WorkOrderViewFinancialSummary from './form/WorkOrderViewFinancialSummary';
import WorkOrderViewLineItemsTable from './form/WorkOrderViewLineItemsTable';

function padLines(lines, minLines = 20) {
  const blankLine = {
    id: null, qty: '', hrs: '', description: '', part_number: '', parts_ea: '', tot_parts: '', labour: '', total: '',
  };
  const paddedLines = [...lines];
  while (paddedLines.length < minLines) {
    paddedLines.push({ ...blankLine, id: `blank_${paddedLines.length}` });
  }
  return paddedLines;
}

export default function WorkOrderViewForm({
  workOrder,
  customer,
  vehicle,
  employees, // Pass employees list
  lineItems,
  onOpenWorkPRO,
  onPaymentsClick, // NEW: Add this prop
  onReturnForWarranty, // Pass down the handler
  shopSupplyRate = 0.07,
}) {
  return (
    <div className="space-y-6">
      <WorkOrderViewHeaderInfo
        workOrder={workOrder}
        customer={customer}
        vehicle={vehicle}
        employees={employees} // Pass employees list
        onOpenWorkPRO={onOpenWorkPRO}
      />
      
      <WorkOrderViewLineItemsTable
        lineItems={lineItems}
        onReturnForWarranty={onReturnForWarranty}
        workOrder={workOrder}
      />

      <WorkOrderViewFinancialSummary 
        lineItems={lineItems} 
        workOrder={workOrder} 
        onPaymentsClick={onPaymentsClick}
        shopSupplyRate={shopSupplyRate}
      />
    </div>
  );
}