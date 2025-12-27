import React from 'react';
import CreditInvoiceFinancialSummary from './form/CreditInvoiceFinancialSummary';
import CreditInvoiceLineItemsTable from './form/CreditInvoiceLineItemsTable';

export default function CreditInvoiceForm({
  workOrder,
  customer,
  vehicle,
  employees,
  inventory,
  lineItems,
  tagAlongs,
  selectedLines,
  onToggleLine,
  shopSupplyRate = 0.07
}) {
  return (
    <div className="space-y-6">
      {/* Line Items Table with Credit Selection */}
      <CreditInvoiceLineItemsTable
        lineItems={lineItems}
        selectedLines={selectedLines}
        onToggleLine={onToggleLine}
      />

      {/* Financial Summary (only for selected items) */}
      <CreditInvoiceFinancialSummary
        lineItems={lineItems}
        selectedLines={selectedLines}
        workOrder={workOrder}
        shopSupplyRate={shopSupplyRate}
      />
    </div>
  );
}