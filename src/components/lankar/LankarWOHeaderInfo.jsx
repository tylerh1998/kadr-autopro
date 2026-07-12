import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { User, Car, Calendar, Phone, Mail, MapPin } from 'lucide-react';
import { format } from 'date-fns';

const cleanText = (text) => {
  if (!text) return text;
  return String(text).replace(/^"|"$/g, '').trim();
};

const getStageLabel = (stage) => {
  const normalized = String(stage || '').toUpperCase();
  if (normalized === 'UINVOICE' || normalized === 'UPINVOICE') return 'Invoice';
  if (normalized === 'UWO' || normalized === 'UPWO') return 'Work Order';
  return stage || 'N/A';
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const normalized = String(dateStr).trim();

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return null;

  const [, month, day, year] = slashMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (dateStr) => {
  const date = parseLocalDate(dateStr);
  return date ? format(date, 'MMM d, yyyy') : 'N/A';
};

const getCustomerDisplayName = (customer) => {
  if (!customer) return 'No Customer Found';
  if (customer.org_name && customer.org_name.trim()) return customer.org_name;
  return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
};

export default function LankarWOHeaderInfo({ info, customer, vehicle }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4 min-w-0">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Customer Information
                </h3>
                <div className="space-y-2 text-sm min-w-0 break-words">
                  <p className="font-medium text-slate-900 break-words">{getCustomerDisplayName(customer)}</p>
                  {customer?.phone && (
                    <p className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4" />{customer.phone}</p>
                  )}
                  {customer?.email && (
                    <p className="flex items-center gap-2 text-slate-600"><Mail className="w-4 h-4" />{customer.email}</p>
                  )}
                  {(customer?.address || customer?.city || customer?.state) && (
                    <p className="flex items-start gap-2 text-slate-600"><MapPin className="w-4 h-4 mt-0.5" /><span>{customer?.address}{customer?.city ? `, ${customer.city}` : ''}{customer?.state ? `, ${customer.state}` : ''}{customer?.zip_code ? ` ${customer.zip_code}` : ''}</span></p>
                  )}
                </div>
              </div>

              <div className="space-y-4 min-w-0">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Vehicle Information
                </h3>
                <div className="space-y-2 text-sm min-w-0 break-words">
                  <p className="font-medium text-slate-900">{vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Vehicle Found' : 'No Vehicle Found'}</p>
                  {vehicle?.vin && <p className="text-slate-600"><span className="font-medium">VIN:</span> {vehicle.vin}</p>}
                  {vehicle?.license_plate && <p className="text-slate-600"><span className="font-medium">License:</span> {vehicle.license_plate}</p>}
                  {vehicle?.color && <p className="text-slate-600"><span className="font-medium">Color:</span> {vehicle.color}</p>}
                  {info?.txtOdometer && <p className="text-slate-600"><span className="font-medium">Odometer:</span> {info.txtOdometer}</p>}
                </div>
              </div>
            </div>

            {info?.txtCustomerRequests && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Customer Requests</h3>
                <p className="text-slate-600 bg-slate-50 p-4 rounded-lg whitespace-pre-wrap border border-slate-100">{info.txtCustomerRequests}</p>
              </div>
            )}

            {info?.Summary && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Summary</h3>
                <p className="text-slate-600 bg-slate-50 p-4 rounded-lg whitespace-pre-wrap border border-slate-100">{cleanText(info.Summary)}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Document Details
            </h3>
            <div className="space-y-2 text-sm">
              {info?.WOorPWOorEorINVorCRED && <p className="text-slate-600"><span className="font-medium">Type:</span> {getStageLabel(info.WOorPWOorEorINVorCRED)}</p>}
              {info?.woid && <p className="text-slate-600"><span className="font-medium">Work Order #:</span> {info.woid}</p>}
              {info?.invoiceid && <p className="text-slate-600"><span className="font-medium">Invoice #:</span> {info.invoiceid}</p>}
              {info?.wodate && <p className="text-slate-600"><span className="font-medium">Work Order Date:</span> {formatDate(info.wodate)}</p>}
              {info?.invoicedate && <p className="text-slate-600"><span className="font-medium">Invoice Date:</span> {formatDate(info.invoicedate)}</p>}
              {info?.ponum && <p className="text-slate-600"><span className="font-medium">PO #:</span> {info.ponum}</p>}
              {info?.estid && <p className="text-slate-600"><span className="font-medium">Estimate ID:</span> {info.estid}</p>}
              {info?.WOdeleted && <p className="text-slate-600"><span className="font-medium">Deleted Flag:</span> {info.WOdeleted}</p>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}