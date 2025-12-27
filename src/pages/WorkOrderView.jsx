import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, WorkOrder, SystemSettings } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, CreditCard, AlertTriangle, Printer, X, Briefcase, Send, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';
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
  } = useWorkOrder(roNumber);
  const { inventory, employees, loading: invLoading } = useShopData();

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLineForWarranty, setSelectedLineForWarranty] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false); // Kept for fallback or legacy logic if needed
  const [wipLegal, setWipLegal] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [shopSupplyRate, setShopSupplyRate] = useState(0.07);

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

    // Check if the work order is an invoice
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

      // Step 2: Prompt user to convert back to work order
      const userConfirmed = window.confirm(
        "This document is an invoice. Do you want to convert it back to a work order to make changes?"
      );

      if (!userConfirmed) {
        // User clicked "No", do nothing
        return;
      }

      // Step 3: Convert the invoice back to work_order stage
      try {
        await WorkOrder.update(workOrder.id, { stage: 'work_order' });
        
        // Step 4: Redirect to WorkOrderEdit
        const url = `/WorkOrderEdit?id=${roNumber}`;
        navigate(url);
      } catch (error) {
        console.error('Error converting invoice back to work order:', error);
        alert('Failed to convert invoice back to work order. Please try again.');
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

  const getStageDisplay = (stage) => {
    switch (stage) {
      case 'estimate':
        return { text: 'Estimate', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
      case 'work_order':
        return { text: 'Work Order', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'invoice':
        return { text: 'Invoice', color: 'bg-green-100 text-green-800 border-green-200' };
      case 'credit_invoice':
        return { text: 'Credit Invoice', color: 'bg-red-100 text-red-800 border-red-200' };
      default:
        return { text: stage || 'Unknown', color: 'bg-gray-100 text-gray-800 border-gray-200' };
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

  const stageDisplay = getStageDisplay(workOrder.stage);

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

      <div className="min-h-screen bg-slate-50">
        {/* Screen View */}
        {!isPrinting && (
          <div className="p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header with Stage Indicator and Actions */}
              <div className="flex items-center justify-between no-print">
                <div className="flex items-center gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">
                      {workOrder.stage === 'estimate' ? `Estimate ${workOrder.est_number}` :
                        workOrder.stage === 'credit_invoice' ? `Credit Invoice ${workOrder.crinv_number}` :
                        workOrder.stage === 'invoice' ? `Invoice ${workOrder.inv_number}` :
                        `Work Order ${workOrder.wo_number || workOrder.ro_number}`}
                    </h1>
                    <p className="text-slate-600 mt-1">View Only Mode</p>
                  </div>
                  <Badge variant="outline" className={`${stageDisplay.color} border text-sm px-3 py-1`}>
                    {stageDisplay.text}
                  </Badge>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setShowNotesModal(true)}>
                    <FileText className="w-4 h-4 mr-2" />
                    WO Notes
                  </Button>

                  <Button variant="outline" onClick={() => setShowWorkPROModal(true)}>
                    <Briefcase className="w-4 h-4 mr-2" />
                    WorkPRO
                  </Button>

                  <Button variant="outline" onClick={() => setShowSendModal(true)}>
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>

                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>

                  <Button 
                    variant="outline" 
                    onClick={handleEditWorkOrder} 
                    disabled={workOrder.stage === 'credit_invoice'}
                    className="border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Work Order
                  </Button>

                  {workOrder.stage === 'invoice' && (
                    <Button variant="outline" onClick={handleCreateCreditInvoice} className="border-red-300 text-red-700 hover:bg-red-50">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Create Credit Invoice
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleExit}
                    className="bg-slate-100 hover:bg-slate-200"
                  >
                    Exit
                  </Button>
                </div>
              </div>

              {/* Work Order View Form */}
              <WorkOrderViewForm
                workOrder={workOrder}
                customer={customer}
                vehicle={vehicle}
                employees={employees}
                inventory={inventory}
                lineItems={lineItems}
                tagAlongs={tagAlongs}
                otherCharges={otherCharges}
                upcomingAppointment={upcomingAppointment}
                onPaymentsClick={() => setShowPaymentModal(true)}
                onReturnForWarranty={handleReturnForWarranty}
                shopSupplyRate={shopSupplyRate}
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
      />
    </>
  );
}