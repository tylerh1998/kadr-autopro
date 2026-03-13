import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { supplierId, addedLines = [], modifiedLines = [], deletedLineIds = [] } = payload;

        if (!supplierId) {
            return Response.json({ success: false, error: 'Missing supplierId' }, { status: 400 });
        }

        let anyAmountChanged = false;

        // Helper to create GL transactions
        const createGLTransactions = async (linesToProcess, action, oldValues) => {
            if (!linesToProcess || linesToProcess.length === 0) return;

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
                const supplierPromises = uniqueSupplierIds.map(id => base44.asServiceRole.entities.Supplier.get(id).catch(() => null));
                const suppliers = await Promise.all(supplierPromises);
                suppliers.forEach(s => {
                    if (s && s.id) supplierMap[s.id] = s.name;
                });
            }

            if (uniqueGLAccounts.length > 0) {
                const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list('', 1000).catch(() => []);
                allAccounts.forEach(acc => {
                    glAccountMap[acc.account_number] = `${acc.account_number} - ${acc.account_name}`;
                });
            }

            const glTransactions = [];

            const createGLEntries = (line, isReversal = false) => {
                const multiplier = isReversal ? -1 : 1;
                const reversalPrefix = isReversal ? 'REVERSAL - ' : '';
                
                const purchaseAmount = parseFloat(line.purchase_amount || 0);
                const gstAmount = parseFloat(line.gst_amount || 0);
                const lineTotal = purchaseAmount + gstAmount;

                const supplierName = supplierMap[line.supplier_id] || 'Unknown Supplier';
                const glAccountName = glAccountMap[line.gl_account] || line.gl_account || 'Unknown';

                const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - ${supplierName}`;

                if (purchaseAmount !== 0) {
                    glTransactions.push({
                        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
                        created_date: new Date().toISOString(),
                        updated_date: new Date().toISOString(),
                        created_by: user.email,
                        created_by_id: user.id,
                        account_number: String(line.gl_account),
                        transaction_date: line.invoice_date,
                        description: `${reversalPrefix}${baseDescription} - ${glAccountName}`,
                        reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                        debit_amount: multiplier * purchaseAmount > 0 ? multiplier * purchaseAmount : 0,
                        credit_amount: multiplier * purchaseAmount < 0 ? Math.abs(multiplier * purchaseAmount) : 0,
                        source_type: 'supplier_invoice',
                        source_id: line.id || ''
                    });
                }

                if (gstAmount !== 0) {
                    glTransactions.push({
                        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
                        created_date: new Date().toISOString(),
                        updated_date: new Date().toISOString(),
                        created_by: user.email,
                        created_by_id: user.id,
                        account_number: '2003',
                        transaction_date: line.invoice_date,
                        description: `${reversalPrefix}${baseDescription} - GST Paid`,
                        reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                        debit_amount: multiplier * gstAmount > 0 ? multiplier * gstAmount : 0,
                        credit_amount: multiplier * gstAmount < 0 ? Math.abs(multiplier * gstAmount) : 0,
                        source_type: 'supplier_invoice',
                        source_id: line.id || ''
                    });
                }

                if (lineTotal !== 0) {
                    glTransactions.push({
                        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
                        created_date: new Date().toISOString(),
                        updated_date: new Date().toISOString(),
                        created_by: user.email,
                        created_by_id: user.id,
                        account_number: '2000',
                        transaction_date: line.invoice_date,
                        description: `${reversalPrefix}${baseDescription} - Accounts Payable`,
                        reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
                        debit_amount: multiplier * lineTotal < 0 ? Math.abs(multiplier * lineTotal) : 0,
                        credit_amount: multiplier * lineTotal > 0 ? multiplier * lineTotal : 0,
                        source_type: 'supplier_invoice',
                        source_id: line.id || ''
                    });
                }
            };

            for (let i = 0; i < linesToProcess.length; i++) {
                const line = linesToProcess[i];
                if (action === 'create') {
                    createGLEntries(line, false);
                } else if (action === 'update') {
                    const oldVal = Array.isArray(oldValues) ? oldValues[i] : oldValues;
                    if (oldVal) createGLEntries(oldVal, true);
                    createGLEntries(line, false);
                } else if (action === 'delete') {
                    createGLEntries(line, true);
                }
            }

            if (glTransactions.length > 0) {
                const sanitizedTxs = glTransactions.map(glTx => ({
                    ...glTx,
                    debit_amount: Math.round(parseFloat(glTx.debit_amount) * 100) / 100,
                    credit_amount: Math.round(parseFloat(glTx.credit_amount) * 100) / 100
                }));
                try {
                    await base44.asServiceRole.entities.GLTransaction.bulkCreate(sanitizedTxs);
                } catch (error) {
                    // Fallback to individual creation if bulk fails
                    for (const tx of sanitizedTxs) {
                        await base44.asServiceRole.entities.GLTransaction.create(tx);
                    }
                }
            }
        };

        // 1. Process Deletions
        const deletedLinesForGL = [];
        for (const lineId of deletedLineIds) {
            console.log(`Processing deletion for lineId: ${lineId}`);
            // Get original line for GL reversal context
            const { data: lineData, error: fetchError } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', lineId).single();
            
            if (fetchError) {
                console.error(`Error fetching line ${lineId} for deletion:`, fetchError);
            }
            
            const lineToDelete = lineData;
            
            if (lineToDelete) {
                if (lineToDelete.paid_amount && lineToDelete.paid_amount !== 0) {
                     console.warn(`Skipping deletion of line ${lineId} because it has paid amount`);
                     continue; 
                }

                const { error: deleteError } = await supabase.from('SupplierInvoiceLine').delete().eq('id', lineId);
                if (deleteError) {
                    console.error(`Error deleting line ${lineId}:`, deleteError);
                    throw new Error(`Failed to delete line: ${deleteError.message}`);
                }
                console.log(`Successfully deleted line ${lineId}`);
                anyAmountChanged = true;
                deletedLinesForGL.push(lineToDelete);
            } else {
                console.warn(`Line ${lineId} not found for deletion`);
            }
        }

        if (deletedLinesForGL.length > 0) {
            await createGLTransactions(deletedLinesForGL, 'delete');
        }

        // 2. Process Additions
        let createdLinesForGL = [];
        if (addedLines.length > 0) {
            const linesToInsert = addedLines.map(line => {
                const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
                const now = new Date().toISOString();
                return {
                    id: newId,
                    created_date: now,
                    updated_date: now,
                    created_by: user.email,
                    created_by_id: user.id,
                    supplier_id: supplierId,
                    invoice_number: line.invoice_number,
                    invoice_date: line.invoice_date,
                    description: line.description,
                    purchase_amount: line.purchase_amount,
                    gst_amount: line.gst_amount,
                    gl_account: line.gl_account,
                    gst_override: line.gst_override,
                    paid_amount: 0
                };
            });
            
            const { data: insertedData, error: insertError } = await supabase.from('SupplierInvoiceLine').insert(linesToInsert).select();
            
            if (insertError) {
                throw new Error(`Failed to insert lines: ${insertError.message}`);
            }
            
            if (insertedData && insertedData.length > 0) {
                createdLinesForGL = insertedData;
                anyAmountChanged = true;
            }
        }

        if (createdLinesForGL.length > 0) {
            await createGLTransactions(createdLinesForGL, 'create');
        }

        // 3. Process Modifications
        const updatedLinesForGL = [];
        const oldValuesForGL = [];
        for (const line of modifiedLines) {
            // Fetch current DB state for oldValues
            const { data: existingLine } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', line.id).single();
            if (!existingLine) continue;

            // Check if amounts changed
            const currentPurchaseAmount = parseFloat(line.purchase_amount) || 0;
            const currentGstAmount = parseFloat(line.gst_amount) || 0;
            const oldPurchaseAmount = existingLine.purchase_amount || 0;
            const oldGstAmount = existingLine.gst_amount || 0;

            if (currentPurchaseAmount !== oldPurchaseAmount || currentGstAmount !== oldGstAmount) {
                anyAmountChanged = true;
            }

            const updateData = {
                updated_date: new Date().toISOString(),
                invoice_number: line.invoice_number,
                invoice_date: line.invoice_date,
                description: line.description,
                purchase_amount: line.purchase_amount,
                gst_amount: line.gst_amount,
                gl_account: line.gl_account,
                gst_override: line.gst_override
            };

            const { data: updatedData, error: updateError } = await supabase.from('SupplierInvoiceLine').update(updateData).eq('id', line.id).select();
            
            if (updateError) {
                throw new Error(`Failed to update line ${line.id}: ${updateError.message}`);
            }
            
            const updatedLine = updatedData?.[0];
            if (updatedLine) {
                updatedLinesForGL.push(updatedLine);
                oldValuesForGL.push(existingLine);
            }
        }

        if (updatedLinesForGL.length > 0) {
            await createGLTransactions(updatedLinesForGL, 'update', oldValuesForGL);
        }

        // 4. Payment Reallocation (if needed)
        if (anyAmountChanged) {
            console.log("Invoice line amounts changed. Reallocating payments.");
            const { data: payments } = await supabase.from('SupplierPayment').select('*').eq('supplier_id', supplierId);

            for (const payment of (payments || [])) {
                let appliedInvoices = [];
                try {
                    const parsed = JSON.parse(payment.invoice_number || '[]');
                    if (Array.isArray(parsed)) {
                        appliedInvoices = parsed;
                    } else if (payment.invoice_number && typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
                        appliedInvoices = [{
                            invoice_number: payment.invoice_number,
                            amount_applied: payment.amount
                        }];
                    }
                } catch (error) {
                    if (payment.invoice_number && typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
                        appliedInvoices = [{
                            invoice_number: payment.invoice_number,
                            amount_applied: payment.amount
                        }];
                    }
                }

                for (const appliedDetail of appliedInvoices) {
                    if (appliedDetail.invoice_number === "On Account") continue;

                    // Fetch latest lines for this invoice
                    const { data: invoiceLines } = await supabase.from('SupplierInvoiceLine')
                        .select('*')
                        .eq('supplier_id', supplierId)
                        .eq('invoice_number', appliedDetail.invoice_number);

                    if (invoiceLines && invoiceLines.length > 0) {
                        const invoiceTotal = invoiceLines.reduce((sum, l) => {
                            const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                            return sum + lineTotal;
                        }, 0);

                        for (const l of invoiceLines) {
                            const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                            const proportion = invoiceTotal !== 0 ? lineTotal / invoiceTotal : 0;
                            const newPaidAmount = appliedDetail.amount_applied * proportion;

                            await supabase.from('SupplierInvoiceLine')
                                .update({
                                    updated_date: new Date().toISOString(),
                                    paid_amount: Math.round(newPaidAmount * 100) / 100
                                })
                                .eq('id', l.id);
                        }
                    }
                }
            }
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('Error in saveSupplierInvoiceTransactions:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});