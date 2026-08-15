import React from 'react';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';

const STAGE_LABELS = {
  estimate: 'ESTIMATE',
  work_order: 'WORK ORDER',
  invoice: 'INVOICE',
  credit_invoice: 'CREDIT INVOICE',
};

function safeParseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

// Format a "YYYY-MM-DD" date string without timezone drift.
function formatDisplayDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const datePart = String(dateString).split('T')[0];
    const parts = datePart.split('-');
    if (parts.length !== 3) return String(dateString);
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return String(dateString);
    const localDate = new Date(year, month - 1, day);
    if (isNaN(localDate.getTime())) return String(dateString);
    return format(localDate, 'MMM dd, yyyy').toUpperCase();
  } catch (e) {
    return String(dateString);
  }
}

function formatTimestamp(dateString) {
  if (!dateString) return 'N/A';
  try {
    return format(toMountainTime(dateString), 'MMM d, yyyy h:mm a');
  } catch (e) {
    return String(dateString);
  }
}

function formatApprovalDecisionTime(approval) {
  if (!approval) return 'N/A';
  const dateStr = approval.date_approved || approval.created_date;
  if (!dateStr) return 'N/A';
  try {
    const mtDate = toMountainTime(dateStr);
    const datePart = format(mtDate, 'MMM d, yyyy');
    if (approval.time_approved) {
      return `${datePart} at ${approval.time_approved}`;
    }
    return `${datePart} ${format(mtDate, 'h:mm a')}`;
  } catch (e) {
    return approval.date_approved || approval.created_date || 'N/A';
  }
}

// Read-only, print-ready reconstruction of a CustomerPortalWorkOrder snapshot
// plus the Approvals decision tied to it. Intended as the legal record of
// exactly what the customer was shown and decided, independent of the live
// (and possibly since-edited) WorkOrder row.
export default function CustomerApprovalSnapshotReport({ snapshot, approval, wipLegal = '' }) {
  if (!snapshot) return null;

  const customerSnap = safeParseJson(snapshot.customer_snapshot, {}) || {};
  const vehicleSnap = safeParseJson(snapshot.vehicle_snapshot, {}) || {};
  const lineItemsRaw = safeParseJson(snapshot.line_items_snapshot, []);
  const paymentsRaw = safeParseJson(snapshot.payments, []);

  const items = Array.isArray(lineItemsRaw) ? lineItemsRaw : [];
  const paymentsList = Array.isArray(paymentsRaw) ? paymentsRaw : [];

  const actualPayments = paymentsList.filter(p => (p.payment_method || p.method) !== 'on_account');
  const onAccountPayments = paymentsList.filter(p => (p.payment_method || p.method) === 'on_account');

  const partsTotal = Number(snapshot.parts_total) || 0;
  const laborTotal = Number(snapshot.labor_total) || 0;
  const shopSupplyTotal = Number(snapshot.shop_supply_total) || 0;
  const taxAmount = Number(snapshot.tax_amount) || 0;
  const totalAmount = Number(snapshot.total_amount) || 0;
  const amountPaid = Number(snapshot.amount_paid) || 0;
  const balanceDue = totalAmount - amountPaid;
  const otherChargesTotal = items.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
  const subtotal = partsTotal + laborTotal + otherChargesTotal;

  const decisionType = (approval?.type || snapshot.approval || 'pending').toLowerCase();
  const isApproved = decisionType === 'approved';
  const isDenied = decisionType === 'denied' || decisionType === 'skip_deny';
  const statusLabel = isApproved ? 'APPROVED' : isDenied ? 'DENIED / SKIPPED' : 'PENDING';
  const statusClasses = isApproved
    ? 'border-green-600 bg-green-50'
    : isDenied
    ? 'border-red-600 bg-red-50'
    : 'border-amber-600 bg-amber-50';

  const decidedByName = approval?.customer_name || customerSnap.name || 'N/A';
  const decidedByEmail = approval?.customer_email;
  const decidedByPhone = approval?.phone_number || customerSnap.phone;

  return (
    <div className="bg-white p-6 max-w-[8.5in] mx-auto text-black" style={{ fontSize: '12px' }}>
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
              {STAGE_LABELS[snapshot.stage] || 'WORK ORDER'}
            </h2>
            <p className="text-[10px] font-semibold mt-1 tracking-wide text-slate-600">
              CUSTOMER-APPROVED SNAPSHOT RECORD
            </p>
            <p className="text-sm mt-1"><strong>{snapshot.ref_number || 'N/A'}</strong></p>
            <p className="text-xs mt-1">Date: {formatDisplayDate(snapshot.ref_date)}</p>
            {snapshot.po_number && (
              <p className="text-xs mt-1"><strong>PO:</strong> {snapshot.po_number}</p>
            )}
          </div>
        </div>
      </div>

      {/* Approval Certificate */}
      <div className={`border-2 rounded p-3 mb-3 break-inside-avoid ${statusClasses}`}>
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-sm mb-1">Customer Decision: {statusLabel}</h3>
            <p className="text-xs leading-tight"><strong>Decided by:</strong> {decidedByName}</p>
            {decidedByEmail && <p className="text-xs leading-tight"><strong>Email:</strong> {decidedByEmail}</p>}
            {decidedByPhone && <p className="text-xs leading-tight"><strong>Phone:</strong> {decidedByPhone}</p>}
            <p className="text-xs leading-tight"><strong>Date/Time of Decision:</strong> {formatApprovalDecisionTime(approval)}</p>
            {approval?.method_approved && (
              <p className="text-xs leading-tight"><strong>Method:</strong> {approval.method_approved}</p>
            )}
            {approval?.approval_amount != null && (
              <p className="text-xs leading-tight"><strong>Amount Approved:</strong> ${Number(approval.approval_amount).toFixed(2)}</p>
            )}
          </div>
          <div className="text-right text-[9px] text-slate-700">
            <p><strong>Portal ID:</strong> {snapshot.cp_id || 'N/A'}</p>
            <p><strong>Snapshot Sent:</strong> {formatTimestamp(snapshot.snapshot_date)}</p>
            {snapshot.created_by && <p><strong>Sent By:</strong> {snapshot.created_by}</p>}
            {approval?.ip_address && <p><strong>IP Address:</strong> {approval.ip_address}</p>}
          </div>
        </div>
        {approval?.customer_comments && (
          <div className="mt-2 pt-2 border-t border-black/20 text-xs">
            <strong>Customer Comments:</strong> {approval.customer_comments}
          </div>
        )}
        {approval?.user_agent && (
          <p className="mt-1 text-[8px] text-slate-500 break-all"><strong>Device:</strong> {approval.user_agent}</p>
        )}
      </div>

      {/* Customer & Vehicle Info, exactly as presented at time of snapshot */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
        <div>
          <h3 className="font-bold mb-1 text-sm">Customer (as shown to customer)</h3>
          <p className="leading-tight"><strong>Name:</strong> {customerSnap.name || 'N/A'}</p>
          <p className="leading-tight"><strong>Phone:</strong> {customerSnap.phone || 'N/A'}</p>
        </div>
        <div>
          <h3 className="font-bold mb-1 text-sm">Vehicle</h3>
          <p className="leading-tight">
            <strong>Vehicle:</strong> {vehicleSnap.year || ''} {vehicleSnap.make || ''} {vehicleSnap.model || ''} {vehicleSnap.trim || ''}
          </p>
          <p className="leading-tight"><strong>VIN:</strong> {vehicleSnap.vin || 'N/A'}</p>
          <p className="leading-tight"><strong>License:</strong> {vehicleSnap.license_plate || 'N/A'}</p>
          {vehicleSnap.color && <p className="leading-tight"><strong>Color:</strong> {vehicleSnap.color}</p>}
          {(snapshot.odometer || vehicleSnap.mileage) && (
            <p className="leading-tight">
              <strong>Odometer:</strong> {Number(snapshot.odometer || vehicleSnap.mileage).toLocaleString()} km
            </p>
          )}
          {snapshot.cvip && <p className="leading-tight"><strong>CVIP:</strong> {snapshot.cvip}</p>}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-3">
        <h3 className="font-bold mb-2 text-sm">Line Items (as approved)</h3>
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
            {items.map((item, index) => {
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

      {/* Notes to Customer */}
      {snapshot.notes_to_customer && (
        <div className="mb-3 break-inside-avoid">
          <h3 className="font-bold mb-1 text-sm">Notes to Customer</h3>
          <div className="border border-slate-300 p-2 text-xs whitespace-pre-wrap">
            {snapshot.notes_to_customer}
          </div>
        </div>
      )}

      {/* Terms of Service and Financial Summary */}
      <div className="grid grid-cols-2 gap-4 mb-3 break-inside-avoid">
        <div className="border border-slate-300 p-2">
          <h3 className="font-bold mb-1 text-xs">Shop Terms &amp; Conditions</h3>
          <p className="text-[8px] italic text-slate-500 mb-1">Current terms shown for reference; not captured in the original snapshot.</p>
          <div className="text-[9px] leading-tight whitespace-pre-wrap">
            {wipLegal || 'No terms of service defined.'}
          </div>
        </div>

        <div className="border border-slate-300 p-2">
          <div className="space-y-0.5 text-[9px]">
            {snapshot.ref_number && (
              <div className="flex justify-between font-semibold">
                <span>{snapshot.ref_number}</span>
                <span></span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Parts Subtotal:</span>
              <span className="font-semibold">${partsTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Labour Subtotal:</span>
              <span className="font-semibold">${laborTotal.toFixed(2)}</span>
            </div>
            {otherChargesTotal > 0 && (
              <div className="flex justify-between">
                <span>Other Charges:</span>
                <span className="font-semibold">${otherChargesTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-300">
              <span>Subtotal:</span>
              <span className="font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shop Supplies:</span>
              <span className="font-semibold">${shopSupplyTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%):</span>
              <span className="font-semibold">${taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t-2 border-black font-bold text-[10px]">
              <span>Grand Total:</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
            {amountPaid > 0 && (
              <>
                <div className="flex justify-between pt-1">
                  <span>Amount Paid:</span>
                  <span className="font-semibold">${amountPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Balance Due:</span>
                  <span>${balanceDue.toFixed(2)}</span>
                </div>
              </>
            )}

            {actualPayments.length > 0 && (
              <div className="pt-2 border-t border-slate-300">
                <h4 className="font-bold mb-1 text-[9px]">Payments Received:</h4>
                {actualPayments.map((p, pIdx) => (
                  <div key={pIdx} className="flex justify-between text-[8px] leading-tight">
                    <span>{formatDisplayDate(p.payment_date)} ({(p.payment_method || p.method || '').replace(/_/g, ' ')})</span>
                    <span>${(Number(p.amount) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

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

      {/* Legal footer */}
      <div className="mt-4 pt-3 border-t border-slate-300 text-center text-[9px] text-slate-600 break-inside-avoid">
        <p>
          This document reconstructs the exact work order snapshot (Portal ID: {snapshot.cp_id || 'N/A'}) presented to the
          customer via the Customer Portal on {formatTimestamp(snapshot.snapshot_date)}, together with the customer's
          recorded decision above. Figures reflect the totals at the time the snapshot was sent and may not include any
          changes made to the work order afterward.
        </p>
      </div>
    </div>
  );
}
