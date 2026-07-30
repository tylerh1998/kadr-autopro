import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
        const { pdfData, mimeType = 'application/pdf' } = await req.json();

        if (!pdfData) {
            return new Response(
                JSON.stringify({ error: 'Missing pdfData (base64 string)' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
        }

        // We use gemini-1.5-pro or flash for multi-modal tasks
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `You are a highly accurate invoice parser. 
Analyze the provided invoice document and extract the following information.
Format the output EXACTLY as a JSON object with no markdown wrappers or additional text, matching this structure:
{
  "supplier_name": "Name of the supplier or vendor. If you cannot find it, return empty string.",
  "invoice_number": "The invoice number. If you cannot find it, return empty string.",
  "invoice_date": "The invoice date in YYYY-MM-DD format. If you cannot find it, return empty string.",
  "subtotal": The subtotal amount as a number (before taxes). If not found, return 0,
  "items": [
    {
      "part_number": "The part number or item code",
      "description": "The item description",
      "quantity": The quantity as a number,
      "cost": The unit cost as a number
    }
  ]
}
Ensure the items array includes all line items found on the invoice.`;

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
