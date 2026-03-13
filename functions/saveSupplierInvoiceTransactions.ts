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

        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        let anyAmountChanged = false;

        // 1. Process Deletions
        const deletedLinesForGL = [];
        for (const lineId of deletedLineIds) {
            // Get original line for GL reversal context
            const { data: lineData } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', lineId).single();
            const lineToDelete = lineData;
            
            if (lineToDelete) {
                if (lineToDelete.paid_amount && lineToDelete.paid_amount !== 0) {
                     console.warn(`Skipping deletion of line ${lineId} because it has paid amount`);
                     continue; 
                }

                await supabase.from('SupplierInvoiceLine').delete().eq('id', lineId);
                anyAmountChanged = true;
                deletedLinesForGL.push(lineToDelete);
            }
        }

        if (deletedLinesForGL.length > 0) {
            const glDeleteResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                supplierInvoiceLines: deletedLinesForGL,
                action: 'delete'
            });
            if (glDeleteResponse.data && !glDeleteResponse.data.success) {
                throw new Error(`GL Transaction creation failed for deleted lines: ${glDeleteResponse.data.error || 'Unknown error'}`);
            }
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
            try {
                const glCreateResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                    supplierInvoiceLines: createdLinesForGL,
                    action: 'create',
                    oldValues: null
                });
                if (glCreateResponse.data && !glCreateResponse.data.success) {
                    throw new Error(`GL Transaction creation failed for new lines: ${glCreateResponse.data.error || 'Unknown error'}`);
                }
            } catch (err) {
                console.error("Error invoking handleSupplierInvoiceLineGL:", err);
                throw new Error(`Failed to invoke handleSupplierInvoiceLineGL: ${err.message}`);
            }
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
            const glUpdateResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                supplierInvoiceLines: updatedLinesForGL,
                action: 'update',
                oldValues: oldValuesForGL
            });

            if (glUpdateResponse.data && !glUpdateResponse.data.success) {
                throw new Error(`GL Transaction update failed for modified lines: ${glUpdateResponse.data.error || 'Unknown error'}`);
            }
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