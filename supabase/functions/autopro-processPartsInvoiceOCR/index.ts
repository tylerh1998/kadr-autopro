import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        let { pdfData, storagePath, mimeType = 'application/pdf', supplierNames = [] } = await req.json();

        if (!pdfData && !storagePath) {
            return new Response(
                JSON.stringify({ error: 'Missing pdfData or storagePath' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        if (storagePath && !pdfData) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
            const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
            const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

            const { data: fileData, error: fileError } = await supabase.storage
                .from('kadr-digital_invoice_uploads')
                .download(storagePath);

            if (fileError || !fileData) {
                return new Response(
                    JSON.stringify({ error: 'Failed to download PDF from storage', details: fileError }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
                );
            }
            
            const arrayBuffer = await fileData.arrayBuffer();
            pdfData = encodeBase64(arrayBuffer);
        }

        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

        let supplierNamesContext = '';
        if (supplierNames && supplierNames.length > 0) {
            supplierNamesContext = `\nCRITICAL INSTRUCTION: Try to match the supplier name to one of these known suppliers if possible: ${supplierNames.join(', ')}.`;
        }

        const prompt = `You are a highly accurate invoice parser. 
Analyze the provided document (which may contain multiple distinct invoices) and extract the following information.
CRITICAL INSTRUCTION: There may be handwritten (pen) edits on the invoice, such as a crossed-out part number with a new handwritten part number next to it. YOU MUST PRIORITIZE HANDWRITTEN EDITS. If a printed part number is crossed out, extract the handwritten one instead.
CRITICAL INSTRUCTION: Completely ignore any vehicle information (Year, Make, Model, VIN, Mileage, etc.). Do not extract vehicle details as parts.
CRITICAL INSTRUCTION: Core charges (e.g., "Core Deposit", "NET CORE") are often listed as separate line items or in a separate column. DO NOT extract a core charge as its own standalone item. Instead, find the main part it applies to, and set "core": true and "core_cost" to the unit amount of the core charge for that item. If an item has no core charge, omit these fields or set them to false/0.
CRITICAL INSTRUCTION: Enviro fees (e.g., "Tire Levy", "Filter Levy", "Enviro Fee") are also often listed as separate line items or in a separate column. Like cores, DO NOT extract them as standalone items. IMPORTANT: When an environmental fee is listed as a separate line item, it always applies to the part on the line DIRECTLY BELOW it. DO NOT attach it to the part above it. Find the main part directly below the fee, and set "enviro_fee" to the unit amount of the fee for that item.
CRITICAL INSTRUCTION: Often there is a short Manufacturer (MFG) code (e.g., a 3-letter or 3-digit code like "AGL" or "MPA") listed right before the actual part number, either in a separate column or at the start of the string. DO NOT include the MFG code in the "part_number" field. Only extract the true part number itself.
CRITICAL INSTRUCTION: Part Number Normalization: Strip all non-alphanumeric characters (such as dashes, asterisks, spaces, slashes) from the extracted part number. The final "part_number" should ONLY contain letters and numbers (e.g., "A-123*4" becomes "A1234").
CRITICAL INSTRUCTION: The unit cost is sometimes labeled as "NET", "NET COST", or "UNIT". Pay close attention to these columns to correctly extract the unit cost.${supplierNamesContext}
Format the output EXACTLY as a JSON object with no markdown wrappers or additional text, matching this structure:
{
  "invoices": [
    {
      "supplier_name": "Name of the supplier or vendor. If you cannot find it, return empty string.",
      "invoice_number": "The invoice number. If you cannot find it, return empty string.",
      "invoice_date": "The invoice date in YYYY-MM-DD format. If you cannot find it, return empty string.",
      "page_numbers": [1, 2], // Array of 1-indexed integers indicating which page(s) this invoice spans
      "subtotal": The subtotal amount as a number (before taxes). If not found, return 0,
      "freight": The total freight or shipping charge as a number. If not found, return 0,
      "gst_amount": The total GST or tax amount for the invoice as a number. If not found, return 0,
      "invoice_total": The final grand total for the invoice as a number. If not found, return 0,
      "items": [
        {
          "part_number": "The part number or item code (prioritize handwritten text if printed text is crossed out)",
          "description": "The item description",
          "quantity": The quantity as a number,
          "cost": The unit cost as a number (this may be under a column labeled "NET" or "NET COST"),
          "core": true if there is a core charge, false otherwise,
          "core_cost": The unit cost of the core charge as a number, or 0 if none,
          "enviro_fee": The unit cost of the enviro fee/tax as a number, or 0 if none
        }
      ]
    }
  ]
}
Ensure the items array includes all line items found on the invoice (consolidating core and enviro fee lines into their parent part). If there are multiple distinct invoices in the PDF, include all of them in the invoices array.`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: pdfData
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error:", errorText);
            return new Response(
                JSON.stringify({ error: 'Failed to process document with Gemini API', details: errorText }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
            );
        }

        const data = await response.json();
        
        let extractedJsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedJsonStr) {
            return new Response(
                JSON.stringify({ error: 'Failed to extract text from Gemini response' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
        }

        // Clean up potential markdown formatting (e.g. ```json ... ```)
        extractedJsonStr = extractedJsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

        let parsedData;
        try {
            parsedData = JSON.parse(extractedJsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", extractedJsonStr);
            return new Response(
                JSON.stringify({ error: 'Gemini returned invalid JSON', raw: extractedJsonStr }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
        }

        return new Response(
            JSON.stringify({ success: true, data: parsedData }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        console.error("Edge Function Error:", error);
        return new Response(
            JSON.stringify({ error: 'Internal Server Error', message: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
