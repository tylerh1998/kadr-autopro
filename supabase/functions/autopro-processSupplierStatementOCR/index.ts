import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        let { pdfData, storagePath, mimeType = 'application/pdf' } = await req.json();

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
                    JSON.stringify({ error: 'Failed to download statement from storage', details: fileError }),
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

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `You are a highly accurate accounts-payable statement parser.
Analyze the provided document, which is a SUPPLIER STATEMENT (an account activity ledger listing outstanding invoices for a business), not an itemized parts invoice. Do NOT attempt to extract line-item parts/products - statements do not list them.
CRITICAL INSTRUCTION: A statement typically lists multiple types of rows: invoices/charges (what we want), and payments/credits/adjustments (what we must EXCLUDE). Only extract rows that represent an actual invoice/charge owed to the supplier. Skip any row that represents a payment, credit, adjustment, or a running/opening/closing balance total - these are NOT invoices.
CRITICAL INSTRUCTION: If a "balance forward", "opening balance", "closing balance", "total due", or similar summary row exists, do NOT extract it as an invoice.
CRITICAL INSTRUCTION: There may be handwritten (pen) edits on the statement. YOU MUST PRIORITIZE HANDWRITTEN EDITS over printed text that has been crossed out.
CRITICAL INSTRUCTION: Invoice Number Normalization: Strip all non-alphanumeric characters (such as dashes, asterisks, spaces, slashes) from the extracted invoice number. The final "invoice_number" should ONLY contain letters and numbers (e.g., "INV-123*4" becomes "INV1234").
CRITICAL INSTRUCTION: The "amount" field must be the actual invoice total (the full charge amount for that invoice as originally billed), NOT a remaining/outstanding balance column if the statement separately shows both. If only one amount column exists, use it.
Format the output EXACTLY as a JSON object with no markdown wrappers or additional text, matching this structure:
{
  "invoices": [
    {
      "invoice_number": "The invoice number, normalized per the instruction above. If you cannot find it, return empty string.",
      "invoice_date": "The invoice date in YYYY-MM-DD format. If you cannot find it, return empty string.",
      "amount": The invoice total amount as a number. If not found, return 0
    }
  ]
}
Include every distinct invoice/charge row found on the statement (across all pages, if multiple).`;

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
