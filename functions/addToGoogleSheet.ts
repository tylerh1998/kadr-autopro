import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

const SPREADSHEET_ID = '16yiIXEpQg6r_RsLHg8q5hMOw9TLma6R4l163HVqd3qI';
const SHEET_NAME = 'SCU';

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Get payload
    const { supplierName, amount, dueDate } = await req.json();

    if (!supplierName || !amount || !dueDate) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get OAuth Token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlesheets");
    
    if (!accessToken) {
         return new Response(JSON.stringify({ error: 'Google Sheets not authorized' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Append to Sheet
    // Columns: A (skip), B (Supplier), C (Amount), D (Due Date)
    // We send [null, supplierName, amount, dueDate] to skip column A
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:D:append?valueInputOption=USER_ENTERED`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [
          [null, supplierName, amount, dueDate]
        ]
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Sheets API Error:', errorText);
        return new Response(JSON.stringify({ error: `Google Sheets API Error: ${response.statusText}`, details: errorText }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});