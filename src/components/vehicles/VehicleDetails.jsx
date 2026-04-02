import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getVehicleWorkOrderHistory } from "@/functions/getVehicleWorkOrderHistory";
import { 
  X, 
  Edit3, 
  User, 
  Car, 
  Gauge,
  Palette,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText
} from "lucide-react";
import { format } from "date-fns";

export default function VehicleDetails({ vehicle, customer, onClose, onEdit }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(true);

  useEffect(() => {
    const fetchWorkOrders = async () => {
      if (!vehicle?.id) {
        setWorkOrders([]);
        setLoadingWorkOrders(false);
        return;
      }

      setLoadingWorkOrders(true);
      try {
        const response = await getVehicleWorkOrderHistory({ vehicleId: vehicle.id });
        setWorkOrders(response.data?.workOrders || []);
      } catch (error) {
        console.error('Error fetching work orders:', error);
      } finally {
        setLoadingWorkOrders(false);
      }
    };

    fetchWorkOrders();
  }, [vehicle?.id]);



  const getDisplayNumber = (workOrder) => {
    if (workOrder.stage === 'estimate') return workOrder.est_number;
    if (workOrder.stage === 'invoice') return workOrder.inv_number;
    return workOrder.wo_number;
  };

  const getStageLabel = (stage) => {
    const labels = {
      estimate: 'Estimate',
      work_order: 'Work Order',
      invoice: 'Invoice',
      credit_invoice: 'Credit Invoice'
    };
    return labels[stage] || 'Work Order';
  };

  const getStageBadgeStyles = (stage) => {
    switch (stage) {
      case 'estimate':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'work_order':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'invoice':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'credit_invoice':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Open': 'bg-blue-100 text-blue-800',
      'Parts On Order': 'bg-yellow-100 text-yellow-800',
      'Scheduled': 'bg-purple-100 text-purple-800',
      'On Hold': 'bg-gray-100 text-gray-800',
      'Completed': 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="border-b bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <Car className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </CardTitle>
              {vehicle.license_plate && (
                <Badge variant="outline" className="mt-2 font-mono">
                  {vehicle.license_plate}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Vehicle Information */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Car className="w-5 h-5" />
                Vehicle Details
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Year</p>
                    <p className="text-lg font-semibold text-slate-900">{vehicle.year}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Make</p>
                    <p className="text-lg font-semibold text-slate-900">{vehicle.make}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-slate-500">Model</p>
                  <p className="text-lg font-semibold text-slate-900">{vehicle.model}</p>
                </div>

                {vehicle.color && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Color
                    </span>
                    <span className="text-slate-900 font-medium">{vehicle.color}</span>
                  </div>
                )}

                {vehicle.mileage && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      Mileage
                    </span>
                    <span className="text-slate-900 font-medium">{vehicle.mileage.toLocaleString()} km</span>
                  </div>
                )}

                {vehicle.engine && (
                  <div>
                    <p className="text-sm font-medium text-slate-500">Engine</p>
                    <p className="text-slate-900 font-medium">{vehicle.engine}</p>
                  </div>
                )}
              </div>
            </div>

            {vehicle.vin && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">VIN Number</p>
                  <p className="text-sm font-mono bg-slate-100 p-3 rounded-lg break-all text-slate-900">
                    {vehicle.vin}
                  </p>
                </div>
              </>
            )}

            {vehicle.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Notes
                  </p>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                    {vehicle.notes}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Owner Information */}
          <div className="space-y-6">
            {customer && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Owner Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Name</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {customer.org_name ? (
                        <>
                          <span className="block">{customer.org_name}</span>
                          {(customer.first_name || customer.last_name) && (
                            <span className="text-sm font-normal text-slate-500 block">
                              {customer.first_name} {customer.last_name}
                            </span>
                          )}
                        </>
                      ) : (
                        `${customer.first_name} ${customer.last_name}`
                      )}
                    </p>
                  </div>

                  {customer.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Phone
                      </span>
                      <a 
                        href={`tel:${customer.phone}`} 
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {customer.phone}
                      </a>
                    </div>
                  )}

                  {customer.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </span>
                      <a 
                        href={`mailto:${customer.email}`} 
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {customer.email}
                      </a>
                    </div>
                  )}

                  {customer.address && (
                    <div>
                      <p className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4" />
                        Address
                      </p>
                      <p className="text-sm text-slate-700">
                        {customer.address}
                        {customer.city && `, ${customer.city}`}
                        {customer.state && `, ${customer.state}`}
                        {customer.zip_code && ` ${customer.zip_code}`}
                      </p>
                    </div>
                  )}

                  {customer.notes && (
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Customer Notes</p>
                      <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                        {customer.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Service History */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Service History
              </h3>
              {loadingWorkOrders ? (
                <div className="space-y-3">
                  {Array(3).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : workOrders.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {workOrders.map((wo) => (
                    <a
                      key={wo.id}
                      href={`/WorkOrderEdit?id=${wo.ro_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors text-inherit hover:text-inherit no-underline"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-blue-700">
                            {getDisplayNumber(wo) || `RO ${wo.ro_number}`}
                          </p>
                          <Badge variant="outline" className={`text-xs ${getStageBadgeStyles(wo.stage)}`}>
                            {getStageLabel(wo.stage)}
                          </Badge>
                        </div>
                        <Badge className={`${getStatusColor(wo.status)} text-xs`}>
                          {wo.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                        {wo.description}
                      </p>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(wo.scheduled_date || wo.created_date), 'MMM d, yyyy')}
                        </span>
                        {wo.total_amount && (
                          <span className="font-medium text-slate-700">
                            ${wo.total_amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No service history yet</p>
                  <p className="text-xs mt-1">Work orders for this vehicle will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vehicle Metadata */}
        <Separator />
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Vehicle added: {new Date(vehicle.created_date).toLocaleDateString()}</span>
          {vehicle.updated_date !== vehicle.created_date && (
            <span>Last updated: {new Date(vehicle.updated_date).toLocaleDateString()}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}