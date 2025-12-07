import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { supplierInvoiceLine, action, oldValues } = await req.json();

        console.log('=== handleSupplierInvoiceLineGL Debug ===');
        console.log('Action:', action);
        console.log('SupplierInvoiceLine:', supplierInvoiceLine);
        console.log('Old Values:', oldValues);

        if (!supplierInvoiceLine || !action) {
            return Response.json({ 
                error: 'Missing required parameters: supplierInvoiceLine and action' 
            }, { status: 400 });
        }

        const glTransactions = [];

        // Helper function to create GL transaction entries
        const createGLEntries = async (line, isReversal = false) => {
            const multiplier = isReversal ? -1 : 1;
            const reversalPrefix = isReversal ? 'REVERSAL - ' : '';
            
            const purchaseAmount = parseFloat(line.purchase_amount || 0);
            const gstAmount = parseFloat(line.gst_amount || 0);
            const lineTotal = purchaseAmount + gstAmount;

            // Get supplier name for better description
            let supplierName = 'Unknown Supplier';
            try {
                const supplier = await base44.asServiceRole.entities.Supplier.get(line.supplier_id);
                if (supplier) {
                    supplierName = supplier.name;
                }
            } catch (error) {
                console.error('Error fetching supplier for GL transaction:', error);
            }

            // Get GL account name for better description
            let glAccountName = line.gl_account || 'Unknown';
            try {
                const chartOfAccount = await base44.asServiceRole.entities.ChartOfAccount.filter({ 
                    account_number: line.gl_account 
                });
                if (chartOfAccount && chartOfAccount.length > 0) {
                    glAccountName = `${chartOfAccount[0].account_number} - ${chartOfAccount[0].account_name}`;
                }
            } catch (error) {
                console.error('Error fetching chart of account:', error);
            }

            const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - ${supplierName}`;

            // 1. Debit to the GL account specified on the line (purchase_amount)
            if (purchaseAmount !== 0) {
                const tx1 = {
                    account_number: line.gl_account,
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

        // Handle different actions
        if (action === 'create') {
            // For create, just post the new entries
            await createGLEntries(supplierInvoiceLine, false);
        } else if (action === 'update') {
            // For update, first reverse the old entries, then post new entries
            if (!oldValues) {
                return Response.json({ 
                    error: 'Old values required for update action' 
                }, { status: 400 });
            }
            
            // Reverse old entries
            await createGLEntries(oldValues, true);
            
            // Post new entries
            await createGLEntries(supplierInvoiceLine, false);
        } else if (action === 'delete') {
            // For delete, reverse the existing entries
            await createGLEntries(supplierInvoiceLine, true);
        } else {
            return Response.json({ 
                error: 'Invalid action. Must be create, update, or delete' 
            }, { status: 400 });
        }

        // Create all GL transactions using service role
        console.log('Creating GL Transactions:', glTransactions);
        
        for (const glTx of glTransactions) {
            await base44.asServiceRole.entities.GLTransaction.create(glTx);
        }

        return Response.json({ 
            success: true, 
            message: `Successfully posted ${glTransactions.length} GL transactions`,
            transactionsCreated: glTransactions.length
        });

    } catch (error) {
        console.error('Error in handleSupplierInvoiceLineGL:', error);
        return Response.json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        }, { status: 500 });
    }
});