import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Papa from 'npm:papaparse@5.4.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { fileUrl, bankAccountId } = payload;

        if (!fileUrl || !bankAccountId) {
            return Response.json({ error: 'Missing fileUrl or bankAccountId' }, { status: 400 });
        }

        // 1. Fetch CSV Content
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
            return Response.json({ error: 'Failed to fetch CSV file' }, { status: 400 });
        }
        const csvText = await fileResponse.text();

        // 2. Parse CSV
        const parseResult = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().replace(/"/g, ''), // Clean headers
        });

        if (parseResult.errors.length > 0) {
            console.error("CSV Parse Errors:", parseResult.errors);
        }

        const csvRows = parseResult.data;

        // 3. Fetch Unreconciled Bank Transactions
        // We fetch all unreconciled transactions for this account
        // Note: In a real large app, we might want to date-limit this, but for now we'll fetch all open ones
        // as the user might be reconciling old stuff.
        const allTransactions = await base44.entities.BankTransaction.list({
             bank_account_id: bankAccountId,
             limit: 1000 // Reasonable limit? Or need pagination?
        });
        
        // Filter in memory for safety if list param didn't work as expected or if we need specific logic
        // Ensuring we only look at unreconciled ones
        const systemTransactions = allTransactions.filter(tx => 
            tx.bank_account_id === bankAccountId && 
            (tx.reconciled === false || tx.reconciled === null || tx.reconciled === undefined)
        );

        // 4. Matching Logic
        const matches = [];
        const unmatchedCsv = [];
        const matchedSystemIds = new Set();

        const parseAmount = (str) => {
            if (!str) return 0;
            // Remove $, commas, spaces, double quotes
            const clean = str.replace(/[$,\s"]/g, '');
            const float = parseFloat(clean);
            return isNaN(float) ? 0 : float;
        };

        for (const row of csvRows) {
            // CSV columns: "FullAccount",Date,"Description","ChequeNumber","DebitAmount","CreditAmount","Balance"
            // Note: PapaParse with header:true uses the actual header names.
            // The user showed headers with quotes in the example: "FullAccount",...
            // Our transformHeader should clean them.
            
            // Expected keys after cleaning: FullAccount, Date, Description, ChequeNumber, DebitAmount, CreditAmount, Balance
            
            const debit = parseAmount(row['DebitAmount']);
            const credit = parseAmount(row['CreditAmount']);
            const description = row['Description'];
            const dateStr = row['Date']; // "01/02/2026 00:00:00"

            if (debit === 0 && credit === 0) {
                continue; // Skip empty rows or rows with no value
            }

            let matchFound = null;

            // Strategy: Find EXACT amount match first
            // We iterate through available system transactions
            for (const sysTx of systemTransactions) {
                if (matchedSystemIds.has(sysTx.id)) continue;

                let isMatch = false;

                if (debit > 0) {
                    // Looking for a Debit in system
                    // System Debit is stored in `debit_amount`
                    // We allow a very small epsilon for float comparison
                    if (Math.abs((sysTx.debit_amount || 0) - debit) < 0.01) {
                        isMatch = true;
                    }
                } else if (credit > 0) {
                    // Looking for a Credit in system
                    if (Math.abs((sysTx.credit_amount || 0) - credit) < 0.01) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    matchFound = sysTx;
                    break; // Stop after first match
                }
            }

            if (matchFound) {
                matchedSystemIds.add(matchFound.id);
                matches.push({
                    csv: { date: dateStr, description, debit, credit },
                    system: matchFound
                });
            } else {
                unmatchedCsv.push({
                    date: dateStr, description, debit, credit
                });
            }
        }

        const unmatchedSystem = systemTransactions.filter(tx => !matchedSystemIds.has(tx.id));

        return Response.json({
            matches,
            unmatchedCsv,
            unmatchedSystem,
            stats: {
                totalCsv: csvRows.length,
                matched: matches.length,
                unmatchedCsv: unmatchedCsv.length,
                unmatchedSystem: unmatchedSystem.length
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});