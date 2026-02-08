import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
        const SPREADSHEET_ID = "16yiIXEpQg6r_RsLHg8q5hMOw9TLma6R4l163HVqd3qI";
        const SHEET_NAME = "SCU";
        const encodedSheetName = encodeURIComponent(SHEET_NAME);

        // 1. READ existing data in Column B (Supplier) for rows 2-38 to find first empty slot
        // We read B2:B38.
        const checkRange = `${encodedSheetName}!B2:B38`;
        const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${checkRange}`;

        console.log(`Checking for empty slot in ${SHEET_NAME} rows 2-38...`);

        const getResponse = await fetch(getUrl, {
            method: "GET",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!getResponse.ok) {
            const errorText = await getResponse.text();
            throw new Error(`Failed to read sheet: ${getResponse.statusText} - ${errorText}`);
        }

        const getData = await getResponse.json();
        const existingRows = getData.values || [];

        // Find the first empty row index
        // Google Sheets API omits trailing empty rows. 
        // If rows 2-5 have data, existingRows.length will be 4. Next empty is 2 + 4 = 6.
        // If there are gaps (e.g. data in 2 and 4, but 3 is empty), existingRows will look like [["Data"], [], ["Data"]]
        // So we scan for the first row that doesn't exist or has an empty string.

        let targetRowNumber = -1;
        const START_ROW = 2;
        const MAX_ROW = 38;

        // Check slots 0 to 36 (corresponding to rows 2 to 38)
        for (let i = 0; i <= (MAX_ROW - START_ROW); i++) {
            const rowData = existingRows[i];
            // If rowData is undefined (beyond returned range) or empty array or first cell is empty string
            if (!rowData || rowData.length === 0 || rowData[0] === "" || rowData[0] === undefined) {
                targetRowNumber = START_ROW + i;
                break;
            }
        }

        if (targetRowNumber === -1 || targetRowNumber > MAX_ROW) {
             return new Response(JSON.stringify({ success: false, error: 'Table is full (Rows 2-38)' }), {
                status: 400, // Bad Request ideally, but communicating "Full"
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`Found empty slot at row: ${targetRowNumber}`);

        // 2. UPDATE the found row
        // We update B{row}:D{row}
        const values = [
            [supplierName, amount, dueDate]
        ];
        
        const updateRange = `${encodedSheetName}!B${targetRowNumber}:D${targetRowNumber}`;
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${updateRange}?valueInputOption=USER_ENTERED`;

        const updateResponse = await fetch(updateUrl, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                values: values
            })
        });

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error("Google Sheets Update Error:", errorText);
            throw new Error(`Google Sheets Update error: ${updateResponse.statusText} - ${errorText}`);
        }

        const result = await updateResponse.json();
        console.log("Success:", result);

        return new Response(JSON.stringify({ success: true, data: result, row: targetRowNumber }), {
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