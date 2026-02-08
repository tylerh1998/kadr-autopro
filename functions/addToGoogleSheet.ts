import { createClientFromRequest } from 'npm:@base44/sdk@0.8.11';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { supplierName, amount, dueDate } = await req.json();

        if (!supplierName || !amount || !dueDate) {
             return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get the Google Sheets access token
        const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlesheets");
        
        // Spreadsheet details
        // CRITICAL: This ID needs to be set by the user if not already known
        const SPREADSHEET_ID = "1X-X..."; // TODO: Replace with actual ID
        const SHEET_NAME = "SCU";

        // Columns: B (Supplier), C (Amount), D (Due Date)
        // We pad with an empty string for Column A
        const values = [
            ["", supplierName, amount, dueDate]
        ];

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:D:append?valueInputOption=USER_ENTERED`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                values: values
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Google Sheets API Error:", errorText);
            throw new Error(`Google Sheets API error: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Error adding to sheet:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});