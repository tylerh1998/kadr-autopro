import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Car, FileText, Copy, History, Pencil, Phone, Mail, MapPin, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import ChangeCustomerModal from '../ChangeCustomerModal';

export default function WorkOrderHeaderInfo({
  workOrder,
  customer,
  vehicle,
  employees,
  onFieldChange,
  onStatusChange,
  isLocked,
  onEditCustomer,
  onChangeCustomer,
  onEditVehicle,
  onShowVehicleHistory,
  onEditWorkOrderDetails,
  onOpenOdometerPrompt,
  onOpenApprovals,
  onOpenVersionHistory,
  onShowVehicleDetails,
}) {
  const [createdByName, setCreatedByName] = useState('');
  const [lastUpdatedByName, setLastUpdatedByName] = useState('');
  const [completedByName, setCompletedByName] = useState('');
  const [showChangeCustomerModal, setShowChangeCustomerModal] = useState(false);

  const getUserDisplayName = async (email) => {
    if (!email) return '';
    
    if (email.endsWith('@no-reply.base44.com')) {
      return 'System';
    }

    // Fallback to employees list
    if (employees && employees.length > 0) {
      const employee = employees.find(e => e.email === email);
      if (employee) {
        return employee.full_name || `${employee.first_name} ${employee.last_name}`;
      }
    }

    return email;
  };

  useEffect(() => {
    const fetchNames = async () => {
      if (workOrder?.created_by) {
        const name = await getUserDisplayName(workOrder.created_by);
        setCreatedByName(name);
      } else {
        setCreatedByName('');
      }

      if (workOrder?.last_updated_by) {
        const name = await getUserDisplayName(workOrder.last_updated_by);
        setLastUpdatedByName(name);
      } else {
        setLastUpdatedByName('');
      }

      if (workOrder?.completed_by) {
        const name = await getUserDisplayName(workOrder.completed_by);
        setCompletedByName(name);
      } else {
        setCompletedByName('');
      }
    };

    fetchNames();
  }, [workOrder?.created_by, workOrder?.last_updated_by, workOrder?.completed_by, employees]);

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
    if (workOrder?.odometer !== null && workOrder?.odometer !== undefined && workOrder?.odometer !== '') {
      // WorkOrder has odometer - Blue hyperlink
      return { text: workOrder.odometer.toString(), color: 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300' };
    } else if (vehicle?.mileage !== null && vehicle?.mileage !== undefined && vehicle?.mileage !== '') {
      // Vehicle has mileage - Red hyperlink
      return { text: vehicle.mileage.toString(), color: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300' };
    } else if (vehicle?.odometer !== null && vehicle?.odometer !== undefined && vehicle?.odometer !== '') {
      // Vehicle has odometer (fallback if DB field differs) - Red hyperlink
      return { text: vehicle.odometer.toString(), color: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300' };
    } else {
      // No data - Red hyperlink
      return { text: 'None Recorded', color: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300' };
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

  const formatMountainDateTimeSafe = (dateValue) => {
    if (!dateValue) return '';

    try {
      const rawValue = String(dateValue).trim();
      if (!rawValue) return '';

      let normalizedValue = rawValue.replace(' ', 'T');
      if (/^[\d-]+$/.test(normalizedValue)) return formatDateDisplay(normalizedValue);
      if (/([+-]\d{2})$/.test(normalizedValue)) {
        normalizedValue = normalizedValue.replace(/([+-]\d{2})$/, '$1:00');
      }
      if (!normalizedValue.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(normalizedValue)) {
        normalizedValue = `${normalizedValue}Z`;
      }

      const dateObj = new Date(normalizedValue);
      if (Number.isNaN(dateObj.getTime())) return rawValue;

      const mountainDate = toMountainTime(dateObj);
      if (Number.isNaN(mountainDate.getTime())) return rawValue;

      return format(mountainDate, 'MMM d, yyyy h:mm a');
    } catch (e) {
      return String(dateValue);
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
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Customer
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                      {getCustomerDisplayName()}
                    </p>
                    {getCustomerContact() && (
                      <p className="text-slate-500 dark:text-slate-400 text-xs">
                        Contact: {getCustomerContact()}
                      </p>
                    )}
                    {customer?.phone && (
                      <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Phone className="w-3 h-3" />
                        {formatPhoneDisplay(customer.phone)}
                      </p>
                    )}
                    {customer?.email && (
                      <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="w-3 h-3" />
                        {customer?.email}
                      </p>
                    )}
                    {(customer?.address || customer?.city || customer?.state || customer?.zip_code) && (
                      <p className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
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
                <p className="text-slate-500 dark:text-slate-400">No customer information available</p>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChangeCustomerModal(true)}
                disabled={isLocked}
                className="w-full justify-start"
              >
                <User className="w-4 h-4 mr-2" />
                Change
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
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                    <Car className="w-5 h-5 text-green-600 dark:text-green-400" />
                    Vehicle
                  </h3>

                  <div 
                    className="space-y-1 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors p-2 -m-2 rounded-lg"
                    onClick={onShowVehicleDetails}
                    title="Click to view vehicle details"
                  >
                    <p className="text-slate-900 dark:text-slate-100 font-semibold text-base">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {vehicle.trim && (
                        <p className="text-slate-700 dark:text-slate-300">Trim: {vehicle.trim}</p>
                      )}
                      {vehicle.engine && (
                        <p className="text-slate-700 dark:text-slate-300">Engine: {vehicle.engine}</p>
                      )}
                    </div>
                    
                    {vehicle.vin && (
                      <p className="text-slate-700 dark:text-slate-300 text-xs font-mono break-all">VIN: {vehicle.vin}</p>
                    )}
                  </div>
                    
                  <div className="text-sm">
                    {/* Odometer Field as a Button for the new modal */}
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Odometer</label>
                      <button
                        type="button"
                        onClick={onOpenOdometerPrompt}
                        className={`block w-full text-left px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md ${odometerDisplay.color} underline font-medium`}
                        disabled={isLocked}
                      >
                        {odometerDisplay.text}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No vehicle information available</p>
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

      <ChangeCustomerModal
        open={showChangeCustomerModal}
        onClose={() => setShowChangeCustomerModal(false)}
        currentCustomer={customer}
        onSubmit={onChangeCustomer}
      />

      {/* Document Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Left Column - Data */}
            <div 
              className={`flex-1 ${!isLocked ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors p-2 -m-2 rounded-lg' : ''}`}
              onClick={!isLocked ? onEditWorkOrderDetails : undefined}
              title={!isLocked ? "Click to edit document details" : ""}
            >
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Document
                </h3>

                <div className="space-y-1 text-sm">
                  <p className="text-slate-900 dark:text-slate-100 font-semibold text-base">
                    {workOrder?.stage === 'estimate' ? `EST #${workOrder?.est_number || workOrder?.ro_number?.replace('RO', '') || 'N/A'}` : 
                     workOrder?.stage === 'invoice' ? `INV #${workOrder?.inv_number || 'N/A'}` : 
                     workOrder?.stage === 'credit_invoice' ? `CRINV #${workOrder?.crinv_number || 'N/A'}` : 
                     `WO #${workOrder?.wo_number || workOrder?.ro_number || 'N/A'}`}
                  </p>

                  {workOrder?.stage === 'estimate' && workOrder?.est_date && (
                    <p className="text-slate-700 dark:text-slate-300">{formatDateDisplay(workOrder.est_date)}</p>
                  )}

                  {workOrder?.stage !== 'estimate' && workOrder?.wo_date && (
                    <p className="text-slate-700 dark:text-slate-300">{formatDateDisplay(workOrder.wo_date)}</p>
                  )}

                  {workOrder?.po_number && (
                    <p className="text-slate-700 dark:text-slate-300">PO: {workOrder.po_number}</p>
                  )}

                  {workOrder?.cvip && (
                    <p className="text-slate-700 dark:text-slate-300">CVIP: {workOrder.cvip}</p>
                  )}

                  {workOrder?.description && (
                    <p className="text-slate-700 dark:text-slate-300">{workOrder.description}</p>
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
                  let docNum = '';
                  if (workOrder?.stage === 'estimate') docNum = workOrder?.est_number || workOrder?.ro_number?.replace('RO', '');
                  else if (workOrder?.stage === 'invoice') docNum = workOrder?.inv_number;
                  else if (workOrder?.stage === 'credit_invoice') docNum = workOrder?.crinv_number;
                  else docNum = workOrder?.wo_number?.replace('WO', '') || workOrder?.ro_number?.replace('RO', '');
                  copyToClipboard(docNum || '', 'Document Number');
                }}
                className="w-full justify-start"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Number
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
              
              {(workOrder?.created_by || workOrder?.created_date || workOrder?.last_updated_by || workOrder?.last_updated || workOrder?.completed_by || workOrder?.completed_date) && (
                <button
                  type="button"
                  onClick={onOpenVersionHistory}
                  className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md px-1 py-2 transition-colors"
                >
                  {workOrder.created_by && (
                    <div className="flex justify-between items-center">
                      <span>Created By:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={createdByName}>
                        {createdByName}
                      </span>
                    </div>
                  )}
                  {workOrder.created_date && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Created:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatMountainDateTimeSafe(workOrder.created_date)}
                      </span>
                    </div>
                  )}
                  {workOrder.last_updated_by && (
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                      <span>Updated By:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={lastUpdatedByName}>
                        {lastUpdatedByName}
                      </span>
                    </div>
                  )}
                  {workOrder.last_updated && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Updated:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatMountainDateTimeSafe(workOrder.last_updated)}
                      </span>
                    </div>
                  )}
                  {workOrder.completed_by && (
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                      <span>Completed By:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={completedByName}>
                        {completedByName}
                      </span>
                    </div>
                  )}
                  {workOrder.completed_date && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Completed:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatDateDisplay(workOrder.completed_date)}
                      </span>
                    </div>
                  )}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}