import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

const BUILT_IN_FIELDS = [
  { name: 'id', type: 'string', built_in: true },
  { name: 'created_date', type: 'string', format: 'date-time', built_in: true },
  { name: 'updated_date', type: 'string', format: 'date-time', built_in: true },
  { name: 'created_by', type: 'string', built_in: true }
];

const ENTITY_SCHEMAS = {
  User: {
    role: { type: 'string' }
  },
  OtherChargeList: {
    description: { type: 'string' }, gl_account: { type: 'string' }, base_amount: { type: 'number' }, is_taxable: { type: 'boolean' }, is_active: { type: 'boolean' }, apply_cost: { type: 'boolean' }, linked_supplier_id: { type: 'string' }, levy: { type: 'boolean' }, reportable_levy: { type: 'boolean' }
  },
  Customer: {
    org_name: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' }, phone: { type: 'string' }, secondary_phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, zip_code: { type: 'string' }, notes: { type: 'string' }, default_taxable: { type: 'boolean' }, is_active: { type: 'boolean' }, cusid: { type: 'string' }
  },
  Vehicle: {
    customer_id: { type: 'string' }, year: { type: 'number' }, make: { type: 'string' }, model: { type: 'string' }, trim: { type: 'string' }, vin: { type: 'string' }, license_plate: { type: 'string' }, unit_number: { type: 'string' }, color: { type: 'string' }, engine: { type: 'string' }, mileage: { type: 'number' }, odometer_date: { type: 'string', format: 'date' }, notes: { type: 'string' }, is_active: { type: 'boolean' }, vehid: { type: 'string' }
  },
  WorkOrder: {
    ro_number: { type: 'string' }, wo_number: { type: 'string' }, est_number: { type: 'string' }, inv_number: { type: 'string' }, crinv_number: { type: 'string' }, customer_id: { type: 'string' }, vehicle_id: { type: 'string' }, status: { type: 'string' }, kanban_order: { type: 'number' }, priority: { type: 'string' }, stage: { type: 'string' }, approval: { type: 'string' }, converted: { type: 'boolean' }, LockedByUser: { type: 'string' }, locked_timestamp: { type: 'string', format: 'date-time' }, description: { type: 'string' }, odometer: { type: 'number' }, labor_rate: { type: 'number' }, parts_total: { type: 'number' }, labor_total: { type: 'number' }, shop_supply_total: { type: 'number' }, tax_amount: { type: 'number' }, total_amount: { type: 'number' }, est_date: { type: 'string', format: 'date' }, wo_date: { type: 'string', format: 'date' }, completed_date: { type: 'string', format: 'date' }, invoice_date: { type: 'string', format: 'date' }, internal_notes: { type: 'string' }, line_items: { type: 'string' }, payments: { type: 'string' }, amount_paid: { type: 'number' }, notes_to_customer: { type: 'string' }, po_number: { type: 'string' }, cvip: { type: 'string' }, default_taxable: { type: 'boolean' }, accounting_details: { type: 'string' }, tech_time: { type: 'string' }, last_updated: { type: 'string', format: 'date-time' }, last_updated_by: { type: 'string' }, completed_by: { type: 'string' }, cp_id: { type: 'string' }, estimated_hours: { type: 'number' }
  },
  InventoryItem: {
    part_number: { type: 'string' }, description: { type: 'string' }, unit: { type: 'string' }, category: { type: 'string' }, supplier_id: { type: 'string' }, vendor: { type: 'string' }, manufacturer: { type: 'string' }, sales_class: { type: 'string' }, cost: { type: 'number' }, selling_price: { type: 'number' }, profit_margin: { type: 'number' }, quantity_on_hand: { type: 'number' }, quantity_on_order: { type: 'number' }, minimum_quantity: { type: 'number' }, maximum_quantity: { type: 'number' }, location: { type: 'string' }, core: { type: 'boolean' }, core_cost: { type: 'number' }, tag_along_id: { type: 'string' }, is_active: { type: 'boolean' }, stocked_item: { type: 'boolean' }, master_inventory_item_id: { type: 'string' }, duplicate_inventory_item_ids: { type: 'array' }
  },
  Employee: {
    employee_id: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' }, full_name: { type: 'string' }, email: { type: 'string' }, position: { type: 'string' }, employee_type: { type: 'string' }, pay_rate: { type: 'number' }, is_active: { type: 'boolean' }
  },
  SalesClass: {
    name: { type: 'string' }, description: { type: 'string' }, pricing_matrix: { type: 'string' }, is_active: { type: 'boolean' }
  },
  InventoryReturn: {
    part_number: { type: 'string' }, description: { type: 'string' }, supplier: { type: 'string' }, quantity_returned: { type: 'number' }, return_type: { type: 'string' }, return_reason: { type: 'string' }, cost_per_unit: { type: 'number' }, total_cost: { type: 'number' }, return_date: { type: 'string', format: 'date' }, work_order_id: { type: 'string' }, inventory_item_id: { type: 'string' }, status: { type: 'string' }, sent_back: { type: 'string' }, date_returned: { type: 'string', format: 'date-time' }, notes: { type: 'string' }
  },
  ReturnReason: {
    reason: { type: 'string' }, is_active: { type: 'boolean' }, hide: { type: 'boolean' }
  },
  Appointment: {
    title: { type: 'string' }, notes: { type: 'string' }, start_time: { type: 'string', format: 'date-time' }, end_time: { type: 'string', format: 'date-time' }, bay: { type: 'string' }, employee_id: { type: 'string' }, work_order_id: { type: 'string' }, customer_id: { type: 'string' }, vehicle_id: { type: 'string' }, status: { type: 'string' }, reminders_email: { type: 'boolean' }, reminders_text: { type: 'boolean' }, reminder_email_address: { type: 'string' }, reminders_phone: { type: 'string' }, reminder_days_before: { type: 'number' }
  },
  Supplier: {
    name: { type: 'string' }, contact_person: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' }, town: { type: 'string' }, province: { type: 'string' }, postal_code: { type: 'string' }, account_number: { type: 'string' }, default_gl_account: { type: 'string' }, inventory_supplier: { type: 'boolean' }, pin_to_top: { type: 'boolean' }, default_taxable: { type: 'boolean' }, notes: { type: 'string' }, LockedByUser: { type: 'string' }, supid: { type: 'string' }
  },
  SupplierInvoiceLine: {
    supplier_id: { type: 'string' }, invoice_number: { type: 'string' }, invoice_date: { type: 'string', format: 'date' }, inventory_item_id: { type: 'string' }, description: { type: 'string' }, purchase_amount: { type: 'number' }, gst_amount: { type: 'number' }, paid_amount: { type: 'number' }, gl_account: { type: 'string' }, inventory: { type: 'boolean' }, gst_override: { type: 'boolean' }, inventory_credit: { type: 'boolean' }
  },
  SupplierPayment: {
    supplier_id: { type: 'string' }, invoice_number: { type: 'string' }, payment_date: { type: 'string', format: 'date' }, amount: { type: 'number' }, payment_method: { type: 'string' }, cheque_number: { type: 'string' }, source: { type: 'string' }, notes: { type: 'string' }, status: { type: 'string' }, error_message: { type: 'string' }
  },
  ChartOfAccount: {
    account_number: { type: 'string' }, account_name: { type: 'string' }, account_type: { type: 'string' }, parent_account: { type: 'string' }, is_active: { type: 'boolean' }, controlled: { type: 'boolean' }, description: { type: 'string' }
  },
  GLTransaction: {
    account_number: { type: 'string' }, transaction_date: { type: 'string', format: 'date' }, description: { type: 'string' }, reference: { type: 'string' }, debit_amount: { type: 'number' }, credit_amount: { type: 'number' }, source_type: { type: 'string' }, source_id: { type: 'string' }
  },
  BankAccount: {
    name: { type: 'string' }, bank_name: { type: 'string' }, account_number: { type: 'string' }, account_type: { type: 'string' }, current_balance: { type: 'number' }, gl_account: { type: 'string' }, routing_number: { type: 'string' }, is_active: { type: 'boolean' }, primary: { type: 'boolean' }, notes: { type: 'string' }, next_cheque_number: { type: 'number' }, last_recalculated_date: { type: 'string', format: 'date-time' }, locked_by_user: { type: 'string' }, locked_timestamp: { type: 'string', format: 'date-time' }
  },
  BankTransaction: {
    bank_account_id: { type: 'string' }, transaction_date: { type: 'string', format: 'date' }, description: { type: 'string' }, reference: { type: 'string' }, credit_amount: { type: 'number' }, debit_amount: { type: 'number' }, cleared: { type: 'boolean' }, reconciled: { type: 'boolean' }, reconciliation_id: { type: 'string' }, source_type: { type: 'string' }, source_id: { type: 'string' }, banktx: { type: 'boolean' }, gl_account: { type: 'string' }
  },
  CustomerARAdjustment: {
    customer_id: { type: 'string' }, adjustment_date: { type: 'string', format: 'date' }, amount: { type: 'number' }, gl_account: { type: 'string' }, description: { type: 'string' }, reference: { type: 'string' }, ar_paid: { type: 'number' }, overpayment: { type: 'boolean' }
  },
  CustomerPayments: {
    customer_id: { type: 'string' }, work_order_id: { type: 'string' }, amount: { type: 'number' }, payment_method: { type: 'string' }, payment_date: { type: 'string', format: 'date' }, reference: { type: 'string' }, cheque_name: { type: 'string' }, cheque_number: { type: 'string' }, notes: { type: 'string' }, deposited: { type: 'boolean' }, deposit_date: { type: 'string', format: 'date' }, deposit_batch_id: { type: 'string' }, gl_posted: { type: 'boolean' }, invoice_number: { type: 'string' }, ar_pmt: { type: 'boolean' }, ar_paid: { type: 'number' }, ar_applyto: { type: 'string' }, advance_pmt: { type: 'boolean' }, lankar_invoice: { type: 'string' }
  },
  InventoryTxs: {
    inventory_item_id: { type: 'string' }, ro_number: { type: 'string' }, part_num: { type: 'string' }, tx_date: { type: 'string', format: 'date-time' }, tx_type: { type: 'string' }, quantity_change: { type: 'number' }, quantity_ordered_change: { type: 'number' }, supplier_inv: { type: 'string' }, supplier_name: { type: 'string' }, source_record_id: { type: 'string' }, description: { type: 'string' }
  },
  InventoryLocation: { name: { type: 'string' }, description: { type: 'string' }, is_active: { type: 'boolean' } },
  TagAlong: { description: { type: 'string' }, linked_inventory_item_id: { type: 'string' }, linked_other_charge_id: { type: 'string' }, is_active: { type: 'boolean' } },
  FiscalPeriod: { name: { type: 'string' }, start_date: { type: 'string', format: 'date' }, end_date: { type: 'string', format: 'date' }, is_closed: { type: 'boolean' } },
  LinesOfCredit: { name: { type: 'string' }, lender_name: { type: 'string' }, credit_limit: { type: 'number' }, current_balance: { type: 'number' }, interest_rate: { type: 'number' }, gl_account: { type: 'string' }, is_active: { type: 'boolean' }, notes: { type: 'string' } },
  LinesOfCreditTransaction: { line_of_credit_id: { type: 'string' }, transaction_date: { type: 'string', format: 'date' }, description: { type: 'string' }, reference: { type: 'string' }, debit_amount: { type: 'number' }, credit_amount: { type: 'number' }, source_type: { type: 'string' }, source_id: { type: 'string' } },
  SentEmailLog: { to_email: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, source_type: { type: 'string' }, source_id: { type: 'string' }, status: { type: 'string' }, error_message: { type: 'string' } },
  Statement: { customer_id: { type: 'string' }, statement_date: { type: 'string', format: 'date' }, statement_period_end: { type: 'string', format: 'date' }, opening_balance: { type: 'number' }, closing_balance: { type: 'number' }, statement_data: { type: 'string' } },
  PayrollTransaction: { employee_id: { type: 'string' }, pay_date: { type: 'string', format: 'date' }, transaction_type: { type: 'string' }, amount: { type: 'number' }, description: { type: 'string' }, reference: { type: 'string' } },
  SystemSettings: { next_inv_number: { type: 'number' }, shop_supply_rate: { type: 'number' }, default_message: { type: 'string' }, wip_legal: { type: 'string' }, default_taxable: { type: 'boolean' }, tax_rate: { type: 'number' }, training_enviro: { type: 'boolean' } },
  CashDrawerAdjustment: { adjustment_date: { type: 'string', format: 'date-time' }, amount: { type: 'number' }, reason: { type: 'string' }, user_email: { type: 'string' } },
  BankReconciliation: { bank_account_id: { type: 'string' }, statement_date: { type: 'string', format: 'date' }, statement_balance: { type: 'number' }, cleared_balance: { type: 'number' }, difference: { type: 'number' }, notes: { type: 'string' }, is_completed: { type: 'boolean' } },
  WorkOrderStatus: { name: { type: 'string' }, display_order: { type: 'number' }, color: { type: 'string' }, is_active: { type: 'boolean' } },
  GSTReturn: { period_start: { type: 'string', format: 'date' }, period_end: { type: 'string', format: 'date' }, collected_gst: { type: 'number' }, paid_gst: { type: 'number' }, net_gst: { type: 'number' }, status: { type: 'string' }, filed_date: { type: 'string', format: 'date' } },
  DepositSlipBreakdown: { deposit_date: { type: 'string', format: 'date' }, bank_account_id: { type: 'string' }, total_amount: { type: 'number' }, breakdown_data: { type: 'string' } },
  CustomerPortalWorkOrder: { original_work_order_id: { type: 'string' }, cp_id: { type: 'string' }, ref_number: { type: 'string' }, ref_date: { type: 'string', format: 'date' }, snapshot_date: { type: 'string', format: 'date-time' }, notes_to_customer: { type: 'string' }, customer_snapshot: { type: 'string' }, vehicle_snapshot: { type: 'string' }, line_items_snapshot: { type: 'string' }, parts_total: { type: 'number' }, labor_total: { type: 'number' }, shop_supply_total: { type: 'number' }, tax_amount: { type: 'number' }, total_amount: { type: 'number' }, payments: { type: 'string' }, amount_paid: { type: 'number' }, po_number: { type: 'string' }, stage: { type: 'string' }, approval: { type: 'string' } },
  InventoryCategory: { name: { type: 'string' }, description: { type: 'string' }, is_active: { type: 'boolean' } },
  Levies: { name: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' }, gl_account: { type: 'string' }, is_active: { type: 'boolean' } },
  CashFlowEntry: { entry_date: { type: 'string', format: 'date' }, description: { type: 'string' }, amount: { type: 'number' }, category: { type: 'string' }, supplier_id: { type: 'string' }, notes: { type: 'string' } },
  CashFlowSummary: { summary_date: { type: 'string', format: 'date' }, inflow_total: { type: 'number' }, outflow_total: { type: 'number' }, net_total: { type: 'number' }, summary_data: { type: 'string' } }
};

function buildFieldMeta(entityName, observedKeys = []) {
  const schemaProps = ENTITY_SCHEMAS[entityName] || {};
  const metaMap = new Map(BUILT_IN_FIELDS.map(field => [field.name, field]));

  Object.entries(schemaProps).forEach(([name, config]) => {
    metaMap.set(name, { name, ...config, built_in: false });
  });

  observedKeys.forEach((name) => {
    if (!metaMap.has(name)) metaMap.set(name, { name, type: 'unknown', observed: true });
  });

  return Array.from(metaMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { mode, entityName, startDate, endDate, field, searchTerm } = await req.json();
    const adminEntities = base44.asServiceRole.entities;

    if (!adminEntities[entityName]) {
      return new Response(JSON.stringify({ error: `Entity '${entityName}' not found` }), { status: 400 });
    }

    let results = [];

    if (mode === 'extract') {
      const query = {};
      if (startDate || endDate) {
        query.created_date = {};
        if (startDate) query.created_date.$gte = startDate;
        if (endDate) query.created_date.$lte = endDate;
      }
      results = await adminEntities[entityName].filter(query, '-created_date', 5000);
    }
    else if (mode === 'search') {
      const query = {};
      if (field && searchTerm) {
        const fieldMeta = buildFieldMeta(entityName).find(f => f.name === field);
        const isNumericField = fieldMeta?.type === 'number' || ['amount', 'total', 'cost', 'price', 'qty', 'quantity'].some(k => field.toLowerCase().includes(k));
        const isBooleanField = fieldMeta?.type === 'boolean';

        if (isNumericField && !isNaN(searchTerm)) {
          query[field] = Number(searchTerm);
        } else if (isBooleanField) {
          query[field] = searchTerm === 'true';
        } else if (field === 'id' || field.endsWith('_id')) {
          query[field] = searchTerm;
        } else {
          query[field] = { $regex: searchTerm, $options: 'i' };
        }
      }
      results = await adminEntities[entityName].filter(query, '-created_date', 100);
    }
    else if (mode === 'get_schema') {
      const sample = await adminEntities[entityName].list(50);
      const observedKeys = [...new Set((sample || []).flatMap(record => Object.keys(record || {})))];
      const fieldMeta = buildFieldMeta(entityName, observedKeys);
      const fields = fieldMeta.map(field => field.name);
      return new Response(JSON.stringify({ fields, fieldMeta }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Admin DB Tool Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

import { createClientFromRequest as createClient } from 'npm:@base44/sdk@0.8.3';
Deno.serve(async (req) => {
  return await handler(req);
});