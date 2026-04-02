import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, SystemSettings } from '@/entities/all';
import { saveworkorderdata } from '@/functions/saveworkorderdata';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, CreditCard, AlertTriangle, Printer, X, Briefcase, Send, FileText, BarChart3 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';

// Import hooks
import { useWorkOrder } from '../components/hooks/useWorkOrder';
import { useShopData } from '../components/hooks/useInventory';

// Import view-only form and report
import WorkOrderViewForm from '../components/work-orders/WorkOrderViewForm';
import WorkOrderReport from '../components/work-orders/WorkOrderReport';
import WorkOrderPdfModal from '../components/work-orders/WorkOrderPdfModal';
import WorkPROViewModal from '../components/work-orders/WorkPROViewModal';
import WarrantyReturnModal from '../components/work-orders/WarrantyReturnModal';
import SESEmailModal from '../components/work-orders/SESEmailModal';
import WONotesModal from '../components/work-orders/WONotesModal';
import AdvancePaymentModal from '../components/work-orders/AdvancePaymentModal';
import WorkOrderProfitability from '../components/work-orders/WorkOrderProfitability';
import VehicleDetails from '../components/vehicles/VehicleDetails';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export default function WorkOrderViewPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const navigate = useNavigate();
  const roNumber = urlParams.get('id');

  const {
    workOrder,
    customer,
    vehicle,
    lineItems,
    tagAlongs,
    otherCharges,
    upcomingAppointment,
    loading: workOrderLoading,
    error: workOrderError,
    refetch
  } = useWorkOrder(roNumber, { useFunctionData: true, lockAction: 'none' });
  const { inventory, employees, allEmployees, loading: invLoading } = useShopData();

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showProfitabilityModal, setShowProfitabilityModal] = useState(false);
  const [workPROProject, setWorkPROProject] = useState(null);
  const [workPROProjects, setWorkPROProjects] = useState([]);
  const [selectedLineForWarranty, setSelectedLineForWarranty] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false); // Kept for fallback or legacy logic if needed
  const [wipLegal, setWipLegal] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [shopSupplyRate, setShopSupplyRate] = useState(0.07);
  const [showVehicleDetailsModal, setShowVehicleDetailsModal] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setUserLoading(false);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const settings = await SystemSettings.list();
        if (settings && settings.length > 0) {
          setWipLegal(settings[0].wip_legal || '');
          setDefaultMessage(settings[0].default_message || '');
          if (settings[0].shop_supply_rate !== undefined) {
            setShopSupplyRate(settings[0].shop_supply_rate / 100);
          }
        }
      } catch (error) {
        console.error('Error loading system settings:', error);
      }
    };
    loadSystemSettings();
  }, []);

  // Fetch WorkPRO project data for Profitability
  useEffect(() => {
    const fetchWorkPROData = async () => {
      if (!workOrder?.wo_number) return;

      try {
        const projectResponse = await base44.functions.invoke('workProProxy', {
          entityName: 'Project',
          method: 'filter',
          params: {
            work_order: workOrder.wo_number
          }
        });

        if (projectResponse.data.success) {
          const projects = projectResponse.data.data || [];
          const foundProject = projects.length > 0 ? projects[0] : null;
          setWorkPROProject(foundProject);
          setWorkPROProjects(projects);
        }
      } catch (error) {
        console.error('Error fetching WorkPRO data:', error);
      }
    };

    fetchWorkPROData();
  }, [workOrder?.wo_number]);

  const handlePrint = () => {
    setShowPdfModal(true);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        setShowPdfModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleExit = () => {
    window.close();
  };

  const handleEditWorkOrder = async () => {
    if (!workOrder) return;

    // Check if the work order is a credit invoice - cannot be edited at this time
    if (workOrder.stage === 'credit_invoice') {
      alert("Cannot edit credit invoices at this time. This feature is coming soon. Contact the Administrator if you are experiencing issues.");
      return;
    }

    // Check if the work order is an invoice or void
    if (workOrder.stage === 'invoice' || workOrder.stage === 'void') {
      if (workOrder.stage === 'invoice') {
        // Check for existing credits
        const hasCredits = lineItems.some(line => line.credit || line.core_credit);
        if (hasCredits) {
          alert("This invoice cannot be converted back into a work order because a credit invoice has been created for this invoice.");
          return;
        }

        // Check if invoice_date exists
        if (!workOrder.invoice_date) {
          alert("This invoice does not have an invoice date set. Please contact the Administrator to resolve this issue before editing.");
          return;
        }

        // Step 1: Check fiscal period
        const { isValid, message } = await checkFiscalPeriodStatus(workOrder.invoice_date);
        
        if (!isValid) {
          // Show alert and return if fiscal period is closed or invalid
          alert(message);
          return;
        }
      }

      // Step 2: Prompt user to convert back to work order
      const documentType = workOrder.stage === 'void' ? 'a voided document' : 'an invoice';
      const userConfirmed = window.confirm(
        `This document is ${documentType}. Do you want to convert it back to a work order to make changes?`
      );

      if (!userConfirmed) {
        // User clicked "No", do nothing
        return;
      }

      // Step 3: Convert the invoice back to work_order stage
      try {
        await saveworkorderdata({ ro_number: workOrder.ro_number, data: { stage: 'work_order' } });
        
        // Step 4: Redirect to WorkOrderEdit
        const url = `/WorkOrderEdit?id=${roNumber}`;
        navigate(url);
      } catch (error) {
        console.error(`Error converting ${workOrder.stage} back to work order:`, error);
        alert(`Failed to convert ${workOrder.stage} back to work order. Please try again.`);
      }
    } else {
      // For non-invoice work orders, navigate directly to edit page
      const url = `/WorkOrderEdit?id=${roNumber}`;
      navigate(url);
    }
  };

  const handleCreateCreditInvoice = () => {
    if (!workOrder) return;
    
    // Simply redirect to CreditInvoice page with the current ro_number
    navigate(createPageUrl(`CreditInvoice?id=${workOrder.ro_number}`));
  };

  const handleReturnForWarranty = (lineItem) => {
    if (lineItem) {
      setSelectedLineForWarranty(lineItem);
      setShowWarrantyModal(true);
    }
  };

  const handleWarrantySuccess = () => {
    // Optionally refetch data or show success message
    refetch();
  };

  const getStageConfig = (stage) => {
    switch (stage) {
      case 'estimate':
        return { text: 'ESTIMATE', headerColor: 'bg-orange-500' };
      case 'work_order':
        return { text: 'WORK ORDER', headerColor: 'bg-blue-600' };
      case 'invoice':
        return { text: 'INVOICE', headerColor: 'bg-green-600' };
      case 'credit_invoice':
        return { text: 'CREDIT INVOICE', headerColor: 'bg-red-600' };
      case 'void':
        return { text: 'VOID', headerColor: 'bg-slate-500' };
      default:
        return { text: (stage || 'UNKNOWN').toUpperCase(), headerColor: 'bg-slate-500' };
    }
  };

  if (workOrderLoading || invLoading || userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-slate-600">Loading work order...</p>
        </div>
      </div>
    );
  }

  if (workOrderError || !workOrder) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Error Loading Work Order</h2>
          <p className="mt-2 text-slate-600">{workOrderError || 'Work order not found'}</p>
          <Button onClick={() => navigate(createPageUrl('WorkOrders'))} className="mt-4">
            Back to Work Orders
          </Button>
        </div>
      </div>
    );
  }

  const stageConfig = getStageConfig(workOrder.stage);

  return (
    <>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>

      <div className="min-h-screen">
        {/* Screen View */}
        {!isPrinting && (
          <div className="p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header with Stage Indicator and Actions */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
                {/* Stage/Number Box */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-w-[200px]">
                  <div className={`${stageConfig.headerColor} px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider`}>
                    {stageConfig.text}
                  </div>
                  <div className="px-4 py-2">
                    <h1 className="text-xl font-bold text-slate-900">
                      {workOrder.stage === 'estimate' ? (workOrder.est_number || 'New Estimate') :
                        workOrder.stage === 'credit_invoice' ? (workOrder.crinv_number || 'New Credit Invoice') :
                        workOrder.stage === 'invoice' ? (workOrder.inv_number || 'New Invoice') :
                        (workOrder.wo_number || workOrder.ro_number || 'New Work Order')}
                    </h1>
                    <p className="text-slate-500 text-xs">View Only Mode</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-stretch justify-start xl:justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowProfitabilityModal(true)}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal"
                  >
                    <BarChart3 className="w-5 h-5" />
                    <span className="leading-tight">Profitability</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowNotesModal(true)}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal"
                  >
                    <FileText className="w-5 h-5" />
                    <span className="leading-tight">WO Notes</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowWorkPROModal(true)}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal"
                  >
                    <Briefcase className="w-5 h-5" />
                    <span className="leading-tight">WorkPRO</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowSendModal(true)}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal"
                  >
                    <Send className="w-5 h-5" />
                    <span className="leading-tight">Send</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal"
                  >
                    <Printer className="w-5 h-5" />
                    <span className="leading-tight">Print</span>
                  </Button>

                  <Button 
                    variant="outline" 
                    onClick={handleEditWorkOrder} 
                    disabled={workOrder.stage === 'credit_invoice'}
                    className="h-auto min-h-[88px] w-[120px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit3 className="w-5 h-5" />
                    <span className="leading-tight">Edit Work Order</span>
                  </Button>

                  {workOrder.stage === 'invoice' && (
                    <Button
                      variant="outline"
                      onClick={handleCreateCreditInvoice}
                      className="h-auto min-h-[88px] w-[132px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <CreditCard className="w-5 h-5" />
                      <span className="leading-tight">Create Credit Invoice</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleExit}
                    className="h-auto min-h-[88px] w-[96px] flex-col gap-2 px-3 py-3 text-center text-xs sm:text-sm whitespace-normal bg-slate-100 hover:bg-slate-200"
                  >
                    <X className="w-5 h-5" />
                    <span className="leading-tight">Exit</span>
                  </Button>
                </div>
              </div>

              {/* Work Order View Form */}
              <WorkOrderViewForm
                workOrder={workOrder}
                customer={customer}
                vehicle={vehicle}
                employees={allEmployees || employees} // Use allEmployees for name lookup
                inventory={inventory}
                lineItems={lineItems}
                tagAlongs={tagAlongs}
                otherCharges={otherCharges}
                upcomingAppointment={upcomingAppointment}
                onPaymentsClick={() => setShowPaymentModal(true)}
                onReturnForWarranty={handleReturnForWarranty}
                shopSupplyRate={shopSupplyRate}
                onViewVehicleDetails={() => setShowVehicleDetailsModal(true)}
              />
            </div>
          </div>
        )}

        {/* Print View */}
        {isPrinting && (
          <div className="print-only">
            <WorkOrderReport
              workOrder={workOrder}
              customer={customer}
              vehicle={vehicle}
              lineItems={lineItems}
              wipLegal={wipLegal}
              defaultMessage={defaultMessage}
            />
          </div>
        )}
      </div>

      {/* WorkPRO Modal */}
      {showWorkPROModal && (
        <WorkPROViewModal
          open={showWorkPROModal}
          onClose={() => setShowWorkPROModal(false)}
          workOrder={workOrder}
          customer={customer}
        />
      )}

      {/* Warranty Return Modal */}
      {showWarrantyModal && selectedLineForWarranty && (
        <WarrantyReturnModal
          open={showWarrantyModal}
          onClose={() => {
            setShowWarrantyModal(false);
            setSelectedLineForWarranty(null);
          }}
          lineItem={selectedLineForWarranty}
          workOrder={workOrder}
          onSuccess={handleWarrantySuccess}
        />
      )}

      {/* Send Email Modal */}
      <SESEmailModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        workOrder={workOrder}
        customer={customer}
        vehicle={vehicle}
        lineItems={lineItems}
      />

      {/* Profitability Modal */}
      {lineItems && (
        <WorkOrderProfitability
          open={showProfitabilityModal}
          onClose={() => setShowProfitabilityModal(false)}
          workOrder={workOrder}
          lineItems={lineItems}
          workPROProject={workPROProject}
          workPROProjects={workPROProjects}
          employees={employees}
        />
      )}

      {/* WO Notes Modal (View Only) */}
      <WONotesModal
        open={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        workOrder={workOrder}
        viewOnly={true}
      />

      {/* Advance Payment Modal (View Only) */}
      <AdvancePaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        workOrder={workOrder}
        viewOnly={true}
        totalOwing={workOrder?.total_amount || 0}
      />

      {/* PDF Generation Modal */}
      <WorkOrderPdfModal
        open={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        workOrder={workOrder}
        customer={customer}
        vehicle={vehicle}
        lineItems={lineItems}
        wipLegal={wipLegal}
        defaultMessage={defaultMessage}
      />

      {/* Vehicle Details Modal */}
      <Dialog open={showVehicleDetailsModal} onOpenChange={setShowVehicleDetailsModal}>
        <DialogContent className="max-w-4xl p-0 bg-transparent border-0 shadow-none">
          {vehicle && customer && (
            <VehicleDetails
              vehicle={vehicle}
              customer={customer}
              onClose={() => setShowVehicleDetailsModal(false)}
              onEdit={() => {
                // If they want to edit, we can redirect or show an edit modal. For now, just close or navigate.
                setShowVehicleDetailsModal(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}