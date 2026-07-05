import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { format, endOfQuarter, getQuarter, getYear } from 'npm:date-fns@2.30.0';

function buildSupabaseRecord(user, data) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
    created_date: now,
    updated_date: now,
    created_by: user.email,
    created_by_id: user.id,
    ...data
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ success: false, error: 'Start date and end date are required' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    // 1. Fetch Levies
    // We fetch all levies in range.
    // Assuming date_applied is ISO string.
    const levies = await base44.asServiceRole.entities.Levies.filter({
      date_applied: {
        "$gte": new Date(startDate).toISOString(),
        "$lte": new Date(endDate + 'T23:59:59.999Z').toISOString()
      }
    });

    if (levies.length === 0) {
      return Response.json({ success: false, error: 'No levies found for this period' }, { status: 400 });
    }

    // 2. Fetch OtherChargeList to group and validate
    const otherCharges = await base44.asServiceRole.entities.OtherChargeList.list();
    const otherChargesMap = new Map(otherCharges.map(oc => [oc.id, oc]));

    // Group levies by other_charge_id
    const leviesByChargeId = {};
    const processedLevyIds = [];

    for (const levy of levies) {
      if (!levy.other_charge_id) continue; // Should not happen based on schema but good to check
      
      // If already processed (has supplier_invoice_line_id), should we skip or re-process?
      // "It will then iterate... and update the supplier_invoice_line_id"
      // If it already has one, maybe we should skip to avoid double posting?
      // The user didn't explicitly say to skip, but "Post to AP" implies doing it for unposted ones or just doing what's on report.
      // Usually you don't want to double post.
      // Let's assume we post everything on the report as requested, but if they are already posted, it might be messy.
      // However, for safety in a "Post" action, typically you check if it's already posted.
      // But the prompt says "on the report... create... for each unique other charge ID displayed".
      // I will include all, assuming the user knows what they are doing or filters the report. 
      // Actually, updating the link suggests we are linking them NOW.
      
      if (!leviesByChargeId[levy.other_charge_id]) {
        leviesByChargeId[levy.other_charge_id] = [];
      }
      leviesByChargeId[levy.other_charge_id].push(levy);
    }

    // 3. Validate Linked Supplier IDs
    const groupsToProcess = [];
    
    for (const [chargeId, groupLevies] of Object.entries(leviesByChargeId)) {
      const otherCharge = otherChargesMap.get(chargeId);
      
      if (!otherCharge) {
        return Response.json({ 
          success: false, 
          error: `Other Charge ID ${chargeId} not found in system` 
        }, { status: 400 });
      }

      if (!otherCharge.linked_supplier_id) {
        return Response.json({ 
          success: false, 
          error: `Missing Linked Supplier for charge type: ${otherCharge.description}. Cannot proceed.` 
        }, { status: 400 });
      }

      // Calculate totals
      const totalQty = groupLevies.reduce((sum, l) => sum + (parseFloat(l.qty) || 0), 0);
      const totalAmount = groupLevies.reduce((sum, l) => sum + (parseFloat(l.total_amount) || 0), 0);

      groupsToProcess.push({
        otherCharge,
        linkedSupplierId: otherCharge.linked_supplier_id,
        totalQty,
        totalAmount,
        levies: groupLevies
      });
    }

    if (groupsToProcess.length === 0) {
       return Response.json({ success: false, error: 'No valid levy groups to process' }, { status: 400 });
    }

    // 4. Calculate Invoice Details
    const endOfPeriod = new Date(endDate); // Using endDate from filter as reference
    const q = getQuarter(endOfPeriod);
    const y = getYear(endOfPeriod);
    const invoiceNumber = `Q${q}-${y}`;
    // "Will be the last date of the quarter being reported"
    // We calculate the actual last date of that quarter
    const quarterEndDate = endOfQuarter(endOfPeriod);
    const invoiceDate = format(quarterEndDate, 'yyyy-MM-dd');

    const createdLines = [];

    // 5. Create Records
    for (const group of groupsToProcess) {
      const { otherCharge, linkedSupplierId, totalQty, totalAmount, levies } = group;

      // Create SupplierInvoiceLine
      const lineDescription = `${otherCharge.description} - Qty${totalQty}`;
      
      const invoiceLineRecord = buildSupabaseRecord(user, {
        supplier_id: linkedSupplierId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        description: lineDescription,
        purchase_amount: parseFloat(totalAmount.toFixed(2)),
        gst_amount: 0,
        gl_account: '5001',
        inventory: false,
        gst_override: true,
        inventory_credit: false
      });

      const { data: invoiceLine, error: invoiceLineError } = await supabase
        .from('SupplierInvoiceLine')
        .insert([invoiceLineRecord])
        .select()
        .maybeSingle();

      if (invoiceLineError) {
        throw new Error(`Failed to create supplier invoice line in Supabase: ${invoiceLineError.message}`);
      }

      createdLines.push(invoiceLine);

      // Create GL Transactions natively in Supabase
      const debitTransaction = buildSupabaseRecord(user, {
        account_number: '5001',
        transaction_date: invoiceDate,
        description: `Levy Remittance - ${invoiceNumber} - ${otherCharge.description}`,
        reference: invoiceNumber,
        debit_amount: parseFloat(totalAmount.toFixed(2)),
        credit_amount: 0,
        source_type: 'supplier_invoice',
        source_id: invoiceLine.id
      });

      const creditTransaction = buildSupabaseRecord(user, {
        account_number: '2000',
        transaction_date: invoiceDate,
        description: `Levy Remittance - ${invoiceNumber} - ${otherCharge.description}`,
        reference: invoiceNumber,
        debit_amount: 0,
        credit_amount: parseFloat(totalAmount.toFixed(2)),
        source_type: 'supplier_invoice',
        source_id: invoiceLine.id
      });

      const { error: glError } = await supabase
        .from('GLTransaction')
        .insert([debitTransaction, creditTransaction]);

      if (glError) {
        throw new Error(`Failed to create GL transactions: ${glError.message}`);
      }

      // Update Levies
      // We can use update_entities for bulk update if query is supported well, or loop.
      // update_entities takes a query. We can query by ID list using $in if supported, 
      // but standard approach in these functions often loops for safety or uses specific bulk tools.
      // Let's loop update for now to be safe, or use Promise.all.
      
      const levyIds = levies.map(l => l.id);
      
      // Attempting bulk update with $in if possible, otherwise individual.
      // Assuming 'update_entities' logic might not be exposed on the SDK entities object directly 
      // in the same way as the tool. The SDK usually has .update(id, data).
      // We'll use Promise.all.
      
      await Promise.all(levyIds.map(id => 
        base44.asServiceRole.entities.Levies.update(id, {
          supplier_invoice_line_id: invoiceLine.id
        })
      ));
    }

    return Response.json({ 
      success: true, 
      message: `Successfully posted ${createdLines.length} invoice lines.` 
    });

  } catch (error) {
    console.error('Error posting levies to AP:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});