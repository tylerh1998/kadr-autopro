import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Car, Calendar, Phone, Mail, MapPin, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import { base44 } from '@/api/base44Client';

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
  const [createdByName, setCreatedByName] = useState('');
  const [lastUpdatedByName, setLastUpdatedByName] = useState('');
  const [completedByName, setCompletedByName] = useState('');

  const getUserDisplayName = async (email) => {
    if (!email) return '';
    
    if (email.endsWith('@no-reply.base44.com')) {
      return 'System';
    }

    try {
      // Try to fetch user name from User entity
      const users = await base44.entities.User.filter({ email });
      if (users && users.length > 0) {
        const user = users[0];
        return user.User_name || user.full_name || email;
      }
    } catch (error) {
      console.error('Error fetching user info for:', email, error);
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

  // Parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;
    return date;
  };

  const formatDate = (dateStr) => {
    const date = parseLocalDate(dateStr);
    return date ? format(date, 'MMM d, yyyy') : 'N/A';
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
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="grid lg:grid-cols-2 gap-6">
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
        </div>

        {/* Work Description */}
        {workOrder?.description && (
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Work Description</h3>
            <p className="text-slate-600 bg-slate-50 p-4 rounded-lg whitespace-pre-wrap border border-slate-100">
              {workOrder.description}
            </p>
          </div>
        )}
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
                  {formatDate(workOrder.invoice_date)}
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
                  {formatDate(workOrder.wo_date)}
                </p>
              )}
              
              {/* Status badge removed as per request */}
              
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
                  {formatDate(workOrder.scheduled_date)}
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



              {/* Audit Trail */}
              {(workOrder?.created_by || workOrder?.created_date) && (
                <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                  {workOrder.created_by && (
                    <div className="flex justify-between items-center">
                      <span>Created By:</span>
                      <span className="font-medium text-slate-700 truncate max-w-[120px]" title={createdByName}>
                        {createdByName}
                      </span>
                    </div>
                  )}
                  {workOrder.created_date && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Created:</span>
                      <span className="font-medium text-slate-700">
                        {(() => {
                          const dateStr = workOrder.created_date;
                          const dateObj = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
                          return format(toMountainTime(dateObj), 'MMM d, yyyy h:mm a');
                        })()}
                      </span>
                    </div>
                  )}
                  
                  {workOrder.last_updated_by && (
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2">
                      <span>Updated By:</span>
                      <span className="font-medium text-slate-700 truncate max-w-[120px]" title={lastUpdatedByName}>
                        {lastUpdatedByName}
                      </span>
                    </div>
                  )}
                  {workOrder.last_updated && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Updated:</span>
                      <span className="font-medium text-slate-700">
                        {(() => {
                          const dateStr = workOrder.last_updated;
                          const dateObj = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
                          return format(toMountainTime(dateObj), 'MMM d, yyyy h:mm a');
                        })()}
                      </span>
                    </div>
                  )}

                  {workOrder.completed_by && (
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2">
                      <span>Completed By:</span>
                      <span className="font-medium text-slate-700 truncate max-w-[120px]" title={completedByName}>
                        {completedByName}
                      </span>
                    </div>
                  )}
                  {workOrder.completed_date && (
                    <div className="flex justify-between items-center mt-1">
                      <span>Completed:</span>
                      <span className="font-medium text-slate-700">
                        {formatDate(workOrder.completed_date)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}