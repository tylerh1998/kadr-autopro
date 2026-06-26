import React from 'react';

const reportDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const getCustomerName = (customer) => {
  if (!customer) return 'Not available';
  if (customer.org_name) {
    const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
  }
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Not available';
};

export default function CustomerHistoryPrintHeader({ customer }) {
  return (
    <div className="print-only border-b border-slate-300 pb-4 mb-4">
      <h2 className="text-2xl font-bold text-slate-900">Customer History Report</h2>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">Customer Name:</span> {getCustomerName(customer)}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Report Date/Time:</span> {reportDateFormatter.format(new Date())} MT
        </p>
      </div>
    </div>
  );
}