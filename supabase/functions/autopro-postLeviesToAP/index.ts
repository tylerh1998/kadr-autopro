import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { format, endOfQuarter, getQuarter, getYear } from "npm:date-fns@2.30.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabaseRecordId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

async function checkFiscalPeriodStatus(supabase: any, dateString: string) {
  try {
    if (!dateString) {
      return { isValid: false, message: "No date provided for fiscal period check." };
    }

    const { data: fiscalPeriods, error } = await supabase.from('FiscalPeriod').select('*');
    if (error) {
      console.error('Error checking fiscal period status:', error);
      return { isValid: false, message: "Error checking fiscal period. Please try again." };
    }

    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return { isValid: false, message: "No fiscal periods have been configured. Please set up fiscal periods in the system." };
    }

    const datePart = dateString.split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return { isValid: false, message: "Invalid date format provided." };
    }

    const checkDate = new Date(datePart + 'T00:00:00Z');
    if (isNaN(checkDate.getTime())) {
      return { isValid: false, message: "Invalid date format provided." };
    }

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
    return { isValid: false, message: "Error checking fiscal period. Please try again." };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase configuration is missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const auditUser = user.user_metadata?.full_name || user.email || user.id;

    function buildSupabaseRecord(data: any) {
      const now = new Date().toISOString();
      return {
        id: createSupabaseRecordId(),
        created_date: now,
        updated_date: now,
        created_by: auditUser,
        created_by_id: user.id,
        ...data
      };
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return res({ success: false, error: 'Start date and end date are required' });
    }

    // 1. Fetch Levies in range
    const { data: levies, error: leviesError } = await supabase
      .from('Levies')
      .select('*')
      .gte('date_applied', new Date(startDate).toISOString())
      .lte('date_applied', new Date(endDate + 'T23:59:59.999Z').toISOString());

    if (leviesError) throw new Error(leviesError.message);

    if (!levies || levies.length === 0) {
      return res({ success: false, error: 'No levies found for this period' });
    }

    // 2. Fetch OtherChargeList to group and validate
    const { data: otherCharges, error: otherChargesError } = await supabase
      .from('OtherChargeList')
      .select('*');

    if (otherChargesError) throw new Error(otherChargesError.message);

    const otherChargesMap = new Map((otherCharges || []).map((oc: any) => [oc.id, oc]));

    // Group levies by other_charge_id
    const leviesByChargeId: Record<string, any[]> = {};

    for (const levy of levies) {
      if (!levy.other_charge_id) continue;

      if (!leviesByChargeId[levy.other_charge_id]) {
        leviesByChargeId[levy.other_charge_id] = [];
      }
      leviesByChargeId[levy.other_charge_id].push(levy);
    }

    // 3. Validate Linked Supplier IDs
    const groupsToProcess: any[] = [];

    for (const [chargeId, groupLevies] of Object.entries(leviesByChargeId)) {
      const otherCharge: any = otherChargesMap.get(chargeId);

      if (!otherCharge) {
        return res({ success: false, error: `Other Charge ID ${chargeId} not found in system` });
      }

      if (!otherCharge.linked_supplier_id) {
        return res({ success: false, error: `Missing Linked Supplier for charge type: ${otherCharge.description}. Cannot proceed.` });
      }

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
      return res({ success: false, error: 'No valid levy groups to process' });
    }

    // 4. Calculate Invoice Details
    const endOfPeriod = new Date(endDate);
    const q = getQuarter(endOfPeriod);
    const y = getYear(endOfPeriod);
    const invoiceNumber = `Q${q}-${y}`;
    const quarterEndDate = endOfQuarter(endOfPeriod);
    const invoiceDate = format(quarterEndDate, 'yyyy-MM-dd');

    // 4b. Fiscal period guard before any writes
    const fiscalCheck = await checkFiscalPeriodStatus(supabase, invoiceDate);
    if (!fiscalCheck.isValid) {
      return res({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message });
    }

    const createdLines: any[] = [];

    // 5. Create Records
    for (const group of groupsToProcess) {
      const { otherCharge, linkedSupplierId, totalQty, totalAmount, levies: groupLevies } = group;

      const lineDescription = `${otherCharge.description} - Qty${totalQty}`;

      const invoiceLineRecord = buildSupabaseRecord({
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
        throw new Error(`Failed to create supplier invoice line: ${invoiceLineError.message}`);
      }

      createdLines.push(invoiceLine);

      // Create balanced GL Transactions (debit 5001 / credit 2000)
      const debitTransaction = buildSupabaseRecord({
        account_number: '5001',
        transaction_date: invoiceDate,
        description: `Levy Remittance - ${invoiceNumber} - ${otherCharge.description}`,
        reference: invoiceNumber,
        debit_amount: parseFloat(totalAmount.toFixed(2)),
        credit_amount: 0,
        source_type: 'supplier_invoice',
        source_id: invoiceLine.id
      });

      const creditTransaction = buildSupabaseRecord({
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

      // Update Levies (batch update, replacing the legacy's per-row Promise.all loop)
      const levyIds = groupLevies.map((l: any) => l.id);

      const { error: updateError } = await supabase
        .from('Levies')
        .update({ supplier_invoice_line_id: invoiceLine.id })
        .in('id', levyIds);

      if (updateError) {
        throw new Error(`Failed to update levies with invoice line id: ${updateError.message}`);
      }
    }

    return res({
      success: true,
      message: `Successfully posted ${createdLines.length} invoice lines.`
    });

  } catch (error: any) {
    console.error('Error posting levies to AP:', error);
    return res({ success: false, error: error.message });
  }
});
