import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { conceptualKey, resolveConceptualInvoiceIds } from "../_shared/glBatch.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200, // Always status 200 to bypass supabase-js exception throws on 4xx/5xx
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let user = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = { email: authUser.email, id: authUser.id };
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const payload = await req.json();
    console.log('processInventoryReceipt payload:', JSON.stringify(payload, null, 2));
    const { 
      supplier_id, 
      invoice_number, 
      invoice_date, 
      items, 
      action = 'create', 
      supplier_invoice_line_id,
      quantity,
      amount_per_unit,
      freight_amount,
      invoice_gst
    } = payload;

    if (action === 'reverse') {
      if (!supplier_invoice_line_id) {
        return res({ 
          success: false, 
          error: 'Supplier invoice line ID is required for reverse action' 
        }, { status: 400 });
      }
      return await processInventoryReceiptReverse(supabase, user, supplier_invoice_line_id);
    }

    if (action === 'edit') {
      if (!supplier_invoice_line_id) {
        return res({ 
          success: false, 
          error: 'Supplier invoice line ID is required for edit action' 
        }, { status: 400 });
      }
      if (!invoice_number || !invoice_date) {
        return res({ 
          success: false, 
          error: 'Invoice number and date are required for edit action' 
        }, { status: 400 });
      }
      if (!quantity || parseFloat(quantity) <= 0) {
        return res({ 
          success: false, 
          error: 'Quantity must be greater than 0' 
        }, { status: 400 });
      }
      if (!amount_per_unit || parseFloat(amount_per_unit) <= 0) {
        return res({ 
          success: false, 
          error: 'Amount per unit must be greater than 0' 
        }, { status: 400 });
      }
      return await processInventoryReceiptEdit(
        supabase,
        user,
        supplier_invoice_line_id,
        invoice_number,
        invoice_date,
        parseFloat(quantity),
        parseFloat(amount_per_unit)
      );
    }

    if (!supplier_id) {
      return res({ success: false, error: 'Supplier ID is required' }, { status: 400 });
    }
    if (!invoice_number) {
      return res({ success: false, error: 'Invoice number is required' }, { status: 400 });
    }
    if (!invoice_date) {
      return res({ success: false, error: 'Invoice date is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res({ success: false, error: 'At least one item is required' }, { status: 400 });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(invoice_date)) {
      return res({ success: false, error: 'Invalid invoice date format. Must be YYYY-MM-DD' }, { status: 400 });
    }

    const createFiscalCheck = await checkFiscalPeriodStatus(supabase, invoice_date);
    if (!createFiscalCheck.isValid) {
      return res({ success: false, error: 'Fiscal period error', message: createFiscalCheck.message }, { status: 400 });
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', supplier_id)
      .maybeSingle();

    if (supplierError) {
      throw new Error(`Failed to load supplier: ${supplierError.message}`);
    }
    if (!supplier) {
      return res({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    if (action === 'create') {
      return await processInventoryReceiptCreate(supabase, user, supplier, invoice_number, invoice_date, items, freight_amount, invoice_gst, payload.digital_pdf);
    } else {
      return res({ success: false, error: 'Invalid action. Must be "create", "edit", or "reverse"' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error processing inventory receipt:', error);
    return res({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: error.stack || error.toString()
    });
  }
});

function buildSupabaseRecord(user: any, data: any, isUpdate = false) {
  const now = new Date().toISOString();
  if (isUpdate) {
    return {
      updated_date: now,
      ...data
    };
  }
  return {
    id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
    created_date: now,
    updated_date: now,
    created_by: user.email,
    created_by_id: user.id,
    ...data
  };
}

async function insertSupplierInvoiceLines(supabase: any, user: any, lines: any[]) {
  const insertRows = lines.map((line) => buildSupabaseRecord(user, line));
  const { data, error } = await supabase.from('SupplierInvoiceLine').insert(insertRows).select();
  if (error) {
    throw new Error(`Failed to create supplier invoice lines: ${error.message}`);
  }
  return data || [];
}

async function getSupplierInvoiceLine(supabase: any, id: string) {
  const { data, error } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', id).maybeSingle();
  if (error) {
    throw new Error(`Failed to load supplier invoice line: ${error.message}`);
  }
  return data;
}

async function createSupplierInvoiceLine(supabase: any, user: any, line: any) {
  const { data, error } = await supabase.from('SupplierInvoiceLine').insert([buildSupabaseRecord(user, line)]).select().maybeSingle();
  if (error) {
    throw new Error(`Failed to create supplier invoice line: ${error.message}`);
  }
  return data;
}

async function updateSupplierInvoiceLine(supabase: any, id: string, updates: any) {
  const { data, error } = await supabase.from('SupplierInvoiceLine').update(buildSupabaseRecord(null, updates, true)).eq('id', id).select().maybeSingle();
  if (error) {
    throw new Error(`Failed to update supplier invoice line: ${error.message}`);
  }
  return data;
}

async function checkFiscalPeriodStatus(supabase: any, dateString: string) {
  try {
    if (!dateString) {
      return { isValid: false, message: "No date provided for fiscal period check." };
    }
    const { data: fiscalPeriods } = await supabase.from('FiscalPeriod').select('*');
    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return { isValid: false, message: "No fiscal periods configured. Please set them up first." };
    }
    const datePart = dateString.split('T')[0];
    const checkDate = new Date(datePart + 'T00:00:00Z');
    
    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');
      if (checkDate >= startDate && checkDate <= endDate) {
        if (period.is_closed) {
          return { isValid: false, message: "Date is in a closed fiscal period. No changes can be made." };
        } else {
          return { isValid: true, message: "Date is in an open fiscal period." };
        }
      }
    }
    return { isValid: false, message: "No valid fiscal period found for this date. No changes can be made." };
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return { isValid: false, message: "Error checking fiscal period." };
  }
}

async function processInventoryReceiptCreate(supabase: any, user: any, supplier: any, invoice_number: string, invoice_date: string, items: any[], freight_amount: any = 0, invoice_gst: any = 0, digital_pdf: any = null) {
  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  const results: any = {
    success: true,
    message: '',
    created_invoice_lines: [],
    created_inventory_txs: [],
    updated_inventory_items: [],
    created_inventory_items: [],
    errors: []
  };

  const invoiceLinesToCreate = [];
  const txsToCreate = [];

  try {
    for (const item of items) {
      if (!item.part_number) {
        results.errors.push({ item, error: 'Part number is required' });
        continue;
      }
      if (!item.description) {
        results.errors.push({ item, error: 'Description is required' });
        continue;
      }
      if (!item.quantity_received || parseFloat(item.quantity_received) <= 0) {
        results.errors.push({ item, error: 'Quantity received must be greater than 0' });
        continue;
      }
      if (!item.cost || parseFloat(item.cost) <= 0) {
        results.errors.push({ item, error: 'Cost must be greater than 0' });
        continue;
      }
      if (!item.selling_price || parseFloat(item.selling_price) <= 0) {
        results.errors.push({ item, error: 'Selling price must be greater than 0' });
        continue;
      }

      const { data: existingItems, error: existingItemsError } = await supabase
        .from('InventoryItem')
        .select('*')
        .eq('part_number', item.part_number);

      if (existingItemsError) {
        throw new Error(`Failed to load inventory item: ${existingItemsError.message}`);
      }

      let inventoryRecordId;
      let quantityOrderedChange = 0;
      const quantityReceived = parseFloat(item.quantity_received);

      if (existingItems && existingItems.length > 0) {
        const existingItem = existingItems[0];
        inventoryRecordId = existingItem.id;
        
        const currentQOH = parseFloat(existingItem.quantity_on_hand || 0);
        const currentQOO = parseFloat(existingItem.quantity_on_order || 0);
        const newQOH = currentQOH + quantityReceived;
        const newQOO = Math.max(0, currentQOO - quantityReceived);
        quantityOrderedChange = newQOO - currentQOO;

        // Update non-quantity fields
        const { error: updateInventoryError } = await supabase
          .from('InventoryItem')
          .update({
            updated_date: new Date().toISOString(),
            part_number: item.part_number,
            description: item.description,
            unit: item.unit || existingItem.unit,
            cost: parseFloat(item.cost),
            selling_price: parseFloat(item.selling_price),
            profit_margin: parseFloat(item.profit_margin || 0),
            sales_class: item.sales_class || existingItem.sales_class,
            tag_along_id: item.tag_along_id || existingItem.tag_along_id,
            minimum_quantity: parseInt(item.minimum_quantity || 0, 10),
            maximum_quantity: parseInt(item.maximum_quantity || 0, 10),
            location: item.location || existingItem.location,
            category: item.category || existingItem.category,
            core: item.core !== undefined ? item.core : existingItem.core,
            core_cost: parseFloat(item.core_cost || 0),
            stocked_item: item.stocked_item !== undefined ? item.stocked_item : existingItem.stocked_item,
            supplier_id: supplier.id
          })
          .eq('id', existingItem.id);

        if (updateInventoryError) {
          throw new Error(`Failed to update inventory item: ${updateInventoryError.message}`);
        }

        // Update quantities using RPC to trigger audit log
        const { error: rpcError } = await supabase.rpc('update_inventory_with_audit', {
          p_item_id: existingItem.id,
          p_qoh: newQOH,
          p_qoo: newQOO,
          p_ro_number: null,
          p_supplier_inv: invoice_number,
          p_source_action: 'autopro-processInventoryReceipt',
          p_tx_type: 'Received',
          p_description: `Received from supplier invoice ${invoice_number}`,
          p_user_id: user.id || null,
          p_user_name: user.email || null,
          p_source_record_id: null
        });

        if (rpcError) {
          throw new Error(`Failed to update inventory quantities: ${rpcError.message}`);
        }

        results.updated_inventory_items.push(existingItem.id);
      } else {
        const newInventoryRecord = buildSupabaseRecord(user, {
          part_number: item.part_number,
          description: item.description,
          unit: item.unit || '',
          cost: parseFloat(item.cost),
          selling_price: parseFloat(item.selling_price),
          profit_margin: parseFloat(item.profit_margin || 0),
          sales_class: item.sales_class || '',
          tag_along_id: item.tag_along_id || '',
          minimum_quantity: parseInt(item.minimum_quantity || 0, 10),
          maximum_quantity: parseInt(item.maximum_quantity || 0, 10),
          location: item.location || '',
          category: item.category || '',
          core: item.core || false,
          core_cost: parseFloat(item.core_cost || 0),
          stocked_item: item.stocked_item || false,
          quantity_on_hand: quantityReceived,
          quantity_on_order: 0,
          supplier_id: supplier.id,
          is_active: true
        });

        const { data: newRecord, error: createInventoryError } = await supabase
          .from('InventoryItem')
          .insert([newInventoryRecord])
          .select()
          .maybeSingle();

        if (createInventoryError) {
          throw new Error(`Failed to create inventory item: ${createInventoryError.message}`);
        }

        inventoryRecordId = newRecord.id;
        results.created_inventory_items.push(newRecord.id);
      }

      const isDefaultTaxable = supplier.default_taxable === true;
      const lineAmount = Math.round(parseFloat(item.cost) * quantityReceived * 100) / 100;
      const lineGst = isDefaultTaxable ? 0 : Math.round(lineAmount * 0.05 * 100) / 100;
      
      invoiceLinesToCreate.push({
        supplier_id: supplier.id,
        invoice_number: invoice_number,
        invoice_date: invoice_date,
        inventory_item_id: inventoryRecordId,
        description: `AddPart Qty${quantityReceived} ${item.part_number}`,
        purchase_amount: lineAmount,
        gst_amount: lineGst,
        gl_account: '1200',
        inventory: true,
        gst_override: isDefaultTaxable,
        digital_pdf: digital_pdf
      });

      if (item.core && parseFloat(item.core_cost || 0) > 0) {
        const coreDepositAmount = Math.round(parseFloat(item.core_cost) * quantityReceived * 100) / 100;
        const coreGst = isDefaultTaxable ? 0 : Math.round(coreDepositAmount * 0.05 * 100) / 100;
        
        invoiceLinesToCreate.push({
          supplier_id: supplier.id,
          invoice_number: invoice_number,
          invoice_date: invoice_date,
          inventory_item_id: inventoryRecordId,
          description: `AddCore Qty${quantityReceived} ${item.part_number}`,
          purchase_amount: coreDepositAmount,
          gst_amount: coreGst,
          gl_account: '1200',
          inventory: true,
          gst_override: isDefaultTaxable,
          digital_pdf: digital_pdf
        });
      }

      if (item.enviro_fee && parseFloat(item.enviro_fee) > 0) {
        const enviroFeeAmount = Math.round(parseFloat(item.enviro_fee) * quantityReceived * 100) / 100;
        const enviroGst = isDefaultTaxable ? 0 : Math.round(enviroFeeAmount * 0.05 * 100) / 100;
        
        invoiceLinesToCreate.push({
          supplier_id: supplier.id,
          invoice_number: invoice_number,
          invoice_date: invoice_date,
          inventory_item_id: null,
          description: `Enviro Fee Qty${quantityReceived} ${item.part_number}`,
          purchase_amount: enviroFeeAmount,
          gst_amount: enviroGst,
          gl_account: '5001',
          inventory: false,
          gst_override: isDefaultTaxable,
          digital_pdf: digital_pdf
        });
      }

      txsToCreate.push({
        inventory_item_id: inventoryRecordId,
        part_num: item.part_number,
        tx_date: new Date().toISOString(),
        tx_type: 'Received',
        quantity_change: quantityReceived,
        quantity_ordered_change: quantityOrderedChange,
        supplier_inv: invoice_number,
        supplier_name: supplier.name || '',
        source_record_id: null,
        description: `Received from supplier invoice ${invoice_number}`
      });
    }

    if (freight_amount && parseFloat(freight_amount) > 0) {
      const isDefaultTaxable = supplier.default_taxable === true;
      const freightAmt = parseFloat(freight_amount);
      const freightGst = isDefaultTaxable ? 0 : Math.round(freightAmt * 0.05 * 100) / 100;
      
      invoiceLinesToCreate.push({
        supplier_id: supplier.id,
        invoice_number: invoice_number,
        invoice_date: invoice_date,
        inventory_item_id: null,
        description: `Freight Charge - Inv ${invoice_number}`,
        purchase_amount: freightAmt,
        gst_amount: freightGst,
        gl_account: '5030',
        inventory: false,
        gst_override: isDefaultTaxable,
        digital_pdf: digital_pdf
      });
    }

    if (invoice_gst && parseFloat(invoice_gst) > 0 && invoiceLinesToCreate.length > 0) {
      const targetGst = parseFloat(invoice_gst);
      
      // Calculate total purchase amount to find proportions
      const totalPurchase = invoiceLinesToCreate.reduce((sum, line) => sum + Math.max(0, line.purchase_amount), 0);
      
      if (totalPurchase > 0) {
        let allocatedGst = 0;
        
        // Prorate GST to each line
        for (let i = 0; i < invoiceLinesToCreate.length; i++) {
          const line = invoiceLinesToCreate[i];
          const proportion = Math.max(0, line.purchase_amount) / totalPurchase;
          const proratedGst = Math.round(targetGst * proportion * 100) / 100;
          line.gst_amount = proratedGst;
          allocatedGst = Math.round((allocatedGst + proratedGst) * 100) / 100;
        }
        
        // Amortize rounding difference
        let diff = Math.round((targetGst - allocatedGst) * 100) / 100;
        
        // Sort indices by purchase amount descending to distribute pennies to largest items first
        const indices = invoiceLinesToCreate.map((_, i) => i)
          .sort((a, b) => invoiceLinesToCreate[b].purchase_amount - invoiceLinesToCreate[a].purchase_amount);
          
        let index = 0;
        while (Math.abs(diff) >= 0.01 && index < indices.length) {
          const adjustment = diff > 0 ? 0.01 : -0.01;
          const actualIndex = indices[index];
          invoiceLinesToCreate[actualIndex].gst_amount = Math.round((invoiceLinesToCreate[actualIndex].gst_amount + adjustment) * 100) / 100;
          diff = Math.round((diff - adjustment) * 100) / 100;
          index++;
        }
      }
    }

    let createdLines = [];
    if (invoiceLinesToCreate.length > 0) {
      // Every line in a single receipt (parts, freight, enviro fee) shares one supplier_id +
      // invoice_number, so they all belong to the same conceptual invoice - one resolver call
      // for the whole batch, stamped onto every line before insert.
      const receiptConceptualIds = await resolveConceptualInvoiceIds(supabase, [
        { supplier_id: supplier.id, invoice_number: invoice_number }
      ]);
      const receiptConceptualId = receiptConceptualIds[conceptualKey(supplier.id, invoice_number)];
      invoiceLinesToCreate.forEach((line: any) => {
        line.conceptual_invoice_id = receiptConceptualId;
      });

      createdLines = await insertSupplierInvoiceLines(supabase, user, invoiceLinesToCreate);
      results.created_invoice_lines = createdLines.map(line => line.id);

      try {
        console.log(`Invoking handleSupplierInvoiceLineGL for ${createdLines.length} lines`);
        const glResponse = await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
          body: JSON.stringify({
            supplierInvoiceLines: createdLines,
            action: 'create',
            user: user
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        if (!glResponse.data?.success) {
          console.error('GL batch posting failed:', glResponse.data);
          results.errors.push({ 
            error: 'GL batch posting failed',
            details: glResponse.data 
          });
        }
      } catch (glError: any) {
        console.error('Error posting GL transactions batch:', glError);
        results.errors.push({ 
          error: 'Failed to post GL transactions batch',
          details: glError.message 
        });
      }

      if (createdLines.length > 0 && txsToCreate.length > 0) {
        let lineIndex = 0;
        for (let i = 0; i < txsToCreate.length; i++) {
          if (createdLines[lineIndex]) {
            txsToCreate[i].source_record_id = createdLines[lineIndex].id;
          }
          const itemHadCore = items[i]?.core && parseFloat(items[i]?.core_cost || 0) > 0;
          lineIndex += itemHadCore ? 2 : 1;
        }
      }
    }

    if (txsToCreate.length > 0) {
      const newItemsTxs = txsToCreate.filter(tx => results.created_inventory_items.includes(tx.inventory_item_id));
      if (newItemsTxs.length > 0) {
        const auditLogsToInsert = newItemsTxs.map(tx => ({
          id: crypto.randomUUID(),
          inventory_item_id: tx.inventory_item_id,
          part_num: tx.part_num,
          old_quantity: 0,
          new_quantity: tx.quantity_change,
          old_quantity_on_order: 0,
          new_quantity_on_order: 0,
          quantity_change: String(tx.quantity_change),
          quantity_ordered_change: String(tx.quantity_ordered_change || 0),
          ro_number: null,
          supplier_inv: tx.supplier_inv,
          supplier_name: tx.supplier_name,
          source_record_id: tx.source_record_id,
          description: tx.description,
          tx_type: tx.tx_type,
          source_function: 'autopro-processInventoryReceipt',
          tx_date: tx.tx_date || new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by_id: user.id || null,
          created_by: user.email || null
        }));

        const { data: createdTxs, error: auditError } = await supabase
          .from('InventoryAuditLog')
          .insert(auditLogsToInsert)
          .select('id');

        if (auditError) {
          console.error('Error inserting manual InventoryAuditLog:', auditError);
        } else if (createdTxs) {
          results.created_inventory_txs = createdTxs.map(tx => tx.id);
        }
      }

      const existingItemsTxs = txsToCreate.filter(tx => results.updated_inventory_items.includes(tx.inventory_item_id));
      for (const tx of existingItemsTxs) {
        if (tx.source_record_id) {
          await supabase
            .from('InventoryAuditLog')
            .update({ source_record_id: tx.source_record_id })
            .eq('inventory_item_id', tx.inventory_item_id)
            .eq('supplier_inv', tx.supplier_inv)
            .eq('tx_type', 'Received')
            .order('created_at', { ascending: false })
            .limit(1);
        }
      }
    }

    const totalItems = results.updated_inventory_items.length + results.created_inventory_items.length;
    results.message = `Successfully processed ${totalItems} item(s) for invoice ${invoice_number}`;
    if (results.errors.length > 0) {
      results.message += ` with ${results.errors.length} error(s)`;
      results.success = false;
    }

    return res(results);
  } catch (error: any) {
    console.error('Error in processInventoryReceiptCreate:', error);
    results.success = false;
    results.message = 'Failed to process inventory receipt';
    results.errors.push({
      error: error.message,
      details: error.stack || error.toString()
    });
    return res(results, { status: 500 });
  }
}

async function processInventoryReceiptReverse(supabase: any, user: any, supplierInvoiceLineId: string) {
  const results: any = {
    success: true,
    message: '',
    reversed_invoice_line_id: null,
    created_contra_line_id: null,
    created_inventory_tx_id: null,
    updated_inventory_item_id: null,
    errors: []
  };

  try {
    const originalLine = await getSupplierInvoiceLine(supabase, supplierInvoiceLineId);
    if (!originalLine) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Supplier invoice line not found',
        message: 'The specified transaction does not exist'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const fiscalCheck = await checkFiscalPeriodStatus(supabase, originalLine.invoice_date);
    if (!fiscalCheck.isValid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Fiscal period closed',
        message: `Cannot reverse transaction: ${fiscalCheck.message}`
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if ((originalLine.paid_amount || 0) > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cannot reverse paid transaction',
        message: `This transaction has been paid ($${originalLine.paid_amount.toFixed(2)} paid).`
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (!originalLine.inventory || !originalLine.inventory_item_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Not an inventory transaction',
        message: 'This transaction is not linked to inventory'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', originalLine.inventory_item_id)
      .maybeSingle();

    if (inventoryItemError || !inventoryItem) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Inventory item not found',
        message: 'The linked inventory item no longer exists'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { data: inventoryTxs } = await supabase
      .from('InventoryAuditLog')
      .select('*')
      .eq('source_record_id', supplierInvoiceLineId);

    let quantityToReverse = 0;
    if (inventoryTxs && inventoryTxs.length > 0) {
      // Sum all historical quantity changes (Received + any QOH Adjusted edits)
      quantityToReverse = inventoryTxs.reduce((sum, tx) => sum + (parseFloat(tx.quantity_change) || 0), 0);
      quantityToReverse = Math.abs(quantityToReverse);
    } else {
      // Fallback to parsing from description (AddPart QtyX ...)
      const qtyMatch = originalLine.description?.match(/Qty(\d+(?:\.\d+)?)/);
      quantityToReverse = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
    }

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand || 0);
    const newQOH = currentQOH - quantityToReverse;

    if (newQOH < 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient quantity on hand',
        message: `Reversing this transaction would result in negative inventory (Current: ${currentQOH}, Reversing: ${quantityToReverse})`
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { error: reverseInventoryUpdateError } = await supabase.rpc('update_inventory_with_audit', {
      p_item_id: inventoryItem.id,
      p_qoh: newQOH,
      p_qoo: inventoryItem.quantity_on_order || 0,
      p_ro_number: null,
      p_supplier_inv: originalLine.invoice_number,
      p_source_action: 'autopro-processInventoryReceipt',
      p_tx_type: 'QOH Adjusted',
      p_description: `Reversal of ${originalLine.description}`,
      p_user_id: user.id || null,
      p_user_name: user.email || null,
      p_source_record_id: null
    });

    if (reverseInventoryUpdateError) {
      throw new Error(`Failed to update inventory item: ${reverseInventoryUpdateError.message}`);
    }

    results.updated_inventory_item_id = inventoryItem.id;

    const contraLine = await createSupplierInvoiceLine(supabase, user, {
      supplier_id: originalLine.supplier_id,
      invoice_number: originalLine.invoice_number,
      invoice_date: originalLine.invoice_date,
      inventory_item_id: originalLine.inventory_item_id,
      description: `REVERSAL: ${originalLine.description}`,
      purchase_amount: -1 * (originalLine.purchase_amount || 0),
      gst_amount: -1 * (originalLine.gst_amount || 0),
      gl_account: originalLine.gl_account || '1200',
      inventory: true,
      // Same supplier_id/invoice_number as originalLine - keep it in the same conceptual
      // invoice rather than minting a new one.
      conceptual_invoice_id: originalLine.conceptual_invoice_id
    });

    results.created_contra_line_id = contraLine.id;
    results.reversed_invoice_line_id = originalLine.id;

    await supabase
      .from('InventoryAuditLog')
      .update({ source_record_id: contraLine.id })
      .eq('inventory_item_id', inventoryItem.id)
      .eq('tx_type', 'QOH Adjusted')
      .order('created_at', { ascending: false })
      .limit(1);
    
    results.created_inventory_tx_id = contraLine.id;

    try {
      const glResponse = await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
        body: JSON.stringify({
          supplierInvoiceLine: originalLine,
          action: 'delete',
          user: user
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!glResponse.data?.success) {
        console.error('GL reversal failed:', glResponse.data);
        results.errors.push({ error: 'GL reversal failed', details: glResponse.data });
      }
    } catch (glError: any) {
      console.error('Error reversing GL transactions:', glError);
      results.errors.push({ error: 'Failed to reverse GL transactions', details: glError.message });
    }

    results.message = `Successfully reversed transaction for ${inventoryItem.part_number} (Qty: ${quantityToReverse})`;
    if (results.errors.length > 0) {
      results.message += `. Note: GL errors occurred.`;
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error: any) {
    console.error('Error in processInventoryReceiptReverse:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: error.stack || error.toString()
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function processInventoryReceiptEdit(supabase: any, user: any, supplierInvoiceLineId: string, newInvoiceNumber: string, newInvoiceDate: string, newQuantity: number, newAmountPerUnit: number) {
  const results: any = {
    success: true,
    message: '',
    updated_line_id: null,
    updated_inventory_item_id: null,
    updated_inventory_tx_id: null,
    created_inventory_tx_id: null,
    errors: []
  };

  try {
    const originalLine = await getSupplierInvoiceLine(supabase, supplierInvoiceLineId);
    if (!originalLine) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Supplier invoice line not found'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const originalDateCheck = await checkFiscalPeriodStatus(supabase, originalLine.invoice_date);
    if (!originalDateCheck.isValid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Fiscal period closed for original invoice date'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const newDateCheck = await checkFiscalPeriodStatus(supabase, newInvoiceDate);
    if (!newDateCheck.isValid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Fiscal period closed for new invoice date'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if ((originalLine.paid_amount || 0) > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cannot edit paid supplier invoice line'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (!originalLine.inventory || !originalLine.inventory_item_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Not linked to inventory'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', originalLine.inventory_item_id)
      .maybeSingle();

    if (inventoryItemError || !inventoryItem) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Linked inventory item not found'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { data: inventoryTxs } = await supabase
      .from('InventoryAuditLog')
      .select('*')
      .eq('source_record_id', supplierInvoiceLineId);

    let oldQuantity = 0;
    let oldAmountPerUnit = 0;
    let inventoryTxId = null;

    if (inventoryTxs && inventoryTxs.length > 0) {
      // Sum all historical quantity changes (Received + any QOH Adjusted edits)
      oldQuantity = inventoryTxs.reduce((sum, tx) => sum + (parseFloat(tx.quantity_change) || 0), 0);
      oldQuantity = Math.abs(oldQuantity);
      
      // Get the original Received transaction to update its supplier_inv/tx_date if needed
      const receivedTx = inventoryTxs.find(tx => tx.tx_type === 'Received');
      if (receivedTx) {
        inventoryTxId = receivedTx.id;
      }
      
      oldAmountPerUnit = parseFloat(originalLine.purchase_amount) / oldQuantity;
    } else {
      // Fallback to parsing from description (AddPart QtyX ...)
      const qtyMatch = originalLine.description?.match(/Qty(\d+(?:\.\d+)?)/);
      oldQuantity = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      oldAmountPerUnit = parseFloat(originalLine.purchase_amount) / oldQuantity;
    }

    const newPurchaseAmount = newQuantity * newAmountPerUnit;
    const quantityDelta = newQuantity - oldQuantity;

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand || 0);
    const newQOH = currentQOH + quantityDelta;

    if (newQOH < 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient quantity on hand to complete edit'
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    try {
      const reverseGLResponse = await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
        body: JSON.stringify({
          supplierInvoiceLine: originalLine,
          action: 'delete',
          user: user
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!reverseGLResponse.data?.success) {
        throw new Error(`Failed to reverse original GL entries: ${reverseGLResponse.data?.error || 'Unknown error'}`);
      }
    } catch (glError: any) {
      throw new Error(`Failed to reverse original GL transactions. ${glError.message}`);
    }

    const newGstAmount = Math.round(newPurchaseAmount * 0.05 * 100) / 100;
    const partNumberMatch = originalLine.description?.match(/\/([^/]+)$/);
    const partNumber = partNumberMatch ? partNumberMatch[1] : inventoryItem.part_number;
    const newDescription = originalLine.description?.startsWith('AddCore/') 
      ? `AddCore Qty${newQuantity} ${partNumber}`
      : `AddPart Qty${newQuantity} ${partNumber}`;

    // supplier_id doesn't change in this flow, only invoice_number/date - regroup only if the
    // invoice number actually moved to a different one.
    let nextConceptualInvoiceId = originalLine.conceptual_invoice_id;
    if (String(newInvoiceNumber || '') !== String(originalLine.invoice_number || '')) {
      const regroupedIds = await resolveConceptualInvoiceIds(supabase, [
        { supplier_id: originalLine.supplier_id, invoice_number: newInvoiceNumber, exclude_id: supplierInvoiceLineId }
      ]);
      nextConceptualInvoiceId = regroupedIds[conceptualKey(originalLine.supplier_id, newInvoiceNumber)];
    }

    const updatedLine = await updateSupplierInvoiceLine(supabase, supplierInvoiceLineId, {
      invoice_number: newInvoiceNumber,
      invoice_date: newInvoiceDate,
      description: newDescription,
      purchase_amount: Math.round(newPurchaseAmount * 100) / 100,
      gst_amount: Math.round(newGstAmount * 100) / 100,
      conceptual_invoice_id: nextConceptualInvoiceId
    });
    results.updated_line_id = updatedLine.id;

    if (newAmountPerUnit !== oldAmountPerUnit) {
      await supabase
        .from('InventoryItem')
        .update({
          updated_date: new Date().toISOString(),
          cost: newAmountPerUnit
        })
        .eq('id', inventoryItem.id);
    }

    const { error: editInventoryUpdateError } = await supabase.rpc('update_inventory_with_audit', {
      p_item_id: inventoryItem.id,
      p_qoh: newQOH,
      p_qoo: inventoryItem.quantity_on_order || 0,
      p_ro_number: null,
      p_supplier_inv: newInvoiceNumber,
      p_source_action: 'autopro-processInventoryReceipt',
      p_tx_type: 'QOH Adjusted',
      p_description: `Quantity modified from ${oldQuantity} to ${newQuantity} on invoice ${newInvoiceNumber}`,
      p_user_id: user.id || null,
      p_user_name: user.email || null,
      p_source_record_id: null
    });

    if (editInventoryUpdateError) {
      throw new Error(`Failed to update inventory item QOH: ${editInventoryUpdateError.message}`);
    }

    results.updated_inventory_item_id = inventoryItem.id;

    if (inventoryTxId) {
      await supabase
        .from('InventoryAuditLog')
        .update({
          supplier_inv: newInvoiceNumber,
          tx_date: new Date().toISOString()
        })
        .eq('id', inventoryTxId);
      results.updated_inventory_tx_id = inventoryTxId;
    }

    if (Math.abs(quantityDelta) > 0.0001) {
      const { data: adjustmentTx } = await supabase
        .from('InventoryAuditLog')
        .insert([{
          id: crypto.randomUUID(),
          inventory_item_id: inventoryItem.id,
          part_num: inventoryItem.part_number,
          tx_date: new Date().toISOString(),
          tx_type: 'QOH Adjusted',
          quantity_change: String(quantityDelta),
          quantity_ordered_change: "0",
          supplier_inv: newInvoiceNumber,
          supplier_name: '', 
          source_record_id: supplierInvoiceLineId,
          description: `Adjustment from editing invoice ${newInvoiceNumber} (Qty change: ${quantityDelta})`,
          source_function: 'autopro-processInventoryReceipt',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by_id: user.id || null,
          created_by: user.email || null
        }])
        .select('id')
        .maybeSingle();
      
      results.created_inventory_tx_id = adjustmentTx?.id || null;
    }

    try {
      const newGLResponse = await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
        body: JSON.stringify({
          supplierInvoiceLine: updatedLine,
          action: 'create',
          user: user
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!newGLResponse.data?.success) {
        results.errors.push({ error: 'Failed to post new GL entries', details: newGLResponse.data });
      }
    } catch (glError: any) {
      results.errors.push({ error: 'Failed to post new GL entries', details: glError.message });
    }

    results.message = `Successfully updated supplier invoice line`;
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error: any) {
    console.error('Error in processInventoryReceiptEdit:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: error.stack || error.toString()
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}