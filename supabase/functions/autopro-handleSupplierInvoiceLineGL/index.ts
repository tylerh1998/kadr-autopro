import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const payload = await req.json();
    const { supplierInvoiceLine, supplierInvoiceLines, action, oldValues, user } = payload;
    
    // We expect the frontend/caller to pass user object since service_role bypasses RLS
    let auditUser = 'System';
    let auditUserId = null;
    
    // Attempt to extract user from authorization header if not provided in payload
    if (!user) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey, {
            auth: { persistSession: false }
          });
          const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
          if (authUser) {
            auditUser = authUser.email || 'Unknown User';
            auditUserId = authUser.id;
          } else if (authError) {
            console.error('Auth error resolving user in GL:', authError);
          }
        } catch (err) {
          console.error('Failed to resolve user in GL handler:', err);
        }
      }
    } else {
      auditUser = user.full_name || user.email || user.id || 'System';
      auditUserId = user.id;
    }

    console.log('=== autopro-handleSupplierInvoiceLineGL Debug ===');
    console.log('Action:', action);

    if ((!supplierInvoiceLine && !supplierInvoiceLines) || !action) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: supplierInvoiceLine(s) and action' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let linesToProcess = [];
    if (supplierInvoiceLines && Array.isArray(supplierInvoiceLines)) {
      linesToProcess = supplierInvoiceLines;
    } else if (supplierInvoiceLine) {
      linesToProcess = [supplierInvoiceLine];
    }

    let allLinesForData = [...linesToProcess];
    if (action === 'update') {
      if (Array.isArray(oldValues)) {
        allLinesForData.push(...oldValues);
      } else if (oldValues) {
        allLinesForData.push(oldValues);
      }
    }

    const uniqueSupplierIds = [...new Set(allLinesForData.map(l => l.supplier_id).filter(Boolean))];
    const uniqueGLAccounts = [...new Set(allLinesForData.map(l => l.gl_account).filter(Boolean))];

    const supplierMap: Record<string, string> = {};
    const glAccountMap: Record<string, string> = {};

    if (uniqueSupplierIds.length > 0) {
      const { data: suppliers } = await supabaseAdmin
        .from('Supplier')
        .select('id, name')
        .in('id', uniqueSupplierIds);
      (suppliers || []).forEach(s => {
        if (s && s.id) supplierMap[s.id] = s.name;
      });
    }

    if (uniqueGLAccounts.length > 0) {
      const { data: allAccounts } = await supabaseAdmin
        .from('ChartOfAccount')
        .select('account_number, account_name')
        .in('account_number', uniqueGLAccounts);
        
      (allAccounts || []).forEach(acc => {
        glAccountMap[acc.account_number] = `${acc.account_number} - ${acc.account_name}`;
      });
    }

    const glTransactions: any[] = [];

    const createGLEntries = (line: any, isReversal = false) => {
      const multiplier = isReversal ? -1 : 1;
      const reversalPrefix = isReversal ? 'REVERSAL - ' : '';
      
      const purchaseAmount = parseFloat(line.purchase_amount || 0);
      const gstAmount = parseFloat(line.gst_amount || 0);
      const lineTotal = purchaseAmount + gstAmount;

      const supplierName = supplierMap[line.supplier_id] || 'Unknown Supplier';
      const glAccountName = glAccountMap[line.gl_account] || line.gl_account || 'Unknown';

      const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - ${supplierName}`;

      if (purchaseAmount !== 0) {
        glTransactions.push({
          account_number: String(line.gl_account),
          transaction_date: line.invoice_date,
          description: `${reversalPrefix}${baseDescription} - ${glAccountName}`,
          reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
          debit_amount: multiplier * purchaseAmount > 0 ? multiplier * purchaseAmount : 0,
          credit_amount: multiplier * purchaseAmount < 0 ? Math.abs(multiplier * purchaseAmount) : 0,
          source_type: 'supplier_invoice',
          source_id: line.id || ''
        });
      }

      if (gstAmount !== 0) {
        glTransactions.push({
          account_number: '2003',
          transaction_date: line.invoice_date,
          description: `${reversalPrefix}${baseDescription} - GST Paid`,
          reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
          debit_amount: multiplier * gstAmount > 0 ? multiplier * gstAmount : 0,
          credit_amount: multiplier * gstAmount < 0 ? Math.abs(multiplier * gstAmount) : 0,
          source_type: 'supplier_invoice',
          source_id: line.id || ''
        });
      }

      if (lineTotal !== 0) {
        glTransactions.push({
          account_number: '2000',
          transaction_date: line.invoice_date,
          description: `${reversalPrefix}${baseDescription} - Accounts Payable`,
          reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
          debit_amount: multiplier * lineTotal < 0 ? Math.abs(multiplier * lineTotal) : 0,
          credit_amount: multiplier * lineTotal > 0 ? multiplier * lineTotal : 0,
          source_type: 'supplier_invoice',
          source_id: line.id || ''
        });
      }
    };

    for (let i = 0; i < linesToProcess.length; i++) {
      const line = linesToProcess[i];
      if (action === 'create') {
        createGLEntries(line, false);
      } else if (action === 'update') {
        const oldVal = Array.isArray(oldValues) ? oldValues[i] : oldValues;
        if (!oldVal) {
          return new Response(JSON.stringify({ error: 'Old values required for update action' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        createGLEntries(oldVal, true);
        createGLEntries(line, false);
      } else if (action === 'delete' || action === 'reverse') {
        createGLEntries(line, true);
      }
    }

    console.log(`Creating ${glTransactions.length} GL Transactions in bulk`);
    let createdCount = 0;
    
    if (glTransactions.length > 0) {
      const sanitizedTxs = glTransactions.map(glTx => ({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24), // Matches the 24-character hex ID pattern of existing records
        ...glTx,
        debit_amount: Math.round(parseFloat(glTx.debit_amount || 0) * 100) / 100,
        credit_amount: Math.round(parseFloat(glTx.credit_amount || 0) * 100) / 100,
        created_by: auditUser,
        created_by_id: auditUserId,
        updated_by: auditUser,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      }));

      const { data, error } = await supabaseAdmin
        .from('GLTransaction')
        .insert(sanitizedTxs)
        .select('id');

      if (error) {
        console.error('Failed to create GL transactions:', error);
        return new Response(JSON.stringify({ 
          error: error.message,
          success: false
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      createdCount = data?.length || 0;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully posted ${createdCount} GL transactions`,
      transactionsCreated: createdCount
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error in autopro-handleSupplierInvoiceLineGL:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      success: false
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
