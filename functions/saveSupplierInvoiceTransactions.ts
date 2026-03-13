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

        // 1. Process Deletions
        const deletedLinesForGL = [];
        for (const lineId of deletedLineIds) {
            // Get original line for GL reversal context
            const lineToDelete = await base44.asServiceRole.entities.SupplierInvoiceLine.get(lineId);
            if (lineToDelete) {
                if (lineToDelete.paid_amount && lineToDelete.paid_amount !== 0) {
                     console.warn(`Skipping deletion of line ${lineId} because it has paid amount`);
                     continue; 
                }

                await base44.asServiceRole.entities.SupplierInvoiceLine.delete(lineId);
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
        const createdLinesForGL = [];
        for (const line of addedLines) {
            const lineData = {
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

            const createdLine = await base44.asServiceRole.entities.SupplierInvoiceLine.create(lineData);
            anyAmountChanged = true;
            createdLinesForGL.push(createdLine);
        }

        if (createdLinesForGL.length > 0) {
            const glCreateResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                supplierInvoiceLines: createdLinesForGL,
                action: 'create',
                oldValues: null
            });
            if (glCreateResponse.data && !glCreateResponse.data.success) {
                throw new Error(`GL Transaction creation failed for new lines: ${glCreateResponse.data.error || 'Unknown error'}`);
            }
        }

        // 3. Process Modifications
        for (const line of modifiedLines) {
            // Fetch current DB state for oldValues
            const existingLine = await base44.asServiceRole.entities.SupplierInvoiceLine.get(line.id);
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
                invoice_number: line.invoice_number,
                invoice_date: line.invoice_date,
                description: line.description,
                purchase_amount: line.purchase_amount,
                gst_amount: line.gst_amount,
                gl_account: line.gl_account,
                gst_override: line.gst_override
            };

            const updatedLine = await base44.asServiceRole.entities.SupplierInvoiceLine.update(line.id, updateData);

            // Invoke GL Handler individually for updates since oldValues is needed per line
            const glUpdateResponse = await base44.functions.invoke('handleSupplierInvoiceLineGL', {
                supplierInvoiceLine: updatedLine,
                action: 'update',
                oldValues: existingLine
            });

            if (glUpdateResponse.data && !glUpdateResponse.data.success) {
                throw new Error(`GL Transaction update failed for modified line: ${glUpdateResponse.data.error || 'Unknown error'}`);
            }
        }

        // 4. Payment Reallocation (if needed)
        if (anyAmountChanged) {
            console.log("Invoice line amounts changed. Reallocating payments.");
            const payments = await base44.asServiceRole.entities.SupplierPayment.filter({ supplier_id: supplierId });

            for (const payment of payments) {
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
                    const invoiceLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({
                        supplier_id: supplierId,
                        invoice_number: appliedDetail.invoice_number
                    });

                    if (invoiceLines && invoiceLines.length > 0) {
                        const invoiceTotal = invoiceLines.reduce((sum, l) => {
                            const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                            return sum + lineTotal;
                        }, 0);

                        for (const l of invoiceLines) {
                            const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                            const proportion = invoiceTotal !== 0 ? lineTotal / invoiceTotal : 0;
                            const newPaidAmount = appliedDetail.amount_applied * proportion;

                            await base44.asServiceRole.entities.SupplierInvoiceLine.update(l.id, {
                                paid_amount: Math.round(newPaidAmount * 100) / 100
                            });
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