import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function SelectWorkOrderModal({ open, onClose, workOrders, customers, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

  const getCustomerDisplayName = (customerId) => {
    const customer = customers?.find(c => c.id === customerId);
    if (!customer) return 'Unknown Customer';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const getDisplayNumber = (workOrder) => {
    if (workOrder.stage === 'estimate') return workOrder.est_number;
    return workOrder.wo_number;
  };

  const getStageLabel = (stage) => {
    return stage === 'estimate' ? 'Estimate' : 'Work Order';
  };

  const filteredWorkOrders = (workOrders || []).filter(wo => {
    const searchLower = searchTerm.toLowerCase();
    const customerName = getCustomerDisplayName(wo.customer_id).toLowerCase();
    const displayNumber = getDisplayNumber(wo);
    
    return !searchTerm || 
      customerName.includes(searchLower) ||
      displayNumber?.toLowerCase().includes(searchLower) ||
      wo.ro_number?.toLowerCase().includes(searchLower) ||
      wo.description?.toLowerCase().includes(searchLower);
  });

  const handleSubmit = () => {
    if (selectedWorkOrder) {
      onSelect(selectedWorkOrder);
      setSelectedWorkOrder(null);
      setSearchTerm('');
    }
  };

  const handleClose = () => {
    setSelectedWorkOrder(null);
    setSearchTerm('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Work Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by customer, work order number, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Work Order List */}
          <div className="space-y-3 max-h-96 overflow-y-auto p-1">
            {filteredWorkOrders.map((workOrder) => {
              const displayNumber = getDisplayNumber(workOrder);
              const stageLabel = getStageLabel(workOrder.stage);
              const customerName = getCustomerDisplayName(workOrder.customer_id);
              
              return (
                <Card 
                  key={workOrder.id} 
                  className={`cursor-pointer transition-all border-2 ${
                    selectedWorkOrder?.id === workOrder.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'hover:border-blue-200'
                  }`}
                  onClick={() => setSelectedWorkOrder(workOrder)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-slate-500" />
                          <h4 className="font-semibold text-slate-900">{displayNumber}</h4>
                          <Badge variant="outline" className={
                            workOrder.stage === 'estimate' ? 'bg-yellow-50 text-yellow-700 border-yellow-300' : 'bg-blue-50 text-blue-700 border-blue-300'
                          }>
                            {stageLabel}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 font-medium">{customerName}</p>
                        <p className="text-sm text-slate-500 mt-1">{workOrder.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span>RO: {workOrder.ro_number}</span>
                          {workOrder.scheduled_date && (
                            <span>Scheduled: {format(new Date(workOrder.scheduled_date), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedWorkOrder}>
            Select Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}