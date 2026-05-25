import React from 'react';
import LankarWOHeaderInfo from './LankarWOHeaderInfo';
import LankarWOLineItemsTable from './LankarWOLineItemsTable';
import LankarWOFinancialSummary from './LankarWOFinancialSummary';

export default function LankarWOViewForm({ info, customer, vehicle, lineItems }) {
  return (
    <div className="space-y-6">
      <LankarWOHeaderInfo info={info} customer={customer} vehicle={vehicle} />
      <LankarWOLineItemsTable lineItems={lineItems} />
      <LankarWOFinancialSummary info={info} lineItems={lineItems} />
    </div>
  );
}