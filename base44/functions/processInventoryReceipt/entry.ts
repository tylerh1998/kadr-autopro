import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

/**
 * Backend function to process inventory receipts from suppliers
 * Handles creation/update of inventory items, supplier invoice lines, GL posting, and transaction tracking
 * 
 * @param {Object} payload
 * @param {string} payload.supplier_id - Supplier ID
 * @param {string} payload.invoice_number - Supplier invoice number
 * @param {string} payload.invoice_date - Invoice date (YYYY-MM-DD)
 * @param {Array} payload.items - Array of items to process
 * @param {string} payload.action - Action type: 'create', 'edit', or 'reverse'
 * @param {string} payload.supplier_invoice_line_id - Invoice line ID (for 'reverse' or 'edit' actions)
 * @param {number} payload.quantity - New quantity (for 'edit' action)
 * @param {number} payload.amount_per_unit - New amount per unit (for 'edit' action)
 * @returns {Object} Result with success status and created record IDs
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    // Parse request body
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
      amount_per_unit
    } = payload;

    // Handle reverse action - requires only supplier_invoice_line_id
    if (action === 'reverse') {
      if (!supplier_invoice_line_id) {
        return Response.json({ 
          success: false, 
          error: 'Supplier invoice line ID is required for reverse action' 
        }, { status: 400 });
      }
      return await processInventoryReceiptReverse(base44, supabase, user, supplier_invoice_line_id);
    }

    // Handle edit action
    if (action === 'edit') {
      if (!supplier_invoice_line_id) {
        return Response.json({ 
          success: false, 
          error: 'Supplier invoice line ID is required for edit action' 
        }, { status: 400 });
      }
      if (!invoice_number || !invoice_date) {
        return Response.json({ 
          success: false, 
          error: 'Invoice number and date are required for edit action' 
        }, { status: 400 });
      }
      if (!quantity || parseFloat(quantity) <= 0) {
        return Response.json({ 
          success: false, 
          error: 'Quantity must be greater than 0' 
        }, { status: 400 });
      }
      if (!amount_per_unit || parseFloat(amount_per_unit) <= 0) {
        return Response.json({ 
          success: false, 
          error: 'Amount per unit must be greater than 0' 
        }, { status: 400 });
      }
      return await processInventoryReceiptEdit(
        base44,
        supabase,
        user,
        supplier_invoice_line_id,
        invoice_number,
        invoice_date,
        parseFloat(quantity),
        parseFloat(amount_per_unit)
      );
    }

    // Validate required fields for create action
    if (!supplier_id) {
      return Response.json({ 
        success: false, 
        error: 'Supplier ID is required' 
      }, { status: 400 });
    }

    if (!invoice_number) {
      return Response.json({ 
        success: false, 
        error: 'Invoice number is required' 
      }, { status: 400 });
    }

    if (!invoice_date) {
      return Response.json({ 
        success: false, 
        error: 'Invoice date is required' 
      }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'At least one item is required' 
      }, { status: 400 });
    }

    // Validate invoice date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(invoice_date)) {
      return Response.json({ 
        success: false, 
        error: 'Invalid invoice date format. Must be YYYY-MM-DD' 
      }, { status: 400 });
    }

    // Fetch supplier info for transaction records from Supabase
    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', supplier_id)
      .maybeSingle();

    if (supplierError) {
      throw new Error(`Failed to load supplier from Supabase: ${supplierError.message}`);
    }

    if (!supplier) {
      return Response.json({ 
        success: false, 
        error: 'Supplier not found' 
      }, { status: 404 });
    }

    // Process items based on action
    if (action === 'create') {
      return await processInventoryReceiptCreate(base44, supabase, user, supplier, invoice_number, invoice_date, items);
    } else {
      return Response.json({ 
        success: false, 
        error: 'Invalid action. Must be "create", "edit", or "reverse"' 
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error processing inventory receipt:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: error.toString()
    }, { status: 500 });
  }
});

function buildSupabaseRecord(user, data, isUpdate = false) {
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

async function insertSupplierInvoiceLines(supabase, user, lines) {
  const insertRows = lines.map((line) => buildSupabaseRecord(user, line));
  const { data, error } = await supabase.from('SupplierInvoiceLine').insert(insertRows).select();

  if (error) {
    throw new Error(`Failed to create supplier invoice lines in Supabase: ${error.message}`);
  }

  return data || [];
}

async function getSupplierInvoiceLine(supabase, id) {
  const { data, error } = await supabase
    .from('SupplierInvoiceLine')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load supplier invoice line from Supabase: ${error.message}`);
  }

  return data;
}

async function createSupplierInvoiceLine(supabase, user, line) {
  const { data, error } = await supabase
    .from('SupplierInvoiceLine')
    .insert([buildSupabaseRecord(user, line)])
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to create supplier invoice line in Supabase: ${error.message}`);
  }

  return data;
}

async function updateSupplierInvoiceLine(supabase, id, updates) {
  const { data, error } = await supabase
    .from('SupplierInvoiceLine')
    .update(buildSupabaseRecord(null, updates, true))
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update supplier invoice line in Supabase: ${error.message}`);
  }

  return data;
}

/**
 * Helper function to check fiscal period status
 * @param {Object} base44 - Base44 SDK instance
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function checkFiscalPeriodStatus(base44, dateString) {
  try {
    if (!dateString) {
      return {
        isValid: false,
        message: "No date provided for fiscal period check."
      };
    }

    const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.list();
    
    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return {
        isValid: false,
        message: "No fiscal periods have been configured. Please set up fiscal periods in the system."
      };
    }
    
    const datePart = dateString.split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    const checkDate = new Date(datePart + 'T00:00:00Z');
    
    if (isNaN(checkDate.getTime())) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');
      
      if (checkDate >= startDate && checkDate <= endDate) {
        if (period.is_closed) {
          return {
            isValid: false,
            message: "Date is in a closed fiscal period. No changes can be made."
          };
        } else {
          return {
            isValid: true,
            message: "Date is in an open fiscal period."
          };
        }
      }
    }
    
    return {
      isValid: false,
      message: "No valid fiscal period found for this date. No changes can be made."
    };
    
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return {
      isValid: false,
      message: "Error checking fiscal period. Please try again."
    };
  }
}

/**
 * Process inventory receipt creation
 */
async function processInventoryReceiptCreate(base44, supabase, user, supplier, invoice_number, invoice_date, items) {
  const results = {
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
    // Process each item
    for (const item of items) {
      // Validate required item fields
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

      // Check if inventory item already exists in Supabase
      const { data: existingItems, error: existingItemsError } = await supabase
        .from('InventoryItem')
        .select('*')
        .eq('part_number', item.part_number);

      if (existingItemsError) {
        throw new Error(`Failed to load inventory item from Supabase: ${existingItemsError.message}`);
      }
      
      let inventoryRecordId;
      let quantityOrderedChange = 0;
      const quantityReceived = parseFloat(item.quantity_received);

      if (existingItems && existingItems.length > 0) {
        // Update existing inventory item
        const existingItem = existingItems[0];
        inventoryRecordId = existingItem.id;
        
        const newQOH = (existingItem.quantity_on_hand || 0) + quantityReceived;
        const newQOO = Math.max(0, (existingItem.quantity_on_order || 0) - quantityReceived);
        quantityOrderedChange = newQOO - (existingItem.quantity_on_order || 0);

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
            quantity_on_hand: newQOH,
            quantity_on_order: newQOO,
            supplier_id: supplier.id
          })
          .eq('id', existingItem.id);

        if (updateInventoryError) {
          throw new Error(`Failed to update inventory item in Supabase: ${updateInventoryError.message}`);
        }

        results.updated_inventory_items.push(existingItem.id);
      } else {
        // Create new inventory item
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
          throw new Error(`Failed to create inventory item in Supabase: ${createInventoryError.message}`);
        }

        inventoryRecordId = newRecord.id;
        results.created_inventory_items.push(newRecord.id);
      }

      // Determine default tax settings from supplier
      const isDefaultTaxable = supplier.default_taxable === true;

      // Create supplier invoice line for the part with forced 2 decimal rounding
      const lineAmount = Math.round(parseFloat(item.cost) * quantityReceived * 100) / 100;
      // If default_taxable is true, use manual GST mode (gst_override=true) and set GST to 0.
      // Otherwise, calculate GST normally.
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
        gst_override: isDefaultTaxable
      });

      // If core item, create additional invoice line for core deposit with forced 2 decimal rounding
      if (item.core && parseFloat(item.core_cost || 0) > 0) {
        const coreDepositAmount = Math.round(parseFloat(item.core_cost) * quantityReceived * 100) / 100;
        // Same logic for core deposit GST
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
          gst_override: isDefaultTaxable
        });
      }

      // Create inventory transaction record (will link to invoice line later)
      txsToCreate.push({
        inventory_item_id: inventoryRecordId,
        part_num: item.part_number,
        tx_date: new Date().toISOString(),
        tx_type: 'Received',
        quantity_change: quantityReceived,
        quantity_ordered_change: quantityOrderedChange,
        supplier_inv: invoice_number,
        supplier_name: supplier.name || '',
        source_record_id: null, // Will be updated after invoice lines are created
        description: `Received from supplier invoice ${invoice_number}`
      });
    }

    // Create all supplier invoice lines in Supabase
    let createdLines = [];
    if (invoiceLinesToCreate.length > 0) {
      createdLines = await insertSupplierInvoiceLines(supabase, user, invoiceLinesToCreate);
      console.log(`Created ${createdLines.length} supplier invoice lines in Supabase for invoice ${invoice_number}`);
      
      results.created_invoice_lines = createdLines.map(line => line.id);

      // Post GL transactions for all lines in one batch
      try {
        console.log(`Invoking handleSupplierInvoiceLineGL for ${createdLines.length} lines`);
        const glResponse = await base44.asServiceRole.functions.invoke('handleSupplierInvoiceLineGL', {
          supplierInvoiceLines: createdLines,
          action: 'create'
        });

        if (!glResponse.data.success) {
          console.error('GL batch posting failed:', glResponse.data);
          results.errors.push({ 
            error: 'GL batch posting failed',
            details: glResponse.data 
          });
        } else {
            console.log('Successfully posted GL transactions batch');
        }
      } catch (glError) {
        console.error('Error posting GL transactions batch:', glError);
        results.errors.push({ 
          error: 'Failed to post GL transactions batch',
          details: glError.message 
        });
      }

      // Link inventory transactions to supplier invoice lines
      if (createdLines.length > 0 && txsToCreate.length > 0) {
        let lineIndex = 0;
        for (let i = 0; i < txsToCreate.length; i++) {
          if (createdLines[lineIndex]) {
            txsToCreate[i].source_record_id = createdLines[lineIndex].id;
          }
          
          // Check if this item had a core deposit (which would create 2 lines)
          const itemHadCore = items[i]?.core && parseFloat(items[i]?.core_cost || 0) > 0;
          lineIndex += itemHadCore ? 2 : 1;
        }
      }
    }

    // Create all inventory transaction records in bulk
    if (txsToCreate.length > 0) {
      const createdTxs = await base44.asServiceRole.entities.InventoryTxs.bulkCreate(txsToCreate);
      console.log(`Created ${createdTxs.length} inventory transactions for invoice ${invoice_number}`);
      
      results.created_inventory_txs = createdTxs.map(tx => tx.id);
    }

    // Set success message
    const totalItems = results.updated_inventory_items.length + results.created_inventory_items.length;
    results.message = `Successfully processed ${totalItems} item(s) for invoice ${invoice_number}`;
    
    if (results.errors.length > 0) {
      results.message += ` with ${results.errors.length} error(s)`;
      results.success = false;
    }

    return Response.json(results);

  } catch (error) {
    console.error('Error in processInventoryReceiptCreate:', error);
    results.success = false;
    results.message = 'Failed to process inventory receipt';
    results.errors.push({
      error: error.message,
      details: error.toString()
    });
    
    return Response.json(results, { status: 500 });
  }
}

/**
 * Process inventory receipt reversal (delete)
 * Reverses the effects of a previously received inventory transaction
 */
async function processInventoryReceiptReverse(base44, supabase, user, supplierInvoiceLineId) {
  const results = {
    success: true,
    message: '',
    reversed_invoice_line_id: null,
    created_contra_line_id: null,
    created_inventory_tx_id: null,
    updated_inventory_item_id: null,
    errors: []
  };

  try {
    // 1. Fetch the original supplier invoice line from Supabase
    const originalLine = await getSupplierInvoiceLine(supabase, supplierInvoiceLineId);
    if (!originalLine) {
      return Response.json({
        success: false,
        error: 'Supplier invoice line not found',
        message: 'The specified transaction does not exist'
      }, { status: 404 });
    }

    // 2. Check fiscal period for original date
    const fiscalCheck = await checkFiscalPeriodStatus(base44, originalLine.invoice_date);
    if (!fiscalCheck.isValid) {
      return Response.json({
        success: false,
        error: 'Fiscal period closed',
        message: `Cannot reverse transaction: ${fiscalCheck.message}`,
        fiscal_period_message: fiscalCheck.message
      }, { status: 400 });
    }

    // 3. Check if the line has been paid
    if ((originalLine.paid_amount || 0) > 0) {
      return Response.json({
        success: false,
        error: 'Cannot reverse paid transaction',
        message: `This transaction has been paid ($${originalLine.paid_amount.toFixed(2)} paid). Unpay the transaction before reversing.`,
        paid_amount: originalLine.paid_amount
      }, { status: 400 });
    }

    // 4. Check if this is an inventory-linked transaction
    if (!originalLine.inventory) {
      return Response.json({
        success: false,
        error: 'Not an inventory transaction',
        message: 'This transaction is not linked to inventory and cannot be reversed through this function'
      }, { status: 400 });
    }

    // 5. Fetch the linked inventory item
    if (!originalLine.inventory_item_id) {
      return Response.json({
        success: false,
        error: 'No linked inventory item',
        message: 'This transaction is not linked to a specific inventory item'
      }, { status: 400 });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', originalLine.inventory_item_id)
      .maybeSingle();

    if (inventoryItemError) {
      throw new Error(`Failed to load inventory item from Supabase: ${inventoryItemError.message}`);
    }

    if (!inventoryItem) {
      return Response.json({
        success: false,
        error: 'Inventory item not found',
        message: 'The linked inventory item no longer exists'
      }, { status: 404 });
    }

    // 6. Find the corresponding InventoryTxs record to determine quantity
    const inventoryTxs = await base44.asServiceRole.entities.InventoryTxs.filter({
      source_record_id: supplierInvoiceLineId,
      tx_type: 'Received'
    });

    let quantityToReverse = 0;
    if (inventoryTxs.length > 0) {
      quantityToReverse = Math.abs(inventoryTxs[0].quantity_change || 0);
    } else {
      // Try to parse from description if InventoryTxs not found
      const qtyMatch = originalLine.description?.match(/x(\d+(?:\.\d+)?)\//);
      if (qtyMatch) {
        quantityToReverse = parseFloat(qtyMatch[1]);
      } else {
        quantityToReverse = 1; // Fallback
      }
    }

    // 7. Calculate new QOH (subtract the reversed quantity)
    const currentQOH = inventoryItem.quantity_on_hand || 0;
    const newQOH = currentQOH - quantityToReverse;

    // Check if reversal would result in negative QOH
    if (newQOH < 0) {
      return Response.json({
        success: false,
        error: 'Insufficient quantity on hand',
        message: `Reversing this transaction would result in negative inventory (Current: ${currentQOH}, Reversing: ${quantityToReverse})`,
        current_qoh: currentQOH,
        quantity_to_reverse: quantityToReverse
      }, { status: 400 });
    }

    // 8. Update the inventory item QOH
    const { error: reverseInventoryUpdateError } = await supabase
      .from('InventoryItem')
      .update({
        updated_date: new Date().toISOString(),
        quantity_on_hand: newQOH
      })
      .eq('id', inventoryItem.id);

    if (reverseInventoryUpdateError) {
      throw new Error(`Failed to update inventory item in Supabase: ${reverseInventoryUpdateError.message}`);
    }

    results.updated_inventory_item_id = inventoryItem.id;
    console.log(`Updated inventory item ${inventoryItem.id}: QOH ${currentQOH} -> ${newQOH}`);

    // 9. Create a contra supplier invoice line (negative amounts) in Supabase
    const contraLine = await createSupplierInvoiceLine(supabase, user, {
      supplier_id: originalLine.supplier_id,
      invoice_number: originalLine.invoice_number,
      invoice_date: originalLine.invoice_date,
      inventory_item_id: originalLine.inventory_item_id,
      description: `REVERSAL: ${originalLine.description}`,
      purchase_amount: -1 * (originalLine.purchase_amount || 0),
      gst_amount: -1 * (originalLine.gst_amount || 0),
      gl_account: originalLine.gl_account || '1200',
      inventory: true
    });
    results.created_contra_line_id = contraLine.id;
    results.reversed_invoice_line_id = originalLine.id;
    console.log(`Created contra line ${contraLine.id} reversing line ${originalLine.id}`);

    // 10. Create a reversal InventoryTxs record
    const reversalTx = await base44.asServiceRole.entities.InventoryTxs.create({
      inventory_item_id: inventoryItem.id,
      part_num: inventoryItem.part_number,
      tx_date: new Date().toISOString(),
      tx_type: 'QOH Adjusted',
      quantity_change: -1 * quantityToReverse,
      quantity_ordered_change: 0,
      supplier_inv: originalLine.invoice_number,
      supplier_name: '', // Will be populated if needed
      source_record_id: contraLine.id,
      description: `Reversal of ${originalLine.description}`
    });
    results.created_inventory_tx_id = reversalTx.id;
    console.log(`Created reversal InventoryTxs ${reversalTx.id}`);

    // 11. Reverse the original GL transactions directly
    try {
      const glResponse = await base44.asServiceRole.functions.invoke('handleSupplierInvoiceLineGL', {
        supplierInvoiceLine: originalLine,
        action: 'delete'
      });

      if (!glResponse.data.success) {
        console.error('GL reversal failed for original line:', originalLine.id, glResponse.data);
        results.errors.push({
          error: 'GL reversal failed for reversal',
          details: glResponse.data
        });
      } else {
        console.log(`Successfully reversed GL transactions for original line ${originalLine.id}`);
      }
    } catch (glError) {
      console.error('Error reversing GL transactions for original line:', originalLine.id, glError);
      results.errors.push({
        error: 'Failed to reverse GL transactions for reversal',
        details: glError.message
      });
    }

    // Set success message
    results.message = `Successfully reversed transaction for ${inventoryItem.part_number} (Qty: ${quantityToReverse})`;
    
    if (results.errors.length > 0) {
      results.message += `. Note: ${results.errors.length} GL posting error(s) occurred - manual review recommended`;
    }

    return Response.json(results);

  } catch (error) {
    console.error('Error in processInventoryReceiptReverse:', error);
    results.success = false;
    results.message = 'Failed to reverse inventory transaction';
    results.errors.push({
      error: error.message,
      details: error.toString()
    });
    
    return Response.json(results, { status: 500 });
  }
}

/**
 * Process inventory receipt edit
 * Updates an existing inventory transaction with new values
 */
async function processInventoryReceiptEdit(base44, supabase, user, supplierInvoiceLineId, newInvoiceNumber, newInvoiceDate, newQuantity, newAmountPerUnit) {
  const results = {
    success: true,
    message: '',
    updated_line_id: null,
    updated_inventory_item_id: null,
    updated_inventory_tx_id: null,
    quantity_delta: 0,
    old_qoh: 0,
    new_qoh: 0,
    changes: {},
    errors: []
  };

  try {
    // 1. Fetch the original supplier invoice line from Supabase
    const originalLine = await getSupplierInvoiceLine(supabase, supplierInvoiceLineId);
    if (!originalLine) {
      return Response.json({
        success: false,
        error: 'Supplier invoice line not found',
        message: 'The specified transaction does not exist'
      }, { status: 404 });
    }

    // 2. Check if the line has been paid
    if ((originalLine.paid_amount || 0) > 0) {
      return Response.json({
        success: false,
        error: 'Cannot edit paid transaction',
        message: `This transaction has been paid ($${originalLine.paid_amount.toFixed(2)} paid). Unpay the transaction before editing.`,
        paid_amount: originalLine.paid_amount
      }, { status: 400 });
    }

    // 3. Check if this is an inventory-linked transaction
    if (!originalLine.inventory) {
      return Response.json({
        success: false,
        error: 'Not an inventory transaction',
        message: 'This transaction is not linked to inventory and cannot be edited through this function'
      }, { status: 400 });
    }

    // 4. Validate fiscal periods for both original and new dates
    const originalDateCheck = await checkFiscalPeriodStatus(base44, originalLine.invoice_date);
    if (!originalDateCheck.isValid) {
      return Response.json({
        success: false,
        error: 'Original fiscal period closed',
        message: `Cannot edit transaction: Original date's fiscal period is closed. ${originalDateCheck.message}`,
        fiscal_period_message: originalDateCheck.message
      }, { status: 400 });
    }

    const newDateCheck = await checkFiscalPeriodStatus(base44, newInvoiceDate);
    if (!newDateCheck.isValid) {
      return Response.json({
        success: false,
        error: 'New fiscal period closed',
        message: `Cannot edit transaction: New date's fiscal period is closed. ${newDateCheck.message}`,
        fiscal_period_message: newDateCheck.message
      }, { status: 400 });
    }

    // 5. Fetch the linked inventory item
    if (!originalLine.inventory_item_id) {
      return Response.json({
        success: false,
        error: 'No linked inventory item',
        message: 'This transaction is not linked to a specific inventory item'
      }, { status: 400 });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', originalLine.inventory_item_id)
      .maybeSingle();

    if (inventoryItemError) {
      throw new Error(`Failed to load inventory item from Supabase: ${inventoryItemError.message}`);
    }

    if (!inventoryItem) {
      return Response.json({
        success: false,
        error: 'Inventory item not found',
        message: 'The linked inventory item no longer exists'
      }, { status: 404 });
    }

    // 6. Find the corresponding InventoryTxs record to determine original quantity
    // Prioritize parsing from description as it represents the current state
    const inventoryTxs = await base44.asServiceRole.entities.InventoryTxs.filter({
      source_record_id: supplierInvoiceLineId,
      tx_type: 'Received'
    });

    let originalQuantity = 0;
    let inventoryTxId = null;
    
    // Always get the Tx ID for metadata updates
    if (inventoryTxs.length > 0) {
      inventoryTxId = inventoryTxs[0].id;
    }

    const qtyMatch = originalLine.description?.match(/\/x(\d+(?:\.\d+)?)\//);
    if (qtyMatch) {
      originalQuantity = parseFloat(qtyMatch[1]);
      console.log(`Derived original quantity ${originalQuantity} from description`);
    } else if (inventoryTxs.length > 0) {
      // Fallback to InventoryTxs
      originalQuantity = Math.abs(inventoryTxs[0].quantity_change || 0);
      console.log(`Derived original quantity ${originalQuantity} from InventoryTxs`);
    } else {
      originalQuantity = 1; // Fallback
      console.log('Defaulted original quantity to 1');
    }

    // 7. Calculate changes and deltas
    const originalPurchaseAmount = parseFloat(originalLine.purchase_amount || 0);
    const newPurchaseAmount = newQuantity * newAmountPerUnit;
    const quantityDelta = parseFloat((newQuantity - originalQuantity).toFixed(4)); // Handle floating point issues
    
    results.changes = {
      invoice_number_changed: originalLine.invoice_number !== newInvoiceNumber,
      invoice_date_changed: originalLine.invoice_date !== newInvoiceDate,
      quantity_changed: Math.abs(quantityDelta) > 0.0001,
      amount_changed: Math.abs(originalPurchaseAmount - newPurchaseAmount) > 0.01
    };

    console.log('Edit changes detected:', results.changes);
    console.log(`Original: ${originalQuantity} @ $${(originalQuantity > 0 ? (originalPurchaseAmount / originalQuantity) : 0).toFixed(2)} = $${originalPurchaseAmount.toFixed(2)}`);
    console.log(`New: ${newQuantity} @ $${newAmountPerUnit.toFixed(2)} = $${newPurchaseAmount.toFixed(2)}`);
    console.log(`Quantity delta: ${quantityDelta} (New: ${newQuantity} - Old: ${originalQuantity})`);

    // 8. Calculate new QOH and check for negative inventory
    const currentQOH = parseFloat(inventoryItem.quantity_on_hand || 0);
    const newQOH = parseFloat((currentQOH + quantityDelta).toFixed(4));
    
    results.old_qoh = currentQOH;
    results.new_qoh = newQOH;
    results.quantity_delta = quantityDelta;

    console.log(`QOH Calculation: Current ${currentQOH} + Delta ${quantityDelta} = New ${newQOH}`);

    if (newQOH < 0) {
      return Response.json({
        success: false,
        error: 'Insufficient quantity on hand',
        message: `Edit would result in negative inventory (Current: ${currentQOH}, Delta: ${quantityDelta})`,
        current_qoh: currentQOH,
        quantity_delta: quantityDelta
      }, { status: 400 });
    }

    // 9. Reverse original GL entries (using the original line data)
    console.log(`Step 1: Reversing original GL entries for line ${originalLine.id}`);
    try {
      // Use 'delete' action to reverse entries (handleSupplierInvoiceLineGL expects 'delete' not 'reverse')
      const reverseGLResponse = await base44.asServiceRole.functions.invoke('handleSupplierInvoiceLineGL', {
        supplierInvoiceLine: originalLine,
        action: 'delete'
      });

      if (!reverseGLResponse.data.success) {
        console.error('GL reversal failed:', reverseGLResponse.data);
        throw new Error(`Failed to reverse original GL entries: ${reverseGLResponse.data?.error || 'Unknown error'}`);
      } else {
        console.log('Successfully reversed original GL entries');
      }
    } catch (glError) {
      console.error('Error reversing GL transactions:', glError);
      // Throw error to stop execution - prevent duplicate/incorrect GL state
      throw new Error(`Critical: Failed to reverse original GL transactions. ${glError.message}`);
    }

    // 10. Update the SupplierInvoiceLine record with new values
    console.log(`Step 2: Updating SupplierInvoiceLine ${originalLine.id}`);
    const newGstAmount = Math.round(newPurchaseAmount * 0.05 * 100) / 100;
    
    // Extract part number from original description
    const partNumberMatch = originalLine.description?.match(/\/([^/]+)$/);
    const partNumber = partNumberMatch ? partNumberMatch[1] : inventoryItem.part_number;
    
    // Determine if this is a core line
    const isCoreLine = originalLine.description?.startsWith('AddCore/');
    const newDescription = isCoreLine 
      ? `AddCore Qty${newQuantity} ${partNumber}`
      : `AddPart Qty${newQuantity} ${partNumber}`;

    const updatedLine = await updateSupplierInvoiceLine(supabase, supplierInvoiceLineId, {
      invoice_number: newInvoiceNumber,
      invoice_date: newInvoiceDate,
      description: newDescription,
      purchase_amount: Math.round(newPurchaseAmount * 100) / 100,
      gst_amount: Math.round(newGstAmount * 100) / 100
    });
    results.updated_line_id = updatedLine.id;
    console.log(`Updated line: ${newDescription}, Amount: $${newPurchaseAmount.toFixed(2)}`);

    // 11. Update the InventoryItem QOH
    console.log(`Step 3: Updating InventoryItem ${inventoryItem.id} QOH: ${currentQOH} -> ${newQOH}`);
    const { error: editInventoryUpdateError } = await supabase
      .from('InventoryItem')
      .update({
        updated_date: new Date().toISOString(),
        quantity_on_hand: newQOH
      })
      .eq('id', inventoryItem.id);

    if (editInventoryUpdateError) {
      throw new Error(`Failed to update inventory item in Supabase: ${editInventoryUpdateError.message}`);
    }

    results.updated_inventory_item_id = inventoryItem.id;

    // 12. Update the InventoryTxs record (Metadata only)
    if (inventoryTxId) {
      console.log(`Step 4: Updating InventoryTxs ${inventoryTxId} metadata`);
      await base44.asServiceRole.entities.InventoryTxs.update(inventoryTxId, {
        supplier_inv: newInvoiceNumber,
        tx_date: new Date(newInvoiceDate).toISOString(),
      });
      results.updated_inventory_tx_id = inventoryTxId;
    } else {
      console.log('No InventoryTxs record found to update');
    }

    // 12b. Create QOH Adjusted transaction if quantity changed
    if (Math.abs(quantityDelta) > 0.0001) {
      console.log(`Step 4b: Creating QOH Adjusted transaction for delta: ${quantityDelta}`);
      try {
        const adjustmentTx = await base44.asServiceRole.entities.InventoryTxs.create({
          inventory_item_id: inventoryItem.id,
          part_num: inventoryItem.part_number,
          tx_date: new Date().toISOString(),
          tx_type: 'QOH Adjusted',
          quantity_change: quantityDelta,
          quantity_ordered_change: 0,
          supplier_inv: newInvoiceNumber,
          supplier_name: '', 
          source_record_id: supplierInvoiceLineId,
          description: `Adjustment from editing invoice ${newInvoiceNumber} (Qty change: ${quantityDelta})`
        });
        results.created_inventory_tx_id = adjustmentTx.id;
        console.log(`Successfully created QOH Adjusted transaction ${adjustmentTx.id}`);
      } catch (txError) {
        console.error('Failed to create QOH Adjusted transaction:', txError);
        results.errors.push({
          error: 'Failed to create inventory adjustment transaction',
          details: txError.message
        });
        // Non-critical, but should be noted
      }
    } else {
        console.log(`Skipping QOH Adjusted transaction creation because delta is ${quantityDelta}`);
    }

    // 13. Post new GL entries with the updated line data
    console.log(`Step 5: Posting new GL entries for updated line`);
    try {
      const newGLResponse = await base44.asServiceRole.functions.invoke('handleSupplierInvoiceLineGL', {
        supplierInvoiceLine: updatedLine,
        action: 'create'
      });

      if (!newGLResponse.data.success) {
        console.error('GL posting failed for updated line:', newGLResponse.data);
        results.errors.push({
          error: 'Failed to post new GL entries',
          details: newGLResponse.data
        });
      } else {
        console.log('Successfully posted new GL entries');
      }
    } catch (glError) {
      console.error('Error posting new GL transactions:', glError);
      results.errors.push({
        error: 'Failed to post new GL transactions',
        details: glError.message
      });
    }

    // Set success message
    results.message = `Successfully edited transaction for ${inventoryItem.part_number}`;
    
    const changesList = [];
    if (results.changes.invoice_number_changed) changesList.push(`invoice # changed to ${newInvoiceNumber}`);
    if (results.changes.invoice_date_changed) changesList.push(`date changed to ${newInvoiceDate}`);
    if (results.changes.quantity_changed) changesList.push(`qty ${originalQuantity} → ${newQuantity}`);
    if (results.changes.amount_changed) changesList.push(`amount $${originalPurchaseAmount.toFixed(2)} → $${newPurchaseAmount.toFixed(2)}`);
    
    if (changesList.length > 0) {
      results.message += ` (${changesList.join(', ')})`;
    }
    
    if (results.errors.length > 0) {
      results.message += `. Note: ${results.errors.length} GL error(s) occurred - manual review recommended`;
    }

    return Response.json(results);

  } catch (error) {
    console.error('Error in processInventoryReceiptEdit:', error);
    results.success = false;
    results.message = 'Failed to edit inventory transaction';
    results.errors.push({
      error: error.message,
      details: error.toString()
    });
    
    return Response.json(results, { status: 500 });
  }
}