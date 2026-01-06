import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Car, FileText, Copy, History, Pencil, Phone, Mail, MapPin, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function WorkOrderHeaderInfo({
  workOrder,
  customer,
  vehicle,
  employees,
  onFieldChange,
  onStatusChange,
  isLocked,
  onEditCustomer,
  onEditVehicle,
  onShowVehicleHistory,
  onEditWorkOrderDetails,
  onOpenOdometerPrompt,
  onOpenApprovals,
}) {
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

  const copyToClipboard = (text, type) => {
    if (!text) {
      alert(`No ${type} available to copy.`);
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      // Optional: Add a toast notification here instead of alert
    }).catch(() => {
      alert(`Failed to copy ${type} to clipboard.`);
    });
  };

  // Determine odometer display value and color
  const getOdometerDisplay = () => {
    if (workOrder?.odometer !== null && workOrder?.odometer !== undefined) {
      // WorkOrder has odometer - Blue hyperlink
      return { text: workOrder.odometer.toString(), color: 'text-blue-600 hover:text-blue-800' };
    } else if (vehicle?.mileage !== null && vehicle?.mileage !== undefined) {
      // Vehicle has mileage - Red hyperlink
      return { text: vehicle.mileage.toString(), color: 'text-red-600 hover:text-red-800' };
    } else {
      // No data - Red hyperlink
      return { text: 'None Recorded', color: 'text-red-600 hover:text-red-800' };
    }
  };

  const odometerDisplay = getOdometerDisplay();

  // Format date - FIXED to avoid timezone issues
  const formatDateDisplay = (dateString) => {
    if (!dateString) return '';
    try {
      // Parse YYYY-MM-DD as local date to avoid timezone shift
      const [year, month, day] = dateString.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      return format(localDate, 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Customer Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Left Column - Data */}
            <div className="flex-1">
              {customer ? (
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <User className="w-5 h-5 text-blue-600" />
                    Customer
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-slate-900 text-base">
                      {getCustomerDisplayName()}
                    </p>
                    {getCustomerContact() && (
                      <p className="text-slate-500 text-xs">
                        Contact: {getCustomerContact()}
                      </p>
                    )}
                    {customer?.phone && (
                      <p className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-3 h-3" />
                        {formatPhoneDisplay(customer.phone)}
                      </p>
                    )}
                    {customer?.email && (
                      <p className="flex items-center gap-2 text-slate-600">
                        <Mail className="w-3 h-3" />
                        {customer?.email}
                      </p>
                    )}
                    {(customer?.address || customer?.city || customer?.state || customer?.zip_code) && (
                      <p className="flex items-start gap-2 text-slate-600">
                        <MapPin className="w-3 h-3 mt-0.5" />
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
              ) : (
                <p className="text-slate-500">No customer information available</p>
              )}
            </div>

            {/* Right Column - Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onEditCustomer}
                disabled={isLocked}
                className="w-full justify-start"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              {customer?.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(customer.phone, 'Phone')}
                  className="w-full justify-start"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Phone
                </Button>
              )}
              {customer?.email && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(customer.email, 'Email')}
                  className="w-full justify-start"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Email
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vehicle Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Left Column - Data */}
            <div className="flex-1">
              {vehicle ? (
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Car className="w-5 h-5 text-green-600" />
                    Vehicle
                  </h3>

                  <div className="space-y-1 text-sm">
                    <p className="text-slate-900 font-semibold text-base">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {vehicle.trim && (
                        <p className="text-slate-700">Trim: {vehicle.trim}</p>
                      )}
                      {vehicle.engine && (
                        <p className="text-slate-700">Engine: {vehicle.engine}</p>
                      )}
                    </div>
                    
                    {vehicle.vin && (
                      <p className="text-slate-700 text-xs font-mono break-all">VIN: {vehicle.vin}</p>
                    )}
                    
                    {/* Odometer Field as a Button for the new modal */}
                    <div>
                      <label className="text-sm font-medium text-slate-700">Odometer</label>
                      <button
                        type="button"
                        onClick={onOpenOdometerPrompt}
                        className={`block w-full text-left px-3 py-2 border border-slate-300 rounded-md ${odometerDisplay.color} underline font-medium`}
                        disabled={isLocked}
                      >
                        {odometerDisplay.text}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">No vehicle information available</p>
              )}
            </div>

            {/* Right Column - Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onEditVehicle}
                disabled={isLocked}
                className="w-full justify-start"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onShowVehicleHistory}
                className="w-full justify-start"
              >
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
              {vehicle?.vin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(vehicle.vin, 'VIN')}
                  className="w-full justify-start"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy VIN
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Left Column - Data */}
            <div className="flex-1">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-purple-600" />
                  Document
                </h3>

                <div className="space-y-1 text-sm">
                  <p className="text-slate-900 font-semibold text-base">WO #{workOrder?.wo_number || workOrder?.ro_number || 'N/A'}</p>

                  {workOrder?.stage === 'estimate' && workOrder?.est_date && (
                    <p className="text-slate-700">{formatDateDisplay(workOrder.est_date)}</p>
                  )}

                  {workOrder?.stage !== 'estimate' && workOrder?.wo_date && (
                    <p className="text-slate-700">{formatDateDisplay(workOrder.wo_date)}</p>
                  )}

                  {workOrder?.po_number && (
                    <p className="text-slate-700">PO: {workOrder.po_number}</p>
                  )}

                  {workOrder?.cvip && (
                    <p className="text-slate-700">CVIP: {workOrder.cvip}</p>
                  )}

                  {workOrder?.description && (
                    <p className="text-slate-700">{workOrder.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onEditWorkOrderDetails}
                disabled={isLocked}
                className="w-full justify-start"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const woNumber = workOrder?.wo_number?.replace('WO', '') || workOrder?.ro_number?.replace('RO', '') || '';
                  copyToClipboard(woNumber, 'WO Number');
                }}
                className="w-full justify-start"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy WO#
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenApprovals}
                className="w-full justify-start"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Approvals
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}