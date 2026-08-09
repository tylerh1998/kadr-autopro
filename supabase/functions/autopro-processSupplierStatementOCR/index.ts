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
CRITICAL INSTRUCTION: A statement typically has (at minimum) two amount columns/categories of rows: a PURCHASES/CHARGES column (invoices owed to the supplier) and a PAYMENTS & CREDITS column (amounts that reduce the balance). Handle them as follows:
  - Every row in the PURCHASES/CHARGES column is an invoice. Extract it with a POSITIVE "amount".
  - Rows in the PAYMENTS & CREDITS column are NOT all the same, and must be split into two cases:
    1. CREDIT MEMOS / CREDIT NOTES: these are the supplier's own negative invoice, usually issued for a return, price correction, warranty credit, or other billing adjustment. They almost always have their own distinct document/reference number (commonly prefixed "CM", "CR", "CN", or similar - e.g. "CM162307"). These MUST be extracted exactly like an invoice, using that document number as "invoice_number", but with a NEGATIVE "amount". Do not skip these - they are real, matchable documents.
    2. ACTUAL PAYMENTS: the customer's payment being received (check, EFT, wire transfer, cash, credit card, "PAYMENT", "AUTO PAY", etc.), which typically has no distinct document/credit-memo number of its own (or references a check/transaction number that is not an invoice-style document). These are NOT invoices and MUST be excluded entirely - do not extract them.
  - If you cannot confidently tell whether a Payments & Credits row is a credit memo or a plain payment, prefer extracting it (as a negative amount) over silently dropping it - a false positive here is far less costly than silently losing a real credit memo.
CRITICAL INSTRUCTION: If a "balance forward", "opening balance", "closing balance", "total due", account-status summary (e.g. "current", "over 30/60/90/120"), or similar summary row/box exists, do NOT extract it as an invoice - but DO still capture it for the statement-level summary fields below.
CRITICAL INSTRUCTION: There may be handwritten (pen) edits on the statement. YOU MUST PRIORITIZE HANDWRITTEN EDITS over printed text that has been crossed out.
CRITICAL INSTRUCTION: Invoice Number Normalization: Strip all non-alphanumeric characters (such as dashes, asterisks, spaces, slashes) from the extracted invoice/document number. The final "invoice_number" should ONLY contain letters and numbers (e.g., "INV-123*4" becomes "INV1234", "CM-162307" becomes "CM162307").
CRITICAL INSTRUCTION: The "amount" field must be the actual invoice/credit-memo total (the full amount of that document as originally billed/credited), NOT a remaining/outstanding running-balance column if the statement separately shows both. If only one amount column exists per row, use it, applying the positive/negative sign rules above.
CRITICAL INSTRUCTION: Also extract two statement-level summary fields, separate from the invoice list: (1) the date range the statement covers - printed as something like "Statement Period", "For the Period", "Billing Period", "Statement Date", or a "From ... To ..." range - as period_start/period_end in YYYY-MM-DD format (if only a single statement date is printed rather than a range, use it for both fields); (2) the statement's own printed total/balance-due figure - labeled something like "Total Due", "Balance Due", "New Balance", "Amount Due", or "Current Balance" - as total_amount_due, a positive number. These come directly from the statement's own printed summary, not a sum you calculate. If a field cannot be confidently found, return empty string ("") for the date fields or 0 for total_amount_due - do not guess.
Format the output EXACTLY as a JSON object with no markdown wrappers or additional text, matching this structure:
{
  "invoices": [
    {
      "invoice_number": "The invoice or credit memo document number, normalized per the instruction above. If you cannot find it, return empty string.",
      "invoice_date": "The invoice/credit memo date in YYYY-MM-DD format. If you cannot find it, return empty string.",
      "amount": The document total amount as a number - positive for a purchase/invoice, negative for a credit memo. If not found, return 0
    }
  ],
  "period_start": "Start of the statement's covered date range, in YYYY-MM-DD format. If you cannot find it, return empty string.",
  "period_end": "End of the statement's covered date range, in YYYY-MM-DD format. If you cannot find it, return empty string.",
  "total_amount_due": The statement's own printed total/balance-due figure as a positive number. If not found, return 0
}
Include every distinct invoice and credit-memo row found on the statement (across all pages, if multiple) - only exclude genuine payment-received rows and summary/balance rows, per the instructions above.`;

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
