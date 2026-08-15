import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { supplierId } = await req.json();

    if (!supplierId) {
      return res({ success: false, error: 'supplierId is required' });
    }

    const { data: supplierDataArr, error: supplierErr } = await supabase
      .from('Supplier')
      .select('id, name')
      .eq('id', supplierId)
      .limit(1);

    const supplierData = supplierDataArr?.[0];

    if (supplierErr || !supplierData) {
      return res({ success: false, error: 'Supplier not found' });
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_supplier_reconcile_invoices', {
      p_supplier_id: supplierId
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      return res({ success: false, error: rpcError.message || 'Failed to fetch reconcile invoices' });
    }

    return res({
      success: true,
      data: {
        supplier: supplierData,
        conceptualInvoices: rpcData?.conceptualInvoices || []
      }
    });
  } catch (error: any) {
    console.error('--- Error in getSupplierReconcileInvoices ---');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    return res({
      success: false,
      error: error.message || 'Failed to fetch reconcile invoices'
    });
  }
});
