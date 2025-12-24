import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { User, WorkOrder, InventoryItem, InventoryTxs, SystemSettings } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, AlertTriangle, Printer, X, Briefcase, Save, User as UserIcon, Car, Phone, Mail, FileText, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Import hooks
import { useWorkOrder } from '../components/hooks/useWorkOrder';
import { useShopData } from '../components/hooks/useInventory';

// Import view-only form and report
import CreditInvoiceForm from '../components/work-orders/CreditInvoiceForm';
import WorkOrderReport from '../components/work-orders/WorkOrderReport';
import WorkPROViewModal from '../components/work-orders/WorkPROViewModal';
import ConfirmCreditInvoiceModal from '../components/work-orders/ConfirmCreditInvoiceModal';

export default function CreditInvoicePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roNumber = searchParams.get('id');

  const { workOrder, customer, vehicle, lineItems, tagAlongs, loading: woLoading, error: woError, refetch } = useWorkOrder(roNumber);
  const { inventory, employees, loading: invLoading } = useShopData();

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedLines, setSelectedLines] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wipLegal, setWipLegal] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');

  // Parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(year, month - 1, day);
  };

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
        }
      } catch (error) {
        console.error('Error loading system settings:', error);
      }
    };
    loadSystemSettings();
  }, []);

  // Initialize selectedLines when lineItems load
  useEffect(() => {
    if (lineItems && lineItems.length > 0) {
      setSelectedLines(lineItems.map(() => false));
    }
  }, [lineItems]);

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  const handleCreateCreditInvoice = async () => {
    if (!workOrder) return;

    const hasSelectedLines = selectedLines.some(selected => selected);
    if (!hasSelectedLines) {
      alert('Please select at least one line item to credit.');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmCreditInvoice = async (refundSource, cashDrawerPaymentType) => {
    console.log('=== DEBUG: handleConfirmCreditInvoice called ===');
    console.log('Refund source:', refundSource);
    console.log('Selected lines:', selectedLines);
    
    setShowConfirmModal(false);
    setProcessing(true);
    
    try {
      const selectedLineItems = lineItems.filter((_, index) => selectedLines[index]);
      
      console.log('Selected line items to credit:', selectedLineItems);
      
      const creditSubtotal = selectedLineItems.reduce((sum, line) => {
        const lineTotal = parseFloat(line.total) || 0;
        return sum + lineTotal;
      }, 0);
      
      const creditTaxAmount = selectedLineItems.reduce((sum, line) => {
        const lineTotal = parseFloat(line.total) || 0;
        const taxable = line.taxable !== false;
        if (taxable) {
          // Assuming a default tax rate if not specified, or fetching from a global config.
          // For now, using 5% as per original code's calculation logic.
          return sum + (lineTotal * 0.05);
        }
        return sum;
      }, 0);
      
      const creditTotalAmount = creditSubtotal + creditTaxAmount;
      
      console.log('Credit subtotal:', creditSubtotal);
      console.log('Credit tax:', creditTaxAmount);
      console.log('Credit total:', creditTotalAmount);
      
      // Extract numeric part from invoice number (e.g., INV1001 -> 1001)
      const invNumberMatch = workOrder.inv_number?.match(/\d+/);
      const invNumericPart = invNumberMatch ? invNumberMatch[0] : '0000';
      
      // Find existing credit invoices for this invoice to determine suffix
      const existingCreditInvoices = await WorkOrder.filter({ 
        customer_id: workOrder.customer_id,
        stage: 'credit_invoice'
      });
      
      // Filter to only those related to this original invoice
      const relatedCredits = existingCreditInvoices.filter(ci => {
        try {
          // Check if the description of the credit invoice matches the original invoice number
          return ci.description && ci.description.includes(workOrder.inv_number);
        } catch (e) {
          console.error("Error parsing credit invoice description:", e);
          return false;
        }
      });
      
      // Determine next numeric suffix (1, 2, 3, etc.)
      const nextSuffix = relatedCredits.length + 1;
      const creditInvoiceNumber = `CRINV${invNumericPart}-${nextSuffix}`;
      const uniqueRoNumber = creditInvoiceNumber;
      
      console.log('Generated unique RO number:', uniqueRoNumber);
      
      const creditInvoiceData = {
        ro_number: uniqueRoNumber, // Use the generated unique RO number
        crinv_number: creditInvoiceNumber, // Use the base credit invoice number for crinv_number
        customer_id: workOrder.customer_id,
        vehicle_id: workOrder.vehicle_id,
        status: 'Completed',
        priority: workOrder.priority || 'medium',
        stage: 'credit_invoice',
        description: `Credit Invoice for ${workOrder.inv_number}`,
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        parts_total: -Math.abs(creditSubtotal),
        tax_amount: -Math.abs(creditTaxAmount),
        total_amount: -Math.abs(creditTotalAmount),
        line_items: JSON.stringify(selectedLineItems.map(line => {
          const lineTotal = parseFloat(line.total) || 0;
          // For other charges, if oc_total isn't set, use the line total
          // This ensures the credit shows up in the "Other Charges" breakdown
          const ocTotalSource = (line.is_other_charge || line.other_charge_id) 
              ? ((parseFloat(line.oc_total) || 0) !== 0 ? (parseFloat(line.oc_total) || 0) : lineTotal)
              : (parseFloat(line.oc_total) || 0);

          return {
            ...line,
            total: -Math.abs(lineTotal),
            tot_parts: -Math.abs(parseFloat(line.tot_parts) || 0),
            labour: -Math.abs(parseFloat(line.labour) || 0),
            oc_total: -Math.abs(ocTotalSource),
          };
        })),
        payments: JSON.stringify([{
          id: Date.now(),
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          amount: -Math.abs(creditTotalAmount),
          payment_method: refundSource,
          reference: `Credit for ${workOrder.inv_number}`,
        }]),
        amount_paid: -Math.abs(creditTotalAmount),
        cp_id: workOrder.cp_id,
      };
      
      console.log('Creating credit invoice:', creditInvoiceData);
      
      const createdCreditInvoice = await WorkOrder.create(creditInvoiceData);
      console.log('Created credit invoice:', createdCreditInvoice);

      // Invoke GL function to create accounting entries for the credit invoice
      const systemSettingsData = await SystemSettings.list();
      const currentSystemSettings = systemSettingsData && systemSettingsData.length > 0 ? systemSettingsData[0] : {};

      const glResponse = await base44.functions.invoke('handleCreditInvoiceGL', {
        workOrder: createdCreditInvoice,
        lineItems: JSON.parse(createdCreditInvoice.line_items),
        payments: JSON.parse(createdCreditInvoice.payments),
        systemSettings: currentSystemSettings
      });

      if (glResponse.data.success) {
        await WorkOrder.update(createdCreditInvoice.id, {
          accounting_details: glResponse.data.accounting_details
        });
        console.log('GL transactions for credit invoice recorded successfully.');
      } else {
        console.error('Failed to record GL transactions for credit invoice:', glResponse.data.error);
      }

      for (const line of selectedLineItems) {
        if (line.inventory_item_id) {
          try {
            const inventoryItem = inventory.find(i => i.id === line.inventory_item_id);
            if (inventoryItem) {
              const returnQty = parseFloat(line.qty) || 0;
              const newQOH = (parseFloat(inventoryItem.quantity_on_hand) || 0) + returnQty;
              
              await InventoryItem.update(line.inventory_item_id, {
                quantity_on_hand: newQOH
              });
              
              await InventoryTxs.create({
                inventory_item_id: line.inventory_item_id,
                ro_number: workOrder.ro_number, // This should reference the original RO number for the transaction context
                part_num: line.part_number || inventoryItem.part_number,
                tx_date: new Date().toISOString(),
                tx_type: 'Credit Received',
                quantity_change: returnQty,
                quantity_ordered_change: 0,
                description: `Credit invoice ${creditInvoiceNumber} - returned to stock` // Use creditInvoiceNumber
              });
              
              console.log(`Returned ${returnQty} units of ${line.part_number} to inventory`);
            }
          } catch (error) {
            console.error(`Error updating inventory for item ${line.inventory_item_id}:`, error);
          }
        }
      }
      
      // Mark credited lines on original work order with credit invoice number
      const updatedLineItems = lineItems.map((line, index) => {
        if (selectedLines[index]) {
          // Store the actual credit invoice number reference
          return { ...line, credit: creditInvoiceNumber };
        }
        return line;
      });
      
      await WorkOrder.update(workOrder.id, {
        line_items: JSON.stringify(updatedLineItems)
      });
      
      console.log('Updated original work order line items with credit reference');

      // Create CustomerPayment record for the refund
      if (refundSource === 'cash_drawer' || refundSource === 'on_account') {
        const { CustomerPayments } = await import('@/entities/all');
        
        let paymentMethod;
        if (refundSource === 'cash_drawer') {
          paymentMethod = cashDrawerPaymentType; // 'cash', 'debit', or 'credit'
        } else if (refundSource === 'on_account') {
          paymentMethod = 'on_account';
        }

        await CustomerPayments.create({
          customer_id: workOrder.customer_id,
          work_order_id: workOrder.id,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          amount: -Math.abs(creditTotalAmount),
          payment_method: paymentMethod,
          notes: `Refund for credit invoice ${creditInvoiceNumber}`,
          cash_drawer: refundSource === 'cash_drawer'
        });

        console.log('Created CustomerPayment refund record');
      }
      
      alert(`Credit invoice ${creditInvoiceNumber} created successfully!`);
      
      navigate(createPageUrl(`WorkOrderView?id=${creditInvoiceNumber}`));
      
    } catch (error) {
      console.error('Error creating credit invoice:', error);
      alert('Failed to create credit invoice: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };



  const handleToggleLine = (index) => {
    setSelectedLines(prev => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

  const loading = woLoading || invLoading || userLoading;
  const hasSelectedLines = selectedLines.some(selected => selected);

  if (woError || (!workOrder && !woLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Error Loading Work Order</h2>
          <p className="mt-2 text-slate-600">{woError || 'Work Order not found'}</p>
          <Button onClick={() => navigate(createPageUrl('WorkOrders'))} className="mt-4">
            Back to Work Orders
          </Button>
        </div>
      </div>
    );
  }

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
          body, html {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background-color: white !important;
            background: white !important;
          }
          * {
            background-color: transparent !important;
            background: transparent !important;
          }
          .print-only, .print-only * {
            background-color: white !important;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>

      {!isPrinting && (
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between no-print">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Create Credit Invoice</h1>
                <p className="text-slate-600 mt-1">Refund or credit customer for work order {workOrder?.wo_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleCreateCreditInvoice}
                  disabled={!hasSelectedLines || processing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Create Credit Invoice
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => navigate(createPageUrl('WorkOrderView') + `?id=${roNumber}`)}
                  variant="outline"
                  className="bg-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Return to Invoice
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.close()}
                  className="bg-white"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            ) : (
              <>
                <Card className="no-print">
                  <CardHeader>
                    <CardTitle>Invoice Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Invoice Date</p>
                        <p className="font-semibold">{workOrder?.invoice_date ? format(parseLocalDate(workOrder.invoice_date), 'MMM d, yyyy') : 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Work Order #</p>
                        <p className="font-semibold">{workOrder?.wo_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Work Order Date</p>
                        <p className="font-semibold">{workOrder?.wo_date ? format(parseLocalDate(workOrder.wo_date), 'MMM d, yyyy') : 'Not set'}</p>
                      </div>
                      {workOrder?.po_number && (
                        <div>
                          <p className="text-sm text-slate-600 mb-1">PO Number</p>
                          <p className="font-semibold">{workOrder.po_number}</p>
                        </div>
                      )}
                      {workOrder?.description && (
                        <div className="md:col-span-3">
                          <p className="text-sm text-slate-600 mb-1">Work Description</p>
                          <p className="font-semibold">{workOrder.description}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserIcon className="w-5 h-5" />
                        Customer Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {customer ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-lg">{customer.first_name} {customer.last_name}</p>
                          <div className="text-sm text-slate-600 space-y-1">
                            <p className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              {customer.phone}
                            </p>
                            {customer.email && (
                              <p className="flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                {customer.email}
                              </p>
                            )}
                            {customer.address && (
                              <div className="mt-2 pt-2 border-t">
                                <p>{customer.address}</p>
                                <p>{customer.city}, {customer.state} {customer.zip_code}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500">No customer information available</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Car className="w-5 h-5" />
                        Vehicle Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {vehicle ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-lg">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                          <div className="text-sm text-slate-600 space-y-1">
                            <p><span className="font-medium">VIN:</span> {vehicle.vin || 'N/A'}</p>
                            <p><span className="font-medium">License:</span> {vehicle.license_plate || 'N/A'}</p>
                            {vehicle.unit_number && <p><span className="font-medium">Unit #:</span> {vehicle.unit_number}</p>}
                            {workOrder?.odometer && (
                              <p><span className="font-medium">Odometer:</span> {workOrder.odometer.toLocaleString()} km</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500">No vehicle information available</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <CreditInvoiceForm
                  workOrder={workOrder}
                  customer={customer}
                  vehicle={vehicle}
                  employees={employees}
                  inventory={inventory}
                  lineItems={lineItems}
                  tagAlongs={tagAlongs}
                  selectedLines={selectedLines}
                  onToggleLine={handleToggleLine}
                />
              </>
            )}
          </div>
        </div>
      )}

      {isPrinting && (
        <WorkOrderReport
          workOrder={workOrder}
          customer={customer}
          vehicle={vehicle}
          lineItems={lineItems.filter((_, index) => selectedLines[index])}
          wipLegal={wipLegal}
          defaultMessage={defaultMessage}
        />
      )}

      {showWorkPROModal && (
        <WorkPROViewModal
          open={showWorkPROModal}
          onClose={() => setShowWorkPROModal(false)}
          workOrder={workOrder}
          customer={customer}
        />
      )}

      <ConfirmCreditInvoiceModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        selectedLines={selectedLines}
        lineItems={lineItems}
        workOrder={workOrder}
        onConfirmCreditInvoice={handleConfirmCreditInvoice}
      />
    </>
  );
}