import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import pdf from 'npm:pdf-parse@1.1.1';
import { Buffer } from 'node:buffer';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Auth check
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { file_url } = await req.json();

        if (!file_url) {
            return Response.json({ error: 'file_url is required' }, { status: 400 });
        }

        console.log(`Downloading PDF from ${file_url}`);
        const response = await fetch(file_url);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('Extracting text from PDF...');
        const pdfData = await pdf(buffer);
        const textContent = pdfData.text;

        if (!textContent || textContent.trim().length === 0) {
            throw new Error("Could not extract text from PDF. It might be an image-only PDF.");
        }

        console.log(`Extracted ${textContent.length} characters. Calling LLM...`);

        const jsonSchema = {
            type: "object",
            properties: {
                customer_info: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        phone: { type: "string" },
                        email: { type: "string" }
                    },
                    required: ["name"]
                },
                vehicle_info: {
                    type: "object",
                    properties: {
                        vin: { type: "string" },
                        year: { type: "number" },
                        make: { type: "string" },
                        model: { type: "string" },
                        license_plate: { type: "string" },
                        odometer: { type: "number" }
                    },
                    required: ["vin", "make", "model"]
                },
                invoice_details: {
                    type: "object",
                    properties: {
                        invoice_number: { type: "string" },
                        invoice_date: { type: "string", format: "date" },
                        description: { type: "string" },
                        po_number: { type: "string" }
                    }
                },
                line_items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            part_number: { type: "string" },
                            description: { type: "string" },
                            quantity: { type: "number" },
                            unit_price: { type: "number" },
                            total_price: { type: "number" },
                            is_labor: { type: "boolean" },
                            is_taxable: { type: "boolean" }
                        },
                        required: ["description", "quantity", "total_price"]
                    }
                },
                totals: {
                    type: "object",
                    properties: {
                        subtotal: { type: "number" },
                        tax_amount: { type: "number" },
                        total_amount: { type: "number" }
                    }
                }
            },
            required: ["customer_info", "vehicle_info", "line_items", "totals"]
        };

        const llmResponse = await base44.integrations.Core.InvokeLLM({
            prompt: `Extract structured data from the following work order / invoice text.
            
            TEXT CONTENT:
            ${textContent}
            
            INSTRUCTIONS:
            - Extract customer name, phone, email.
            - Extract vehicle VIN, Year, Make, Model (infer from text if needed).
            - Extract line items. For each item, decide if it's labor or part.
            - If it's a part, try to find the part number.
            - Ensure totals match the sum of line items if possible, but prioritize extracted totals.
            - Return JSON matching the schema.`,
            response_json_schema: jsonSchema
        });

        return Response.json(llmResponse);

    } catch (error) {
        console.error('Error in analyzeWorkOrderPdf:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});