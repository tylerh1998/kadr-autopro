import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { storagePath, mappings } = await req.json();

        if (!storagePath || !mappings || !Array.isArray(mappings)) {
            return new Response(
                JSON.stringify({ error: 'Missing storagePath or mappings array' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        // Download original PDF from kadr-digital_invoice_uploads
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
        const originalPdf = await PDFDocument.load(arrayBuffer);
        const maxPages = originalPdf.getPageCount();

        const resultMapping = {};

        // Process each mapping
        for (const mapping of mappings) {
            const { supplier_id, invoice_number, page_numbers } = mapping;
            if (!supplier_id || !invoice_number || !page_numbers || !Array.isArray(page_numbers)) {
                continue;
            }

            // Create a new PDF for this invoice
            const newPdf = await PDFDocument.create();

            // Copy the requested pages (1-indexed to 0-indexed)
            const pagesToCopy = page_numbers
                .map(p => p - 1)
                .filter(p => p >= 0 && p < maxPages);
                
            if (pagesToCopy.length === 0) continue;

            const copiedPages = await newPdf.copyPages(originalPdf, pagesToCopy);
            copiedPages.forEach(p => newPdf.addPage(p));

            // Generate UUID and save to split directory
            const fileUuid = crypto.randomUUID();
            const pdfBytes = await newPdf.save();

            const { error: uploadError } = await supabase.storage
                .from('kadr-digital_invoice_uploads')
                .upload(`split/${fileUuid}.pdf`, pdfBytes, {
                    contentType: 'application/pdf',
                    upsert: true
                });

            if (!uploadError) {
                resultMapping[`${supplier_id}-${invoice_number}`] = fileUuid;
            } else {
                console.error("Upload error for", fileUuid, uploadError);
            }
        }

        return new Response(
            JSON.stringify({ success: true, mapping: resultMapping }),
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
