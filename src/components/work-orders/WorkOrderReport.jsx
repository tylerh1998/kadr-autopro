import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function WorkOrderReport({ workOrder, customer, vehicle, lineItems, wipLegal = '', defaultMessage = '' }) {

  // Parse payments from JSON string or object
  let payments = [];
  try {
    if (Array.isArray(workOrder.payments)) {
      payments = workOrder.payments;
    } else {
      payments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
    }
    if (!Array.isArray(payments)) payments = [];
  } catch (e) {
    console.error("Failed to parse payments JSON:", e);
    payments = [];
  }

  // Separate payments into actual payments and on-account payments
  const actualPayments = payments.filter(p => p.payment_method !== 'on_account');
  const onAccountPayments = payments.filter(p => p.payment_method === 'on_account');

  // Calculate financial totals
  const partsTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.tot_parts) || 0), 0);
  const laborTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
  const otherChargesTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
  
  const grandTotalBeforeTax = partsTotal + laborTotal + otherChargesTotal;

  // Calculate taxable base
  let totalTaxableBase = 0;
  lineItems.forEach(item => {
    if (item.taxable === true) {
      totalTaxableBase += (parseFloat(item.total) || 0);
    }
  });

  const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
    if (item.taxable === true) {
      return sum + (parseFloat(item.labour) || 0);
    }
    return sum;
  }, 0);

  const shopSupplyTotal = laborTotal * 0.06;
  const taxableShopSupplies = taxableLaborForShopSupply * 0.06;
  totalTaxableBase += taxableShopSupplies;

  const taxAmount = totalTaxableBase * 0.05;
  const grandTotal = grandTotalBeforeTax + shopSupplyTotal + taxAmount;

  // Use only actual payments for amountPaid and balanceDue calculations
  const amountPaid = actualPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const balanceDue = grandTotal - amountPaid;

  // Helper function to get customer display name
  const getCustomerDisplayName = () => {
    if (!customer) return 'N/A';
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'N/A';
  };

  // Format date as "OCT 12, 2025" - FIXED to avoid timezone issues
  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const parts = dateString.split('-');
      if (parts.length !== 3) return 'N/A';
      const [year, month, day] = parts.map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return 'N/A';
      
      const localDate = new Date(year, month - 1, day);
      if (isNaN(localDate.getTime())) return 'N/A';
      
      return format(localDate, 'MMM dd, yyyy').toUpperCase();
    } catch (e) {
      return 'N/A';
    }
  };

  return (
    <div className="bg-white p-6 max-w-[8.5in] mx-auto" style={{ fontSize: '12px' }}>
      {/* Header */}
      <div className="border-b-2 border-black pb-3 mb-3">
        <div className="flex justify-between items-start">
          <div className="flex-shrink-0">
            <img 
              src="https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg"
              alt="Ken's Auto & Diesel Repair" 
              className="h-32"
            />
          </div>
          <div className="text-right mt-6">
            <h2 className="text-xl font-bold leading-none">
              {workOrder.stage === 'estimate' ? 'ESTIMATE' : 
               workOrder.stage === 'invoice' ? 'INVOICE' : 
               workOrder.stage === 'credit_invoice' ? 'CREDIT INVOICE' : 'WORK ORDER'}
            </h2>
            <p className="text-sm mt-1">
              <strong>
                {workOrder.stage === 'estimate' ? workOrder.est_number :
                 workOrder.stage === 'invoice' ? workOrder.inv_number :
                 workOrder.stage === 'credit_invoice' ? workOrder.crinv_number :
                 workOrder.wo_number}
              </strong>
            </p>
            <p className="text-xs mt-1">
              Date: {formatDisplayDate(
                workOrder.stage === 'estimate' ? workOrder.est_date :
                workOrder.stage === 'invoice' ? workOrder.invoice_date :
                workOrder.wo_date
              )}
            </p>
            {workOrder?.po_number && (
              <p className="text-xs mt-1">
                <strong>PO:</strong> {workOrder.po_number}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
        <div>
          <h3 className="font-bold mb-1 text-sm">Customer Information</h3>
          <p className="leading-tight"><strong>Name:</strong> {getCustomerDisplayName()}</p>
          {customer?.org_name && customer?.first_name && (
            <p className="leading-tight"><strong>Contact:</strong> {customer.first_name} {customer.last_name}</p>
          )}
          <p className="leading-tight"><strong>Phone:</strong> {customer?.phone || 'N/A'}</p>
          <p className="leading-tight"><strong>Email:</strong> {customer?.email || 'N/A'}</p>
          {customer?.address && <p className="leading-tight"><strong>Address:</strong> {customer.address}</p>}
        </div>
        <div>
          <h3 className="font-bold mb-1 text-sm">Vehicle Information</h3>
          <p className="leading-tight"><strong>Vehicle:</strong> {vehicle?.year} {vehicle?.make} {vehicle?.model}</p>
          <p className="leading-tight"><strong>VIN:</strong> {vehicle?.vin || 'N/A'}</p>
          <p className="leading-tight"><strong>License:</strong> {vehicle?.license_plate || 'N/A'}</p>
          {vehicle?.color && <p className="leading-tight"><strong>Color:</strong> {vehicle.color}</p>}
          {(workOrder?.odometer || vehicle?.mileage) && (
            <p className="leading-tight"><strong>Odometer:</strong> {(workOrder?.odometer || vehicle?.mileage).toLocaleString()} km</p>
          )}
          {workOrder?.cvip && (
            <p className="leading-tight"><strong>CVIP:</strong> {workOrder.cvip}</p>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-3">
        <h3 className="font-bold mb-2 text-sm">Line Items</h3>
        <table className="w-full border-collapse border border-slate-300 text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-1 py-0.5 text-left" style={{ width: '5%' }}>Qty</th>
              <th className="border border-slate-300 px-1 py-0.5 text-left" style={{ width: '5%' }}>Hrs</th>
              <th className="border border-slate-300 px-1 py-0.5 text-left" style={{ width: '35%' }}>Description</th>
              <th className="border border-slate-300 px-1 py-0.5 text-left" style={{ width: '15%' }}>Part #</th>
              <th className="border border-slate-300 px-1 py-0.5 text-right" style={{ width: '10%' }}>Parts</th>
              <th className="border border-slate-300 px-1 py-0.5 text-right" style={{ width: '10%' }}>Labour</th>
              <th className="border border-slate-300 px-1 py-0.5 text-right" style={{ width: '10%' }}>Other</th>
              <th className="border border-slate-300 px-1 py-0.5 text-center" style={{ width: '5%' }}>Tax</th>
              <th className="border border-slate-300 px-1 py-0.5 text-right" style={{ width: '10%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => {
              const isLaborLine = !item.qty && !item.part_number && !item.tot_parts;
              
              return isLaborLine ? (
                <tr key={index} className={item.bold ? 'font-bold' : ''}>
                  <td className="border border-slate-300 px-1 py-0.5"></td>
                  <td className="border border-slate-300 px-1 py-0.5">{item.hrs || ''}</td>
                  <td colSpan="3" className="border border-slate-300 px-1 py-0.5">{item.description || ''}</td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.labour ? `$${parseFloat(item.labour).toFixed(2)}` : ''}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.oc_total ? `$${parseFloat(item.oc_total).toFixed(2)}` : ''}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-center">
                    {item.taxable ? 'Y' : 'N'}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.total ? `$${parseFloat(item.total).toFixed(2)}` : ''}
                  </td>
                </tr>
              ) : (
                <tr key={index} className={item.bold ? 'font-bold' : ''}>
                  <td className="border border-slate-300 px-1 py-0.5">{item.qty || ''}</td>
                  <td className="border border-slate-300 px-1 py-0.5">{item.hrs || ''}</td>
                  <td className="border border-slate-300 px-1 py-0.5">{item.description || ''}</td>
                  <td className="border border-slate-300 px-1 py-0.5 text-[9px]">{item.part_number || ''}</td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.part_number ? `$${Number(item.parts_ea || 0).toFixed(2)}/${item.unit || 'ea'}` : ''}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.labour ? `$${parseFloat(item.labour).toFixed(2)}` : ''}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.oc_total ? `$${parseFloat(item.oc_total).toFixed(2)}` : ''}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-center">
                    {item.taxable ? 'Y' : 'N'}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {item.total ? `$${parseFloat(item.total).toFixed(2)}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes to Customer - Only prints if user added something */}
      {workOrder.notes_to_customer && (
        <div className="mb-3 break-inside-avoid">
          <h3 className="font-bold mb-1 text-sm">Notes to Customer</h3>
          <div className="border border-slate-300 p-2 text-xs whitespace-pre-wrap">
            {workOrder.notes_to_customer}
          </div>
        </div>
      )}

      {/* Default Message - Always prints, no header */}
      {defaultMessage && (
        <div className="mb-3 break-inside-avoid">
          <div className="border border-slate-300 p-2 text-xs whitespace-pre-wrap">
            {defaultMessage}
          </div>
        </div>
      )}

      {/* Terms of Service and Financial Summary */}
      <div className="grid grid-cols-2 gap-4 mb-3 break-inside-avoid">
        {/* Terms of Service - Left Column */}
        <div className="border border-slate-300 p-2">
          <h3 className="font-bold mb-1 text-xs">Terms of Service</h3>
          <div className="text-[9px] leading-tight whitespace-pre-wrap">
            {wipLegal || 'No terms of service defined.'}
          </div>
        </div>
        
        {/* Financial Summary - Right Column */}
        <div className="border border-slate-300 p-2">
          <div className="space-y-0.5 text-[9px]">
            {workOrder?.ro_number && (
              <div className="flex justify-between font-semibold">
                <span>{workOrder.ro_number}</span>
                <span></span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Parts Subtotal:</span>
              <span className="font-semibold">${(partsTotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Labour Subtotal:</span>
              <span className="font-semibold">${(laborTotal || 0).toFixed(2)}</span>
            </div>
            {otherChargesTotal > 0 && (
              <div className="flex justify-between">
                <span>Other Charges:</span>
                <span className="font-semibold">${(otherChargesTotal || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-300">
              <span>Subtotal:</span>
              <span className="font-semibold">${(grandTotalBeforeTax || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shop Supplies:</span>
              <span className="font-semibold">${(shopSupplyTotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%):</span>
              <span className="font-semibold">${(taxAmount || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t-2 border-black font-bold text-[10px]">
              <span>Grand Total:</span>
              <span>${(grandTotal || 0).toFixed(2)}</span>
            </div>
            {amountPaid > 0 && (
              <>
                <div className="flex justify-between pt-1">
                  <span>Amount Paid:</span>
                  <span className="font-semibold">${(amountPaid || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Balance Due:</span>
                  <span>${(balanceDue || 0).toFixed(2)}</span>
                </div>
              </>
            )}

            {/* Actual Payments */}
            {actualPayments.length > 0 && (
              <div className="pt-2 border-t border-slate-300">
                <h4 className="font-bold mb-1 text-[9px]">Payments Received:</h4>
                {actualPayments.map((p, pIdx) => (
                  <div key={pIdx} className="flex justify-between text-[8px] leading-tight">
                    <span>{formatDisplayDate(p.payment_date)} ({p.payment_method.replace(/_/g, ' ')})</span>
                    <span>${(Number(p.amount) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* On Account Payments */}
            {onAccountPayments.length > 0 && (
              <div className="pt-2 border-t border-slate-300">
                <h4 className="font-bold mb-1 text-[9px]">Charged to Account:</h4>
                {onAccountPayments.map((p, pIdx) => (
                  <div key={pIdx} className="flex justify-between text-[8px] leading-tight italic text-slate-600">
                    <span>{formatDisplayDate(p.payment_date)} (On Account)</span>
                    <span>${(Number(p.amount) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-300 text-center text-xs text-slate-600 break-inside-avoid">
        <p className="font-bold mb-1">Thank you for your business!</p>
      </div>
      
      {/* Print-only fixed footer for pagination (Browser dependent) */}
      <div className="fixed bottom-0 left-0 w-full text-center text-[10px] font-bold hidden print:block">
        {/* Note: Standard browsers handle "Page x of y" in their own print headers/footers settings */}
      </div>
    </div>
  );
}