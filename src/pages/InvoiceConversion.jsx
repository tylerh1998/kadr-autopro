import React, { useState, useEffect } from 'react';
import { WorkOrder, Customer, Vehicle, SystemSettings } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Copy, Printer, ExternalLink, Loader2, X, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import WorkOrderReport from '../components/work-orders/WorkOrderReport';

export default function InvoiceConversion() {
  const [loading, setLoading] = useState(true);
  const [workOrder, setWorkOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [error, setError] = useState(null);
  const [portalUrl, setPortalUrl] = useState('');
  const [accountingSummary, setAccountingSummary] = useState(null);

  useEffect(() => {
    const convertToInvoice = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roNumber = urlParams.get('id');

        if (!roNumber) {
          setError('No RO number provided in URL.');
          setLoading(false);
          return;
        }

        console.log('=== Invoice Conversion Started ===');
        console.log('RO Number:', roNumber);

        // Fetch work order
        const workOrders = await WorkOrder.filter({ ro_number: roNumber });
        if (!workOrders || workOrders.length === 0) {
          setError(`Work order with RO number ${roNumber} not found.`);
          setLoading(false);
          return;
        }

        const wo = workOrders[0];
        console.log('Work Order fetched:', wo);

        // Parse line items early and store in state
        let parsedLineItems = [];
        try {
          parsedLineItems = wo.line_items ? JSON.parse(wo.line_items) : [];
          console.log('Parsed line items:', parsedLineItems.length);
        } catch (e) {
          console.error('Error parsing line_items:', e);
          parsedLineItems = [];
        }
        setLineItems(parsedLineItems);

        // Check if already converted to prevent re-conversion logic if page is refreshed
        if (wo.stage === 'invoice' && wo.inv_number && wo.accounting_details) {
          console.log('Work order already converted, loading existing data');
          setWorkOrder(wo);
          if (wo.cp_id) {
            setPortalUrl(`https://portal.kensauto.ca/WorkOrder?cp_id=${wo.cp_id}`);
          }
          const customerData = await Customer.get(wo.customer_id);
          setCustomer(customerData);
          const vehicleData = await Vehicle.get(wo.vehicle_id);
          setVehicle(vehicleData);
          
          // Parse and display accounting summary if available
          try {
            const accountingDetails = JSON.parse(wo.accounting_details);
            const summary = {
              total_transactions: accountingDetails.length,
              message: 'Accounting entries already posted'
            };
            setAccountingSummary(summary);
          } catch (e) {
            console.error('Error parsing existing accounting_details:', e);
          }
          
          setLoading(false);
          return;
        }

        // Fetch customer and vehicle
        console.log('Fetching customer and vehicle data');
        const customerData = await Customer.get(wo.customer_id);
        setCustomer(customerData);
        const vehicleData = await Vehicle.get(wo.vehicle_id);
        setVehicle(vehicleData);

        // Fetch system settings
        console.log('Fetching system settings');
        const systemSettingsList = await SystemSettings.list();
        const systemSettings = systemSettingsList && systemSettingsList.length > 0 ? systemSettingsList[0] : {};

        // Parse payments (lineItems already parsed and stored in state)
        console.log('Parsing payments');
        let payments = [];
        
        try {
          payments = wo.payments ? JSON.parse(wo.payments) : [];
          console.log('Parsed payments:', payments.length);
        } catch (e) {
          console.error('Error parsing payments:', e);
          payments = [];
        }

        // Generate invoice number - REUSE EXISTING IF PRESENT
        // Invoice date should already be set from InvoicePaymentModal, but fall back to today if not
        let invNumber;
        let invoiceDate;
        
        // Always check for existing invoice_date first (set by InvoicePaymentModal)
        if (wo.invoice_date && wo.invoice_date.trim() !== '') {
          invoiceDate = wo.invoice_date;
          console.log('Using existing invoice date from work order:', invoiceDate);
        } else {
          // Generate new invoice date if none exists (fallback)
          const now = new Date();
          const formatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'America/Edmonton'
          });
          invoiceDate = formatter.format(now);
          console.log('Generated new invoice date (fallback):', invoiceDate);
        }
        
        if (wo.inv_number && wo.inv_number.trim() !== '') {
          // Reuse existing invoice number
          invNumber = wo.inv_number;
          console.log('Reusing existing invoice number:', invNumber);
        } else {
          // Generate new invoice number from SystemSettings
          const nextInv = systemSettings?.next_inv_number || 1001;
          invNumber = `INV${nextInv}`;
          console.log('Generated new invoice number from SystemSettings:', invNumber);
          
          // Increment and save next_inv_number
          if (systemSettingsList && systemSettingsList.length > 0) {
            await SystemSettings.update(systemSettingsList[0].id, {
              next_inv_number: nextInv + 1
            });
            console.log('Incremented next_inv_number to:', nextInv + 1);
          } else {
            await SystemSettings.create({
              next_inv_number: nextInv + 1
            });
            console.log('Created SystemSettings with next_inv_number:', nextInv + 1);
          }
        }

        // Update work order to invoice stage BEFORE calling GL function
        console.log('Updating work order to invoice stage');
        await WorkOrder.update(wo.id, {
          stage: 'invoice',
          converted: true,
          inv_number: invNumber,
          invoice_date: invoiceDate,
          status: 'Completed'
        });

        const updatedWorkOrder = { 
          ...wo, 
          stage: 'invoice', 
          converted: true, 
          inv_number: invNumber, 
          invoice_date: invoiceDate, 
          status: 'Completed' 
        };

        // Call handleInvoiceConversionGL backend function
        console.log('=== Calling handleInvoiceConversionGL ===');
        try {
          const glResponse = await base44.functions.invoke('handleInvoiceConversionGL', {
            workOrder: updatedWorkOrder,
            lineItems: parsedLineItems,
            payments: payments,
            systemSettings: systemSettings,
            action: 'convert'
          });

          console.log('GL function response:', glResponse);

          if (glResponse.data && glResponse.data.success) {
            console.log('GL transactions created successfully');
            console.log('Summary:', glResponse.data.summary);
            
            // Save accounting_details back to work order
            await WorkOrder.update(wo.id, {
              accounting_details: glResponse.data.accounting_details
            });

            console.log('Accounting details saved to work order');
            
            // Set summary for display
            setAccountingSummary(glResponse.data.summary);
            
            // Update local work order state with accounting_details
            updatedWorkOrder.accounting_details = glResponse.data.accounting_details;
          } else {
            console.error('GL function returned error:', glResponse.data?.error);
            setError(`Accounting posting warning: ${glResponse.data?.error || 'Unknown error'}. Invoice was created but GL transactions may not have been posted correctly.`);
          }
        } catch (glError) {
          console.error('Error calling handleInvoiceConversionGL:', glError);
          setError(`Accounting posting warning: ${glError.message}. Invoice was created but GL transactions may not have been posted correctly.`);
        }

        setWorkOrder(updatedWorkOrder);

        if (updatedWorkOrder.cp_id) {
          setPortalUrl(`https://portal.kensauto.ca/WorkOrder?cp_id=${updatedWorkOrder.cp_id}`);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error during invoice conversion:', err);
        setError('Failed to convert work order to invoice. Please try again or contact support.');
        setLoading(false);
      }
    };

    convertToInvoice();
  }, []);

  const handleCopyPortalUrl = () => {
    if (!portalUrl) {
      alert('No customer portal URL available to copy.');
      return;
    }
    navigator.clipboard.writeText(portalUrl).then(() => {
      alert('Customer Portal URL copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy URL to clipboard.');
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExit = () => {
    window.close();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-slate-600 text-lg font-medium">Converting work order to invoice...</p>
          <p className="text-slate-500 text-sm mt-2">Processing accounting transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isWarning = error.includes('warning');
    
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader className="text-center">
            <div className={`mx-auto rounded-full p-3 w-fit ${isWarning ? 'bg-yellow-100' : 'bg-red-100'}`}>
              {isWarning ? (
                <AlertTriangle className="w-12 h-12 text-yellow-600" />
              ) : (
                <X className="w-12 h-12 text-red-600" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold mt-4">
              {isWarning ? 'Conversion Completed with Warnings' : 'Conversion Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className={isWarning ? 'text-yellow-700' : 'text-red-600'}>{error}</p>
            
            {isWarning && workOrder && (
              <>
                <p className="text-lg font-semibold">
                  Invoice Number: <span className="text-blue-600">{workOrder.inv_number}</span>
                </p>
                <p className="text-sm text-slate-600">
                  The invoice was created successfully, but there may be issues with the accounting entries. 
                  Please verify the GL transactions in the accounting system.
                </p>
              </>
            )}
            
            <Button onClick={handleExit} size="lg" className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <X className="w-5 h-5" />
              Close Window
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-600">No work order details available. Please ensure a valid RO number was provided and try again.</p>
          <Button onClick={handleExit} size="lg" className="bg-red-600 hover:bg-red-700 text-white gap-2 mt-4">
            <X className="w-5 h-5" />
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print-only styles */}
      <style>
        {`
          @media print {
            /* Hide the main screen content completely */
            .screen-only-area {
              display: none !important;
            }

            /* Make the dedicated print area visible and the only thing on the page */
            .print-only-area {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: white !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          }
        `}
      </style>

      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 screen-only-area">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto bg-green-100 rounded-full p-3 w-fit">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold mt-4">Conversion Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className="text-slate-600">
            The Work Order has been successfully converted into an invoice.
          </p>
          
          <p className="text-lg font-semibold">
            Invoice Number: <span className="text-blue-600">{workOrder.inv_number}</span>
          </p>

          <p className="text-md text-slate-700">
            <strong>Customer:</strong> {customer ? `${customer.first_name} ${customer.last_name}` : 'N/A'}<br />
            <strong>Vehicle:</strong> {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate || 'N/A'})` : 'N/A'}
          </p>

          {/* Accounting Summary */}
          {accountingSummary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900">Accounting Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
                {accountingSummary.parts_sales !== undefined && (
                  <div className="text-left">
                    <span className="font-medium">Parts Sales:</span>
                    <span className="float-right">${accountingSummary.parts_sales?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.labor_sales !== undefined && (
                  <div className="text-left">
                    <span className="font-medium">Labor Sales:</span>
                    <span className="float-right">${accountingSummary.labor_sales?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.shop_supplies !== undefined && accountingSummary.shop_supplies !== 0 && (
                  <div className="text-left">
                    <span className="font-medium">Shop Supplies:</span>
                    <span className="float-right">${accountingSummary.shop_supplies?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.gst !== undefined && (
                  <div className="text-left">
                    <span className="font-medium">GST:</span>
                    <span className="float-right">${accountingSummary.gst?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.cash_payments !== undefined && accountingSummary.cash_payments !== 0 && (
                  <div className="text-left">
                    <span className="font-medium">Cash Payments:</span>
                    <span className="float-right">${accountingSummary.cash_payments?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.advance_payments !== undefined && accountingSummary.advance_payments !== 0 && (
                  <div className="text-left">
                    <span className="font-medium">Advance Payments:</span>
                    <span className="float-right">${accountingSummary.advance_payments?.toFixed(2)}</span>
                  </div>
                )}
                {accountingSummary.remaining_balance !== undefined && accountingSummary.remaining_balance !== 0 && (
                  <div className="text-left col-span-2 pt-2 border-t border-blue-300">
                    <span className="font-bold">Balance Due:</span>
                    <span className="float-right font-bold">${accountingSummary.remaining_balance?.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-blue-700 pt-2">
                {accountingSummary.total_transactions} GL transactions posted
              </p>
            </div>
          )}

          {/* Customer Portal URL Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Customer Portal URL:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={portalUrl || 'No customer portal available for this work order.'}
                readOnly
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm text-slate-700"
              />
              <Button
                onClick={handleCopyPortalUrl}
                variant="outline"
                size="sm"
                disabled={!portalUrl}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              {portalUrl && (
                <Button
                  onClick={() => window.open(portalUrl, '_blank')}
                  variant="outline"
                  size="sm"
                  aria-label="Open portal link in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-500">
            This window can now be closed.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center pt-4">
            <Button
              onClick={handlePrint}
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={!workOrder?.ro_number}
            >
              <Printer className="w-5 h-5" />
              Print Invoice
            </Button>
            <Button
              onClick={handleExit}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <X className="w-5 h-5" />
              Close Window
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Hidden Print Area - Only visible during print */}
    <div className="print-only-area" style={{ display: 'none' }}>
      {workOrder && customer && vehicle && (
        <WorkOrderReport
          workOrder={workOrder}
          customer={customer}
          vehicle={vehicle}
          lineItems={lineItems}
        />
      )}
    </div>
  </>
  );
}