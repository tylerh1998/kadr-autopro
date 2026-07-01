import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const payload = await req.json();
        const { supplierInvoiceLine, supplierInvoiceLines, action, oldValues } = payload;

        console.log('=== handleSupplierInvoiceLineGL Debug ===');
        console.log('Action:', action);
        console.log('Payload:', JSON.stringify(payload, null, 2));

        if ((!supplierInvoiceLine && !supplierInvoiceLines) || !action) {
            return Response.json({ 
                error: 'Missing required parameters: supplierInvoiceLine(s) and action' 
            }, { status: 400 });
        }

        // Determine lines to process
        let linesToProcess = [];
        if (supplierInvoiceLines && Array.isArray(supplierInvoiceLines)) {
            linesToProcess = supplierInvoiceLines;
        } else if (supplierInvoiceLine) {
            linesToProcess = [supplierInvoiceLine];
        }

        console.time('Total GL Processing Time');
        console.time('Fetch Bulk Data');
        
        let allLinesForData = [...linesToProcess];
        if (action === 'update') {
            if (Array.isArray(oldValues)) {
                allLinesForData.push(...oldValues);
            } else if (oldValues) {
                allLinesForData.push(oldValues);
            }
        }

        const uniqueSupplierIds = [...new Set(allLinesForData.map(l => l.supplier_id).filter(Boolean))];
        const uniqueGLAccounts = [...new Set(allLinesForData.map(l => l.gl_account).filter(Boolean))];

        const supplierMap = {};
        const glAccountMap = {};

        if (uniqueSupplierIds.length > 0) {
            const { data: suppliers } = await supabase.from('Supplier').select('id, name').in('id', uniqueSupplierIds);
            (suppliers || []).forEach(s => {
                if (s && s.id) supplierMap[s.id] = s.name;
            });
        }

        if (uniqueGLAccounts.length > 0) {
            const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list('', 1000).catch(() => []);
            allAccounts.forEach(acc => {
                glAccountMap[acc.account_number] = `${acc.account_number} - ${acc.account_name}`;
            });
        }
        console.timeEnd('Fetch Bulk Data');

        const glTransactions = [];

        // Helper function to create GL transaction entries
        const createGLEntries = (line, isReversal = false) => {
            const multiplier = isReversal ? -1 : 1;
            const reversalPrefix = isReversal ? 'REVERSAL - ' : '';
            
            const purchaseAmount = parseFloat(line.purchase_amount || 0);
            const gstAmount = parseFloat(line.gst_amount || 0);
            const lineTotal = purchaseAmount + gstAmount;

            const supplierName = supplierMap[line.supplier_id] || 'Unknown Supplier';
            const glAccountName = glAccountMap[line.gl_account] || line.gl_account || 'Unknown';

            const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - ${supplierName}`;

            // 1. Debit to the GL account specified on the line (purchase_amount)
            if (purchaseAmount !== 0) {
                const tx1 = {
                    account_number: String(line.gl_account),
                    transaction_date: line.invoice_date,
                    description: `${reversalPrefix}${baseDescription} - ${glAccountName}`,
                    reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                    debit_amount: multiplier * purchaseAmount > 0 ? multiplier * purchaseAmount : 0,
                    credit_amount: multiplier * purchaseAmount < 0 ? Math.abs(multiplier * purchaseAmount) : 0,
                    source_type: 'supplier_invoice',
                    source_id: line.id || ''
                };
                glTransactions.push(tx1);
            }

            // 2. Debit to GST Paid (2003) for gst_amount
            if (gstAmount !== 0) {
                const tx2 = {
                    account_number: '2003',
                    transaction_date: line.invoice_date,
                    description: `${reversalPrefix}${baseDescription} - GST Paid`,
                    reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                    debit_amount: multiplier * gstAmount > 0 ? multiplier * gstAmount : 0,
                    credit_amount: multiplier * gstAmount < 0 ? Math.abs(multiplier * gstAmount) : 0,
                    source_type: 'supplier_invoice',
                    source_id: line.id || ''
                };
                glTransactions.push(tx2);
            }

            // 3. Credit to Accounts Payable (2000) for line total
            if (lineTotal !== 0) {
                const tx3 = {
                    account_number: '2000',
                    transaction_date: line.invoice_date,
                    description: `${reversalPrefix}${baseDescription} - Accounts Payable`,
                    reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                    debit_amount: multiplier * lineTotal < 0 ? Math.abs(multiplier * lineTotal) : 0,
                    credit_amount: multiplier * lineTotal > 0 ? multiplier * lineTotal : 0,
                    source_type: 'supplier_invoice',
                    source_id: line.id || ''
                };
                glTransactions.push(tx3);
            }
        };

        console.time('Process Lines');
        // Process all lines
        for (let i = 0; i < linesToProcess.length; i++) {
            const line = linesToProcess[i];
            if (action === 'create') {
                createGLEntries(line, false);
            } else if (action === 'update') {
                const oldVal = Array.isArray(oldValues) ? oldValues[i] : oldValues;
                if (!oldVal) {
                    return Response.json({ error: 'Old values required for update action' }, { status: 400 });
                }
                createGLEntries(oldVal, true);
                createGLEntries(line, false);
            } else if (action === 'delete') {
                createGLEntries(line, true);
            }
        }
        console.timeEnd('Process Lines');

        // Create all GL transactions using service role
        console.log(`Creating ${glTransactions.length} GL Transactions in bulk`);
        
        const errors = [];
        let createdCount = 0;

        if (glTransactions.length > 0) {
            console.time('Create GL Transactions via SupabaseProxy');
            try {
                const userDisplay = user.full_name || user.email || user.id;
                const sanitizedTxs = glTransactions.map(glTx => ({
                    ...glTx,
                    debit_amount: Math.round(parseFloat(glTx.debit_amount || 0) * 100) / 100,
                    credit_amount: Math.round(parseFloat(glTx.credit_amount || 0) * 100) / 100,
                    created_by: glTx.created_by || userDisplay,
                    created_by_id: glTx.created_by_id || user.id,
                    updated_by: glTx.updated_by || userDisplay
                }));

                const createResponse = await base44.functions.invoke('SupabaseProxy', {
                    action: 'create',
                    table: 'GLTransaction',
                    data: sanitizedTxs
                });

                if (createResponse?.data?.error) {
                    throw new Error(createResponse.data.error);
                }

                createdCount = Array.isArray(createResponse?.data?.data) ? createResponse.data.data.length : 0;
                console.log(`Successfully created ${createdCount} GL transactions through SupabaseProxy`);
            } catch (error) {
                console.error('Failed to create GL transactions through SupabaseProxy:', error);
                errors.push({
                    transaction_count: glTransactions.length,
                    error: error.message
                });
            }
            console.timeEnd('Create GL Transactions via SupabaseProxy');
        }
        
        console.timeEnd('Total GL Processing Time');

        if (errors.length > 0) {
            return Response.json({
                success: false,
                message: `Failed to post ${errors.length} GL transactions. Created ${createdCount} successfully.`,
                errors: errors,
                transactionsCreated: createdCount
            }, { status: 500 }); // Return 500 so upstream knows it failed
        }

        return Response.json({ 
            success: true, 
            message: `Successfully posted ${createdCount} GL transactions`,
            transactionsCreated: createdCount
        });

    } catch (error) {
        console.error('Error in handleSupplierInvoiceLineGL:', error);
        return Response.json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        }, { status: 500 });
    }
});