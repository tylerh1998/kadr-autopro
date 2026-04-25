import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Papa from 'npm:papaparse@5.4.1';
import { parse, isValid, differenceInDays } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { fileUrl, bankAccountId, periodEnd } = payload;

        if (!fileUrl || !bankAccountId || !periodEnd) {
            return Response.json({ error: 'Missing fileUrl, bankAccountId, or periodEnd' }, { status: 400 });
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
        // Using filter() instead of list() which doesn't support object params for filtering
        const systemTransactions = await base44.entities.BankTransaction.filter({
             bank_account_id: bankAccountId,
             reconciled: false
        }, '-transaction_date', 2000);

        const filteredSystemTransactions = systemTransactions.filter((tx) => {
            if (!tx.transaction_date) return false;
            return tx.transaction_date.substring(0, 10) <= periodEnd;
        });
        
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

        const parseCsvDate = (dateStr) => {
            if (!dateStr) return null;
            // Handle "MM/DD/YYYY HH:mm:ss" -> take first part
            const cleanDateStr = dateStr.split(' ')[0]; 
            // Try MM/dd/yyyy (US/Canada standard)
            let date = parse(cleanDateStr, 'MM/dd/yyyy', new Date());
            if (!isValid(date)) {
                // Fallback to yyyy-MM-dd
                date = parse(cleanDateStr, 'yyyy-MM-dd', new Date());
            }
             if (!isValid(date)) {
                // Fallback to dd/MM/yyyy
                date = parse(cleanDateStr, 'dd/MM/yyyy', new Date());
            }
            return isValid(date) ? date : null;
        };

        for (const row of csvRows) {
            const debit = parseAmount(row['DebitAmount']);
            const credit = parseAmount(row['CreditAmount']);
            const description = row['Description'];
            const dateStr = row['Date'];
            const csvDate = parseCsvDate(dateStr);

            if (debit === 0 && credit === 0) {
                continue; 
            }

            let matchFound = null;

            // Strategy: Find match based on amount only (tolerance <= 0.005), ignoring dates
            for (const sysTx of filteredSystemTransactions) {
                if (matchedSystemIds.has(sysTx.id)) continue;

                let isAmountMatch = false;
                if (debit > 0) {
                    if (Math.abs((sysTx.debit_amount || 0) - debit) <= 0.005) isAmountMatch = true;
                } else if (credit > 0) {
                    if (Math.abs((sysTx.credit_amount || 0) - credit) <= 0.005) isAmountMatch = true;
                }

                if (isAmountMatch) {
                    matchFound = sysTx;
                    break; 
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

        const unmatchedSystem = filteredSystemTransactions.filter(tx => !matchedSystemIds.has(tx.id));

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