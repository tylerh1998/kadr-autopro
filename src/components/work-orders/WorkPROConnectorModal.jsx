import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Link, AlertCircle, Car, Calendar, FileText, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

export default function WorkPROConnectorModal({ open, onClose, project, workOrders, customers, vehicles, workPROProjects, onConnectionComplete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [linking, setLinking] = useState(false);
  
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [localVehicles, setLocalVehicles] = useState(vehicles || []);

  useEffect(() => {
    if (open) {
      const fetchSupabaseData = async () => {
        try {
          const custRes = await base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Customer' });
          if (custRes.data?.data) setLocalCustomers(custRes.data.data);
          
          const vehRes = await base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Vehicle' });
          if (vehRes.data?.data) setLocalVehicles(vehRes.data.data);
        } catch (error) {
          console.error("Error fetching from SupabaseProxy:", error);
        }
      };
      fetchSupabaseData();
    } else {
      setSearchTerm('');
      setSelectedWorkOrder(null);
      setShowConfirm(false);
    }
  }, [open]);

  // Filter work orders to only show estimate and work_order stages
  const availableWorkOrders = workOrders.filter(wo => 
    wo.stage === 'estimate' || wo.stage === 'work_order'
  );

  // Filter based on search term
  const filteredWorkOrders = availableWorkOrders.filter(wo => {
    const customer = localCustomers.find(c => c.id === wo.customer_id);
    const vehicle = localVehicles.find(v => v.id === wo.vehicle_id);
    const searchLower = searchTerm.toLowerCase();

    const woNumber = wo.wo_number?.toLowerCase() || '';
    const estNumber = wo.est_number?.toLowerCase() || '';
    const customerName = customer ? (customer.org_name || `${customer.first_name} ${customer.last_name}`).toLowerCase() : '';
    const vehicleInfo = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.toLowerCase() : '';
    const description = wo.description?.toLowerCase() || '';

    return !searchTerm || 
      woNumber.includes(searchLower) ||
      estNumber.includes(searchLower) ||
      customerName.includes(searchLower) ||
      vehicleInfo.includes(searchLower) ||
      description.includes(searchLower);
  });

  const handleLinkClick = () => {
    if (!selectedWorkOrder) return;
    setShowConfirm(true);
  };

  const handleConfirmLink = async () => {
    if (!selectedWorkOrder || !project) return;

    setLinking(true);
    try {
      const response = await base44.functions.invoke('workProProxy', {
        entityName: 'Project',
        method: 'update',
        id: project.id,
        params: {
          work_order: selectedWorkOrder.wo_number || selectedWorkOrder.est_number
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to link work order to project');
      }

      alert('Work order successfully linked to project!');
      onConnectionComplete();
      onClose();
    } catch (error) {
      console.error('Error linking work order:', error);
      alert('Failed to link work order. Please try again.');
    } finally {
      setLinking(false);
      setShowConfirm(false);
    }
  };

  // Helper function to find if work order has a project
  const getProjectForWorkOrder = (workOrder) => {
    const woNumber = workOrder.wo_number || workOrder.est_number;
    return workPROProjects?.find(p => p.work_order === woNumber);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-blue-600" />
            Link Work Order to Project
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Project Info */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Linking to Project:</p>
            <p className="font-semibold">{project?.name || 'Unnamed Project'}</p>
            {project?.customer_name && (
              <p className="text-sm text-slate-600">Customer: {project.customer_name}</p>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search work orders by customer, vehicle, or work order number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Work Orders List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredWorkOrders.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No work orders found matching your search.</p>
              </div>
            ) : (
              filteredWorkOrders.map((wo) => {
                const customer = localCustomers.find(c => c.id === wo.customer_id);
                const vehicle = localVehicles.find(v => v.id === wo.vehicle_id);
                const displayNumber = wo.stage === 'estimate' ? wo.est_number : wo.wo_number;
                const isSelected = selectedWorkOrder?.id === wo.id;
                const existingProject = getProjectForWorkOrder(wo);

                return (
                  <Card
                    key={wo.id}
                    className={`cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-2 border-blue-500 bg-blue-50' 
                        : 'hover:border-blue-200 hover:shadow-md'
                    }`}
                    onClick={() => setSelectedWorkOrder(wo)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left side: Work Order Info */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg">
                                {customer ? (customer.org_name || `${customer.first_name} ${customer.last_name}`) : 'Unknown Customer'}
                              </h4>
                              <Badge variant="outline" className="mt-1">
                                {wo.stage === 'estimate' ? 'Estimate' : 'Work Order'}
                              </Badge>
                            </div>
                          </div>

                          <p className="text-sm text-slate-600 mb-2">{wo.description}</p>

                          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                            {displayNumber && (
                              <div className="flex items-center gap-1">
                                <FileText className="w-4 h-4" />
                                <span>{displayNumber}</span>
                              </div>
                            )}
                            {vehicle && (
                              <div className="flex items-center gap-1">
                                <Car className="w-4 h-4" />
                                <span>{vehicle.year} {vehicle.make} {vehicle.model}</span>
                              </div>
                            )}
                            {(wo.est_date || wo.wo_date) && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  {format(new Date(wo.est_date || wo.wo_date), 'MMM d, yyyy')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right side: Project Status Badge */}
                        {existingProject && (
                          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-4 py-3 min-w-[200px]">
                            <div className="flex items-start gap-2">
                              <Briefcase className="w-5 h-5 text-amber-600 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">
                                  Project Linked
                                </p>
                                <p className="text-sm font-semibold text-amber-800 line-clamp-2">
                                  {existingProject.name || 'Unnamed Project'}
                                </p>
                                {existingProject.status && (
                                  <Badge variant="outline" className="mt-2 bg-white text-amber-700 border-amber-300 text-xs">
                                    {existingProject.status.replace(/_/g, ' ')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={linking}>
            Cancel
          </Button>
          <Button 
            onClick={handleLinkClick} 
            disabled={!selectedWorkOrder || linking}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Link className="w-4 h-4 mr-2" />
            Link to Project
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Link</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700">
              Are you sure you want to link <strong>{selectedWorkOrder?.wo_number || selectedWorkOrder?.est_number}</strong> to this project?
            </p>
            {selectedWorkOrder && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600">
                  Customer: {(() => {
                    const c = localCustomers.find(cust => cust.id === selectedWorkOrder.customer_id);
                    return c ? (c.org_name || `${c.first_name} ${c.last_name}`) : 'Unknown Customer';
                  })()}
                </p>
                <p className="text-sm text-slate-600">
                  Description: {selectedWorkOrder.description}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={linking}>
              No, Cancel
            </Button>
            <Button onClick={handleConfirmLink} disabled={linking} className="bg-blue-600 hover:bg-blue-700">
              {linking ? 'Linking...' : 'Yes, Link Work Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}