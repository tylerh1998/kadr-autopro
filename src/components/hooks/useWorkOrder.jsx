import { useState, useEffect, useCallback } from 'react';
import { Customer, Vehicle } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabase';

const parseLineItems = async (itemsString) => {
  if (!itemsString) return [];
  try {
    const parsed = typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;
    if (!Array.isArray(parsed)) return [];
    
    // Process each line item and enrich with SupplierInvoiceLine data if needed
    const enrichedItems = await Promise.all(parsed.map(async (item) => {
      const baseItem = {
        ...item,
        unit: item.unit || '',
        qty: Number(item.qty || 0),
        hrs: Number(item.hrs || 0),
        parts_ea: Number(item.parts_ea || 0),
        tot_parts: Number(item.tot_parts || 0),
        labour: Number(item.labour || 0),
        total: Number(item.total || 0),
        cost_ea: Number(item.cost_ea || 0),
        Core_num: Number(item.Core_num || 0),
        core_ret: Number(item.core_ret || 0),
        core_cost: Number(item.core_cost || 0),
        qty_on_order: Number(item.qty_on_order || 0),
      };

      // If this line item has a supplier_invoice_line_id, fetch the details
      if (item.supplier_invoice_line_id) {
        try {
          const supplierInvoiceLineRes = await base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'SupplierInvoiceLine', match: { id: item.supplier_invoice_line_id } });
          const supplierInvoiceLine = supplierInvoiceLineRes.data?.data?.[0];
          if (!supplierInvoiceLine) throw new Error('Supplier invoice line not found');
          // Enrich the line item with supplier invoice line details
          return {
            ...baseItem,
            supplier_invoice_line_id: supplierInvoiceLine.id,
            linked_supplier_id: supplierInvoiceLine.supplier_id,
            supplier_invoice_number: supplierInvoiceLine.invoice_number,
            supplier_invoice_date: supplierInvoiceLine.invoice_date,
            supplier_purchase_amount: supplierInvoiceLine.purchase_amount,
            supplier_gst_amount: supplierInvoiceLine.gst_amount,
            supplier_gl_account: supplierInvoiceLine.gl_account,
            supplier_description: supplierInvoiceLine.description,
          };
        } catch (error) {
          console.error(`Failed to fetch SupplierInvoiceLine ${item.supplier_invoice_line_id}:`, error);
          // If we can't fetch the SIL, return the base item without enrichment
          return baseItem;
        }
      }

      return baseItem;
    }));

    return enrichedItems;
  } catch (e) {
    console.error("Failed to parse line items:", e);
    return [];
  }
};

export function useWorkOrder(roNumber, options = {}) {
  const { useFunctionData = false } = options;
  const [workOrder, setWorkOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [tagAlongs, setTagAlongs] = useState([]);
  const [otherCharges, setOtherCharges] = useState([]);
  const [upcomingAppointment, setUpcomingAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!roNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [workOrderResponse, tagAlongsData, otherChargesData] = await Promise.all([
        useFunctionData
          ? supabase.from('WorkOrder').select('*').eq('ro_number', roNumber).limit(1).maybeSingle()
          : base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'WorkOrder', match: { ro_number: roNumber } }).then(res => res.data?.data || []),
        TagAlong.list(),
        OtherChargeList.list(),
      ]);

      setTagAlongs(tagAlongsData);
      setOtherCharges(otherChargesData);

      if (useFunctionData && workOrderResponse?.error) {
        console.error('Error fetching WorkOrder:', workOrderResponse.error);
      }

      const wo = useFunctionData
        ? (workOrderResponse?.data || null)
        : (workOrderResponse.length > 0 ? workOrderResponse[0] : null);

      if (!wo) {
        throw new Error(`Work Order with RO Number ${roNumber} not found.`);
      }
      setWorkOrder(wo);

      // Parse line items with enrichment
      const parsedLineItems = await parseLineItems(wo.line_items);
      setLineItems(parsedLineItems);

      if (wo.customer_id && wo.vehicle_id) {
        const [customerResult, vehicleResult, appointmentsResult] = await Promise.all([
          Customer.get(wo.customer_id).catch(() => null),
          Vehicle.get(wo.vehicle_id).catch(() => null),
          supabase.from('Appointment').select('*').eq('work_order_id', wo.id),
        ]);
        const customerData = customerResult;
        const vehicleData = vehicleResult;
        const appointmentsData = appointmentsResult.data || [];

        setCustomer(customerData);
        setVehicle(vehicleData);
        
        // Find the next appointment that is today or in the future
        const now = new Date();
        const futureAppointments = appointmentsData
          .filter(appt => new Date(appt.start_time) >= now)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
          
        if (futureAppointments.length > 0) {
          setUpcomingAppointment(futureAppointments[0]);
        } else {
          setUpcomingAppointment(null);
        }
      }
    } catch (e) {
      console.error('Error in useWorkOrder hook:', e);
      setError(e.message || 'Failed to load work order data.');
    } finally {
      setLoading(false);
    }
  }, [roNumber, useFunctionData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { workOrder, customer, vehicle, lineItems, tagAlongs, otherCharges, upcomingAppointment, loading, error, setWorkOrder, setLineItems, refetch: fetchData };
}