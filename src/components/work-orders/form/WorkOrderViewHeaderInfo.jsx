import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Car, Calendar, Phone, Mail, MapPin, Copy } from 'lucide-react';
import { format } from 'date-fns';

export default function WorkOrderViewHeaderInfo({
  workOrder,
  customer,
  vehicle,
  employees,
  onEditCustomer,
  onEditVehicle,
  onShowVehicleHistory,
  onEditWorkOrderDetails,
  onOpenWorkPRO,
}) {
  // Parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return new Date(year, month - 1, day);
  };

  // Helper function to get customer display name
  const getCustomerDisplayName = () => {
    if (!customer) return 'No Customer';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
  };

  // Helper function to get customer contact info for org customers
  const getCustomerContact = () => {
    if (!customer || !customer.org_name) return null;
    if (!customer.first_name && !customer.last_name) return null;
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  // Format phone number as XXX XXX XXXX for display
  const formatPhoneDisplay = (phone) => {
    if (!phone) return '';
    
    // Strip all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as XXX XXX XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    } else if (digits.length <= 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    
    // If more than 10 digits, just show all of them
    return digits;
  };

  const copyToClipboard = async (text, type) => {
    if (!text) {
      alert(`No ${type} available to copy.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      // Optional: Add a toast notification here instead of alert
    } catch (error) {
      alert(`Failed to copy ${type} to clipboard.`);
    }
  };

  const StatusBadge = ({ status }) => {
    const colors = {
      "Open": "bg-blue-100 text-blue-800 border-blue-200",
      "Parts On Order": "bg-yellow-100 text-yellow-800 border-yellow-200",
      "Scheduled": "bg-purple-100 text-purple-800 border-purple-200",
      "On Hold": "bg-gray-100 text-gray-800 border-gray-200",
      "Completed": "bg-green-100 text-green-800 border-green-200",
    };

    return (
      <Badge className={`${colors[status] || colors['On Hold']} border font-medium`}>
        {status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Customer Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Information
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-900">
                {getCustomerDisplayName()}
              </p>
              {getCustomerContact() && (
                <p className="text-slate-500 text-xs">
                  Contact: {getCustomerContact()}
                </p>
              )}
              {customer?.phone && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-600 flex-1">
                    <Phone className="w-4 h-4" />
                    <span>{formatPhoneDisplay(customer.phone)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(customer.phone, 'phone')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {customer?.email && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-600 flex-1">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(customer.email, 'email')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {(customer?.address || customer?.city || customer?.state) && (
                <p className="flex items-start gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <span>
                    {customer?.address}
                    {customer?.city && `, ${customer.city}`}
                    {customer?.state && `, ${customer.state}`}
                    {customer?.zip_code && ` ${customer.zip_code}`}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Car className="w-5 h-5" />
                Vehicle Information
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-900">
                {vehicle?.year} {vehicle?.make} {vehicle?.model}
              </p>
              {vehicle?.vin && (
                <p className="text-slate-600">
                  <span className="font-medium">VIN:</span> {vehicle.vin}
                </p>
              )}
              {vehicle?.license_plate && (
                <p className="text-slate-600">
                  <span className="font-medium">License:</span> {vehicle.license_plate}
                </p>
              )}
              {vehicle?.color && (
                <p className="text-slate-600">
                  <span className="font-medium">Color:</span> {vehicle.color}
                </p>
              )}
              {workOrder?.odometer && (
                <p className="text-slate-600">
                  <span className="font-medium">Odometer:</span> {workOrder.odometer.toLocaleString()} km
                </p>
              )}
            </div>
          </div>

          {/* Work Order Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Work Order Details
            </h3>
            <div className="space-y-2 text-sm">
              {workOrder?.invoice_date && (
                <p className="text-slate-600">
                  <span className="font-medium">Invoice Date:</span>{' '}
                  {format(parseLocalDate(workOrder.invoice_date), 'MMM d, yyyy')}
                </p>
              )}
              
              {(workOrder?.stage === 'estimate' && workOrder?.est_number) && (
                <p className="text-slate-600">
                  <span className="font-medium">Estimate #:</span> {workOrder.est_number}
                </p>
              )}
              
              {((workOrder?.stage === 'work_order' || workOrder?.stage === 'invoice' || workOrder?.stage === 'credit_invoice') && workOrder?.wo_number) && (
                <p className="text-slate-600">
                  <span className="font-medium">Work Order #:</span> {workOrder.wo_number}
                </p>
              )}
              
              {((workOrder?.stage === 'work_order' || workOrder?.stage === 'invoice' || workOrder?.stage === 'credit_invoice') && workOrder?.wo_date) && (
                <p className="text-slate-600">
                  <span className="font-medium">Work Order Date:</span>{' '}
                  {format(parseLocalDate(workOrder.wo_date), 'MMM d, yyyy')}
                </p>
              )}
              
              {(workOrder?.stage === 'work_order' || workOrder?.stage === 'estimate') && workOrder?.status && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-600">Status:</span>
                  <StatusBadge status={workOrder.status} />
                </div>
              )}
              
              {workOrder?.po_number && (
                <p className="text-slate-600">
                  <span className="font-medium">PO #:</span> {workOrder.po_number}
                </p>
              )}
              
              {workOrder?.cvip && (
                <p className="text-slate-600">
                  <span className="font-medium">CVIP:</span> {workOrder.cvip}
                </p>
              )}

              {workOrder?.technician && (
                <p className="text-slate-600">
                  <span className="font-medium">Technician:</span> {workOrder.technician}
                </p>
              )}
              
              {workOrder?.scheduled_date && (
                <p className="text-slate-600">
                  <span className="font-medium">Scheduled:</span>{' '}
                  {format(parseLocalDate(workOrder.scheduled_date), 'MMM d, yyyy')}
                </p>
              )}

              {workOrder?.customer_complaint && (
                <div>
                  <p className="font-medium text-slate-700 mb-1">Customer Complaint:</p>
                  <p className="text-slate-600 bg-slate-50 p-2 rounded">
                    {workOrder.customer_complaint}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Work Description */}
        {workOrder?.description && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Work Description</h4>
            <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
              {workOrder.description}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}