import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase configuration is missing" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header" });
    }
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseAuthClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse({ error: "Unauthorized user session" });
    }
    const user = authData.user;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const auditUser = user.user_metadata?.full_name || user.email || "Unknown User";
    const getAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user.id,
      updated_by: auditUser,
    });

    let bodyData: any;
    try {
      bodyData = await req.json();
    } catch (jsonError: any) {
      return jsonResponse({ error: "Invalid JSON payload", details: jsonError.message });
    }
    const payload = bodyData.body || bodyData;
    const { workOrder, lineItems, payments, systemSettings } = payload;

    console.log("--- autopro-handleCreditInvoiceGL Invoked ---");
    console.log("Credit Invoice RO:", workOrder?.ro_number);
    console.log("Line Items Count:", lineItems?.length);
    console.log("Payments Count:", payments?.length);

    if (!workOrder || !lineItems || !payments || !systemSettings) {
      return jsonResponse({
        error: "Missing required parameters: workOrder, lineItems, payments, systemSettings",
      });
    }

    const GL_ACCOUNTS = {
      PARTS_SALES: "4002",
      LABOR_SALES: "4001",
      SHOP_SUPPLIES_REVENUE: systemSettings.shop_supplies_gl_account || "4004",
      GST_RECEIVED: "2002",
      INVENTORY: "1200",
      COGS: "5000",
      PAYMENTS_IN_ADVANCE: "2100",
      ACCOUNTS_RECEIVABLE: "1100",
      CASH_DRAWER: "1010",
    };

    const generatedGLTransactions: Record<string, unknown>[] = [];
    const invoiceDate = workOrder.invoice_date || new Date().toISOString().split("T")[0];
    const reference = workOrder.crinv_number || workOrder.ro_number;

    let partsCreditTotal = 0;
    let laborCreditTotal = 0;
    let partsInventoryCostReversed = 0;
    const finalShopSuppliesTotal = parseFloat(workOrder.shop_supply_total || 0);

    for (const line of lineItems) {
      if (line.is_other_charge) continue;

      const lineTotParts = parseFloat(line.tot_parts || 0);
      const lineLabor = parseFloat(line.labour || 0);

      partsCreditTotal += lineTotParts;
      laborCreditTotal += lineLabor;

      if (line.inventory_item_id && line.qty) {
        const qty = parseFloat(line.qty || 0);

        if (line.is_core_virtual) {
          const coreCost = parseFloat(line.cost || line.cost_ea || line.core_cost || 0);
          partsInventoryCostReversed += qty * coreCost;
        } else {
          const partCost = parseFloat(line.cost || line.cost_ea || 0);
          partsInventoryCostReversed += qty * partCost;
        }
      }
    }

    const gstTotal = parseFloat(workOrder.tax_amount || 0);

    console.log("--- Calculated Totals ---");
    console.log("Parts Credit:", partsCreditTotal);
    console.log("Labor Credit:", laborCreditTotal);
    console.log("Shop Supplies Credit:", finalShopSuppliesTotal);
    console.log("GST Credit:", gstTotal);
    console.log("Inventory Cost Reversed:", partsInventoryCostReversed);

    // Revenue reversals (debit revenue accounts)
    if (partsCreditTotal !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.PARTS_SALES,
        transaction_date: invoiceDate,
        description: `Credit Parts sales - ${reference}`,
        reference: reference,
        debit_amount: Math.abs(partsCreditTotal),
        credit_amount: 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    if (laborCreditTotal !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.LABOR_SALES,
        transaction_date: invoiceDate,
        description: `Credit Labor sales - ${reference}`,
        reference: reference,
        debit_amount: Math.abs(laborCreditTotal),
        credit_amount: 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    if (finalShopSuppliesTotal !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.SHOP_SUPPLIES_REVENUE,
        transaction_date: invoiceDate,
        description: `Credit Shop supplies - ${reference}`,
        reference: reference,
        debit_amount: Math.abs(finalShopSuppliesTotal),
        credit_amount: 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    if (gstTotal !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.GST_RECEIVED,
        transaction_date: invoiceDate,
        description: `Credit GST collected - ${reference}`,
        reference: reference,
        debit_amount: Math.abs(gstTotal),
        credit_amount: 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    // COGS and Inventory reversals
    if (partsInventoryCostReversed !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.COGS,
        transaction_date: invoiceDate,
        description: `Credit cost of parts sold - ${reference}`,
        reference: reference,
        debit_amount: 0,
        credit_amount: Math.abs(partsInventoryCostReversed),
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });

      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.INVENTORY,
        transaction_date: invoiceDate,
        description: `Credit Inventory increase - ${reference}`,
        reference: reference,
        debit_amount: Math.abs(partsInventoryCostReversed),
        credit_amount: 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    // Other charges reversals
    for (const line of lineItems) {
      if (line.is_other_charge && line.gl_account) {
        const ocTotal = parseFloat(line.oc_total || 0);
        if (ocTotal !== 0) {
          generatedGLTransactions.push({
            id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
            ...getAuditFields(),
            account_number: line.gl_account,
            transaction_date: invoiceDate,
            description: `Credit ${line.description} - ${reference}`,
            reference: reference,
            debit_amount: Math.abs(ocTotal),
            credit_amount: 0,
            source_type: "credit_invoice",
            source_id: workOrder.id,
          });
        }
      }
    }

    // Payment reversals (credit payment accounts for refunds)
    let totalAdvancePaymentsReversed = 0;
    let totalOnAccountPaymentsReversed = 0;
    let totalCashPaymentsReversed = 0;

    for (const payment of payments) {
      const amount = parseFloat(payment.amount || 0);
      if (amount === 0) continue;

      if (payment.payment_method === "advance_pmt") {
        totalAdvancePaymentsReversed += Math.abs(amount);
      } else if (payment.payment_method === "on_account") {
        totalOnAccountPaymentsReversed += Math.abs(amount);
      } else {
        totalCashPaymentsReversed += Math.abs(amount);
      }
    }

    if (totalAdvancePaymentsReversed !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.PAYMENTS_IN_ADVANCE,
        transaction_date: invoiceDate,
        description: `Credit advance payments applied - ${reference}`,
        reference: reference,
        debit_amount: 0,
        credit_amount: totalAdvancePaymentsReversed,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    if (totalOnAccountPaymentsReversed !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        transaction_date: invoiceDate,
        description: `Credit AR payment - ${reference}`,
        reference: reference,
        debit_amount: 0,
        credit_amount: totalOnAccountPaymentsReversed,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    if (totalCashPaymentsReversed !== 0) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.CASH_DRAWER,
        transaction_date: invoiceDate,
        description: `Credit Payment refunded - ${reference}`,
        reference: reference,
        debit_amount: 0,
        credit_amount: totalCashPaymentsReversed,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    const totalCreditAmount = parseFloat(workOrder.total_amount || 0);
    const totalPaymentsFromCredit = totalAdvancePaymentsReversed + totalOnAccountPaymentsReversed + totalCashPaymentsReversed;
    const remainingBalance = totalCreditAmount + totalPaymentsFromCredit;

    console.log("--- Credit Payment Summary ---");
    console.log("Total Credit Amount:", totalCreditAmount);
    console.log("Total Payments from Credit:", totalPaymentsFromCredit);
    console.log("Remaining Balance:", remainingBalance);

    if (Math.abs(remainingBalance) > 0.01) {
      generatedGLTransactions.push({
        id: crypto.randomUUID().replace(/-/g, "").substring(0, 24),
        ...getAuditFields(),
        account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        transaction_date: invoiceDate,
        description: `Credit invoice balance adjustment - ${reference}`,
        reference: reference,
        debit_amount: remainingBalance > 0 ? remainingBalance : 0,
        credit_amount: remainingBalance < 0 ? Math.abs(remainingBalance) : 0,
        source_type: "credit_invoice",
        source_id: workOrder.id,
      });
    }

    console.log(`--- Generated ${generatedGLTransactions.length} GL transactions for credit invoice ---`);

    if (generatedGLTransactions.length > 0) {
      const { error: glInsertError } = await supabase.from("GLTransaction").insert(generatedGLTransactions);
      if (glInsertError) {
        return jsonResponse({ success: false, error: glInsertError.message });
      }
    }

    // accounting_details is a genuine jsonb column on WorkOrder — return the array itself,
    // not a JSON string, so the caller can write it straight into the column.
    return jsonResponse({
      success: true,
      accounting_details: generatedGLTransactions,
      summary: {
        parts_credit: partsCreditTotal,
        labor_credit: laborCreditTotal,
        shop_supplies_credit: finalShopSuppliesTotal,
        gst_credit: gstTotal,
        inventory_increase: partsInventoryCostReversed,
        advance_payments_reversed: totalAdvancePaymentsReversed,
        on_account_payments_reversed: totalOnAccountPaymentsReversed,
        cash_payments_refunded: totalCashPaymentsReversed,
        remaining_balance_adjustment: remainingBalance,
        total_transactions: generatedGLTransactions.length,
      },
    });
  } catch (error: any) {
    console.error("--- Error in autopro-handleCreditInvoiceGL ---");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    return jsonResponse({ success: false, error: error.message || "Failed to process credit GL transactions" });
  }
});
