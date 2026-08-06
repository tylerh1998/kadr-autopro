import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const EXTRACTION_PROMPT = `You are an automotive repair shop invoice/work-order parser.
Analyze the provided document and extract ALL rows from the line-item table, including parts, labor, AND descriptive comment lines (lines starting with - or containing notes but no price). For comment lines, quantity and price can be 0 or null.
Format the output EXACTLY as a JSON object with no markdown wrappers or additional text, matching this structure:
{
  "customer_info": { "name": "string (required)", "phone": "string", "email": "string" },
  "vehicle_info": { "vin": "string (required)", "year": number, "make": "string (required)", "model": "string (required)", "license_plate": "string", "odometer": number },
  "invoice_details": { "invoice_number": "string", "invoice_date": "YYYY-MM-DD", "description": "string", "po_number": "string" },
  "line_items": [
    {
      "part_number": "string",
      "description": "string (required)",
      "quantity": number,
      "unit_price": number,
      "total_price": number,
      "is_labor": boolean,
      "is_taxable": boolean,
      "is_note": boolean
    }
  ],
  "totals": { "subtotal": number, "tax_amount": number, "total_amount": number }
}
Return only fields you can find; use empty string / 0 / false where a value cannot be determined. line_items and totals are required.`;

async function handleExtract(req: Request, supabaseAdmin: any) {
  const { storagePath, mimeType = 'application/pdf' } = await req.json();
  if (!storagePath) {
    return jsonResponse({ error: 'storagePath is required' });
  }

  const { data: fileData, error: fileError } = await supabaseAdmin.storage
    .from('kadr-digital_invoice_uploads')
    .download(storagePath);
  if (fileError || !fileData) {
    return jsonResponse({ error: 'Failed to download file from storage', details: fileError?.message });
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const pdfData = encodeBase64(arrayBuffer);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inline_data: { mime_type: mimeType, data: pdfData } }
      ]
    }],
    generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
  };

  const geminiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error('Gemini API Error:', errorText);
    return jsonResponse({ error: 'Failed to process document with Gemini API', details: errorText });
  }

  const geminiData = await geminiResponse.json();
  let extractedJsonStr = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!extractedJsonStr) {
    return jsonResponse({ error: 'Failed to extract text from Gemini response' });
  }
  extractedJsonStr = extractedJsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(extractedJsonStr);
  } catch (e) {
    console.error('Failed to parse JSON from Gemini:', extractedJsonStr);
    return jsonResponse({ error: 'Gemini returned invalid JSON', raw: extractedJsonStr });
  }

  return jsonResponse({ success: true, data: parsed });
}

async function handleCreate(req: Request, supabaseAdmin: any, userEmail: string | null, userId: string) {
  const payload = await req.json();
  const { customer_id, vehicle_id, invoice_details, line_items, totals, new_parts, odometer } = payload;

  if (!customer_id || !vehicle_id) {
    return jsonResponse({ error: 'Customer or Vehicle ID is missing.' });
  }

  // --- Step 1: Handle New Inventory Items ---
  const createdPartIds: Record<string, string> = {};

  if (new_parts && new_parts.length > 0) {
    for (const part of new_parts) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('InventoryItem')
        .select('id')
        .eq('part_number', part.part_number);
      if (existingError) {
        return jsonResponse({ error: 'Failed to check existing inventory item', details: existingError.message });
      }

      let itemId: string;
      if (!existing || existing.length === 0) {
        const coreCost = parseFloat(part.core_cost) || 0;
        const listPrice = parseFloat(part.selling_price) || 0;
        const nowIso = new Date().toISOString();
        itemId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

        const { error: insertError } = await supabaseAdmin.from('InventoryItem').insert({
          id: itemId,
          part_number: part.part_number,
          description: part.description,
          cost: parseFloat(part.cost) || 0,
          selling_price: listPrice - coreCost,
          quantity_on_hand: parseFloat(part.quantity_on_hand) || 0,
          unit: 'ea',
          category: 'other',
          stocked_item: false,
          core: coreCost > 0,
          core_cost: coreCost,
          created_date: nowIso,
          created_by: userEmail,
          created_by_id: userId,
        });
        if (insertError) {
          return jsonResponse({ error: 'Failed to create new inventory item', details: insertError.message });
        }
      } else {
        itemId = existing[0].id;
      }
      createdPartIds[part.part_number] = itemId;
    }
  }

  // --- Step 2: Process Line Items ---
  const processedLineItems = (line_items || []).map((item: any, index: number) => {
    const isLabor = item.is_labor;
    const isOtherCharge = item.is_other_charge;
    const isPart = !isLabor && !isOtherCharge;

    let inventoryItemId = null;
    if (isPart) {
      if (item.inventory_match) {
        inventoryItemId = item.inventory_match.id;
      } else if (item.part_number && createdPartIds[item.part_number]) {
        inventoryItemId = createdPartIds[item.part_number];
      }
    }

    const coreCost = parseFloat(item.core_cost || item.inventory_match?.core_cost || 0);
    const adjustedPartsEa = isPart ? (item.unit_price - coreCost) : 0;

    return {
      id: Date.now() + index,
      description: item.description,
      part_number: item.part_number || '',
      qty: isLabor ? 0 : item.quantity,
      parts_ea: adjustedPartsEa,
      cost_ea: isPart ? (item.inventory_match?.cost || item.cost || 0) : 0,
      tot_parts: isPart ? item.total_price : 0,
      labour: isLabor ? item.total_price : 0,
      is_other_charge: isOtherCharge || false,
      oc_total: isOtherCharge ? item.total_price : 0,
      gl_account: item.gl_account || '',
      tx: item.is_taxable ? 'Y' : 'N',
      total: item.total_price,
      hrs: isLabor ? item.quantity : 0,
      inventory_item_id: inventoryItemId,
      inventory_processed: isPart ? true : false,
      complete: false,
      bold: false,
      is_legacy_import: true,
      Core_num: item.core_num || 0,
      core_cost: coreCost,
      core_osamt: item.core_osamt || 0,
      qty_on_order: item.qty_on_order || 0
    };
  });

  // --- Step 3: Create the Work Order ---
  const { data: settingsList, error: settingsError } = await supabaseAdmin.from('SystemSettings').select('*');
  if (settingsError) {
    return jsonResponse({ error: 'Failed to fetch system settings', details: settingsError.message });
  }
  const settings = settingsList?.[0];
  const nextRo = settings?.next_ro_number || 1001;

  const nowIso = new Date().toISOString();
  const workOrderId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);

  const newWorkOrderData = {
    id: workOrderId,
    ro_number: `RO${nextRo}`,
    wo_number: `WO${nextRo}`,
    customer_id,
    vehicle_id,
    status: "Open",
    stage: "work_order",
    wo_date: invoice_details?.invoice_date || nowIso.split('T')[0],
    description: '',
    po_number: invoice_details?.po_number || '',
    odometer: typeof odometer !== 'undefined' ? odometer : (invoice_details?.odometer || 0),
    total_amount: totals?.total_amount,
    tax_amount: totals?.tax_amount,
    parts_total: totals?.subtotal,
    labor_total: 0,
    shop_supply_total: 0,
    line_items: JSON.stringify(processedLineItems),
    internal_notes: `Lankar WO# ${invoice_details?.invoice_number || 'N/A'}`,
    created_date: nowIso,
    created_by: userEmail,
    created_by_id: userId,
  };

  const { data: createdWorkOrder, error: createError } = await supabaseAdmin
    .from('WorkOrder')
    .insert(newWorkOrderData)
    .select('*')
    .single();

  if (createError) {
    return jsonResponse({ error: 'Failed to create work order', details: createError.message });
  }

  if (settings) {
    const { error: updateError } = await supabaseAdmin
      .from('SystemSettings')
      .update({ next_ro_number: nextRo + 1, updated_date: nowIso })
      .eq('id', settings.id);
    if (updateError) {
      console.error('Failed to update next_ro_number:', updateError);
    }
  }

  return jsonResponse({ success: true, workOrder: createdWorkOrder });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header" });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse({ error: "Unauthorized user session" });
    }
    const userEmail = authData.user.email || null;

    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');

    if (mode === 'extract') {
      return await handleExtract(req, supabaseAdmin);
    }
    return await handleCreate(req, supabaseAdmin, userEmail, authData.user.id);
  } catch (error: any) {
    console.error('Error in autopro-processLegacyWorkOrder:', error);
    return jsonResponse({ error: error.message || 'Internal server error' });
  }
});
