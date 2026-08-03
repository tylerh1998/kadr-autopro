import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SystemSettings } from "@/entities/SystemSettings";
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, AlertTriangle, Printer, X, Briefcase, Save, User as UserIcon, Car, Phone, Mail, FileText, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';

// Import hooks
import { useWorkOrder } from '../components/hooks/useWorkOrder';
import { useShopData } from '../components/hooks/useInventory';

// Import view-only form and report
import CreditInvoiceForm from '../components/work-orders/CreditInvoiceForm';
import WorkOrderReport from '../components/work-orders/WorkOrderReport';
import WorkPROViewModal from '../components/work-orders/WorkPROViewModal';
import ConfirmCreditInvoiceModal from '../components/work-orders/ConfirmCreditInvoiceModal';

export default function CreditInvoicePage() {
  const { employee } = useAuth();
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
  const [processedLineItems, setProcessedLineItems] = useState([]); // Virtual lines support
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wipLegal, setWipLegal] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [shopSupplyRate, setShopSupplyRate] = useState(0.06);

  // Parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(year, month - 1, day);
  };

  // Process line items to include virtual core lines
  useEffect(() => {
    if (lineItems && lineItems.length > 0) {
      const processed = [];
      lineItems.forEach(line => {
        processed.push(line);
        // Check for outstanding cores
        const coreNum = parseFloat(line.Core_num) || 0;
        const coreRet = parseFloat(line.core_ret) || 0;
        const outstanding = coreNum - coreRet;
        
        if (outstanding > 0) {
          processed.push({
            ...line,
            id: `${line.id}_core`,
            original_line_id: line.id,
            is_core_virtual: true,
            description: `CORE - ${line.description}`,
            qty: outstanding,
            parts_ea: (line.core_osamt || 0) / outstanding, // Sell Price Per Unit
            cost_ea: line.core_cost || 0, // Cost Price Per Unit (for GL)
            core_cost: line.core_cost || 0, // Preserve core_cost explicitly
            tot_parts: line.core_osamt || 0,
            total: line.core_osamt || 0,
            labour: 0,
            // Map core_credit to credit for display purposes (so it shows as disabled/credited in table)
            credit: line.core_credit, 
            // Ensure other fields don't interfere
            is_other_charge: false,
            other_charge_id: null,
            // Reset core fields on the virtual line so it doesn't spawn more cores recursively if processed again
            Core_num: 0,
            core_ret: 0,
            core_osamt: 0
          });
        }
      });
      setProcessedLineItems(processed);
      // Initialize selected lines for the new processed list
      setSelectedLines(processed.map(() => false));
    }
  }, [lineItems]);

  useEffect(() => {
    setUser(employee);
    setUserLoading(false);
  }, [employee]);

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

  // Selected lines initialization moved to processedLineItems effect

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
      const selectedLineItems = processedLineItems.filter((_, index) => selectedLines[index]);
      
      console.log('Selected line items to credit:', selectedLineItems);

      // Calculate granular totals
      const partsTotal = selectedLineItems.reduce((sum, item) => sum + (parseFloat(item.tot_parts) || 0), 0);
      const laborTotal = selectedLineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
      
      const otherChargesTotal = selectedLineItems.reduce((sum, item) => {
        const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
        if (isOtherChargeLine) {
            return sum + (parseFloat(item.total) || 0);
        }
        return sum + (parseFloat(item.oc_total) || 0);
      }, 0);
      
      const shopSupplyTotal = laborTotal * shopSupplyRate;
      
      // Calculate tax
      const taxableAmount = selectedLineItems.reduce((sum, item) => {
        if (item.taxable !== false) {
          const parts = parseFloat(item.tot_parts) || 0;
          const labor = parseFloat(item.labour) || 0;
          let other = parseFloat(item.oc_total) || 0;
          
          const isOtherChargeLine = item.is_other_charge || item.other_charge_id;
          if (isOtherChargeLine) {
             other = parseFloat(item.total) || 0;
          }
          
          return sum + parts + labor + other;
        }
        return sum;
      }, 0);
      
      const taxableSubtotal = taxableAmount + shopSupplyTotal;
      const creditTaxAmount = taxableSubtotal * 0.05;
      
      const creditTotalAmount = partsTotal + laborTotal + otherChargesTotal + shopSupplyTotal + creditTaxAmount;
      
      console.log('Parts Total:', partsTotal);
      console.log('Labor Total:', laborTotal);
      console.log('Other Charges Total:', otherChargesTotal);
      console.log('Shop Supplies:', shopSupplyTotal);
      console.log('Credit tax:', creditTaxAmount);
      console.log('Credit total:', creditTotalAmount);
      
      // Extract numeric part from invoice number (e.g., INV1001 -> 1001)
      const invNumberMatch = workOrder.inv_number?.match(/\d+/);
      const invNumericPart = invNumberMatch ? invNumberMatch[0] : '0000';
      
      // Find existing credit invoices for this invoice to determine suffix
      const existingCreditInvoicesRes = await base44.functions.invoke('SupabaseProxy', { 
        action: 'filter', 
        table: 'WorkOrder', 
        params: { 
          customer_id: workOrder.customer_id,
          stage: 'credit_invoice'
        }
      });
      const existingCreditInvoices = existingCreditInvoicesRes.data?.data || [];
      
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

      // Determine the correct payment method string
      // If refund source is cash_drawer, use the specific type (cash, debit, credit)
      // Otherwise use the refund source itself (cheque, on_account)
      const effectivePaymentMethod = refundSource === 'cash_drawer' ? cashDrawerPaymentType : refundSource;
      
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
        parts_total: -Math.abs(partsTotal),
        labor_total: -Math.abs(laborTotal),
        shop_supply_total: -Math.abs(shopSupplyTotal),
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
          payment_method: effectivePaymentMethod,
          reference: `Credit for ${workOrder.inv_number}`,
        }]),
        amount_paid: -Math.abs(creditTotalAmount),
        cp_id: workOrder.cp_id,
      };
      
      console.log('Creating credit invoice:', creditInvoiceData);
      
      const createRes = await base44.functions.invoke('SupabaseProxy', { action: 'create', table: 'WorkOrder', data: creditInvoiceData });
      const createdCreditInvoice = createRes.data?.data?.[0];
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
        await base44.functions.invoke('SupabaseProxy', { action: 'update', table: 'WorkOrder', id: createdCreditInvoice.id, data: {
          accounting_details: glResponse.data.accounting_details
        }});
        console.log('GL transactions for credit invoice recorded successfully.');
      } else {
        console.error('Failed to record GL transactions for credit invoice:', glResponse.data.error);
      }

      // Fetch suppliers to map IDs to names for returns
      let suppliers = [];
      try {
        const suppliersRes = await base44.functions.invoke('SupabaseProxy', { action: 'list', table: 'Supplier' });
        suppliers = suppliersRes.data?.data || [];
      } catch (err) {
        console.error("Failed to load suppliers for return processing", err);
      }

      // Fetch user from Supabase auth for audit trail
      let userId = null;
      let userDisplay = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        userId = authUser?.id || null;
        userDisplay = authUser?.user_metadata?.full_name || authUser?.email || null;
      } catch (err) {
        console.error("Failed to load user for audit log", err);
      }
      const nowStr = new Date().toISOString();

      for (const line of selectedLineItems) {
        if (line.inventory_item_id) {
          try {
            const inventoryItem = inventory.find(i => i.id === line.inventory_item_id);
            if (inventoryItem) {
              // Check if this is a core return
              if (line.is_core_virtual) {
                // Core Return Logic: Create InventoryReturn, do NOT update QOH
                const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
                const supplierName = supplier ? supplier.name : 'Unknown';

                const returnId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').substring(0, 24) : Date.now().toString();
                const { error: returnError } = await supabase.from('InventoryReturn').insert([{
                  id: returnId,
                  part_number: line.part_number || inventoryItem.part_number,
                  description: line.description || inventoryItem.description,
                  supplier: supplierName,
                  quantity_returned: parseFloat(line.qty) || 0,
                  return_type: 'core',
                  return_reason: 'Core Credit',
                  cost_per_unit: parseFloat(line.parts_ea) || 0,
                  total_cost: parseFloat(line.total) || 0,
                  return_date: format(new Date(), 'yyyy-MM-dd'),
                  work_order_id: workOrder.id,
                  inventory_item_id: line.inventory_item_id,
                  status: 'On-site',
                  notes: `Core returned via Credit Invoice ${creditInvoiceNumber}`,
                  created_date: nowStr,
                  updated_date: nowStr,
                  created_by_id: userId,
                  created_by: userDisplay
                }]);
                if (returnError) console.error(`Error creating Core Return for ${line.part_number}:`, returnError);
                console.log(`Created Core Return for ${line.part_number}`);
              } else {
                // Regular Part Return Logic: Update QOH and create TX
                const returnQty = parseFloat(line.qty) || 0;
                const newQOH = (parseFloat(inventoryItem.quantity_on_hand) || 0) + returnQty;
                
                const { error: updateError } = await supabase.rpc('update_inventory_with_audit', {
                  p_item_id: line.inventory_item_id,
                  p_qoh: newQOH,
                  p_qoo: Number(inventoryItem.quantity_on_order || 0),
                  p_ro_number: workOrder.ro_number,
                  p_supplier_inv: null,
                  p_source_action: 'CreditInvoice',
                  p_tx_type: 'Returned from WO',
                  p_description: `Credit invoice ${creditInvoiceNumber} - returned to stock`,
                  p_user_id: userId,
                  p_user_name: userDisplay,
                  p_source_record_id: creditInvoiceNumber
                });
                
                if (updateError) console.error('Error updating inventory via RPC:', updateError);
                
                console.log(`Returned ${returnQty} units of ${line.part_number} to inventory`);
              }
            }
          } catch (error) {
            console.error(`Error processing inventory for item ${line.inventory_item_id}:`, error);
          }
        }
      }
      
      // Mark credited lines on original work order with credit invoice number
      const updatedLineItems = [...lineItems];
      
      selectedLineItems.forEach(selectedItem => {
        if (selectedItem.is_core_virtual) {
           // This is a virtual core line - find original line and update core_credit AND core_ret
           const originalIndex = updatedLineItems.findIndex(l => l.id === selectedItem.original_line_id);
           if (originalIndex !== -1) {
             const currentCoreRet = parseFloat(updatedLineItems[originalIndex].core_ret || 0);
             const qtyToReturn = parseFloat(selectedItem.qty || 0);
             const newCoreRet = currentCoreRet + qtyToReturn;
             
             const coreNum = parseFloat(updatedLineItems[originalIndex].Core_num || 0);
             const coreCost = parseFloat(updatedLineItems[originalIndex].core_cost || 0);

             updatedLineItems[originalIndex] = {
               ...updatedLineItems[originalIndex],
               core_credit: creditInvoiceNumber,
               core_ret: newCoreRet,
               core_osamt: (coreNum - newCoreRet) * coreCost
             };
           }
        } else {
           // This is a regular line - find original line and update credit
           const originalIndex = updatedLineItems.findIndex(l => l.id === selectedItem.id);
           if (originalIndex !== -1) {
             updatedLineItems[originalIndex] = {
               ...updatedLineItems[originalIndex],
               credit: creditInvoiceNumber
             };
           }
        }
      });
      
      await base44.functions.invoke('SupabaseProxy', { action: 'update', table: 'WorkOrder', id: workOrder.id, data: {
        line_items: JSON.stringify(updatedLineItems)
      }});
      
      console.log('Updated original work order line items with credit reference');

      // Create CustomerPayment record for the refund
      if (refundSource === 'cash_drawer' || refundSource === 'on_account') {

        let paymentMethod;
        if (refundSource === 'cash_drawer') {
          paymentMethod = cashDrawerPaymentType; // 'cash', 'debit', or 'credit'
        } else if (refundSource === 'on_account') {
          paymentMethod = 'on_account';
        }

        await base44.functions.invoke('SupabaseProxy', { action: 'create', table: 'CustomerPayments', data: {
          customer_id: workOrder.customer_id,
          work_order_id: createdCreditInvoice.id,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          amount: -Math.abs(creditTotalAmount),
          payment_method: paymentMethod,
          notes: `Refund for credit invoice ${creditInvoiceNumber}`,
          created_date: new Date().toISOString()
        }});

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
        <div className="min-h-screen p-6">
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
                          {customer.org_name ? (
                            <>
                              <p className="font-semibold text-lg">{customer.org_name}</p>
                              {(customer.first_name || customer.last_name) && (
                                <p className="text-sm text-slate-600">Contact: {customer.first_name} {customer.last_name}</p>
                              )}
                            </>
                          ) : (
                            <p className="font-semibold text-lg">{customer.first_name} {customer.last_name}</p>
                          )}
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
                  lineItems={processedLineItems}
                  tagAlongs={tagAlongs}
                  selectedLines={selectedLines}
                  onToggleLine={handleToggleLine}
                  shopSupplyRate={shopSupplyRate}
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
        lineItems={processedLineItems}
        workOrder={workOrder}
        onConfirmCreditInvoice={handleConfirmCreditInvoice}
        shopSupplyRate={shopSupplyRate}
      />
    </>
  );
}