import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workOrder, lineItems, payments, systemSettings } = await req.json();

        console.log('--- handleCreditInvoiceGL Invoked ---');
        console.log('Credit Invoice RO:', workOrder?.ro_number);
        console.log('Line Items Count:', lineItems?.length);
        console.log('Payments Count:', payments?.length);

        if (!workOrder || !lineItems || !payments || !systemSettings) {
            return Response.json({ 
                error: 'Missing required parameters: workOrder, lineItems, payments, systemSettings' 
            }, { status: 400 });
        }

        const GL_ACCOUNTS = {
            PARTS_SALES: '4002',
            LABOR_SALES: '4001',
            SHOP_SUPPLIES_REVENUE: systemSettings.shop_supplies_gl_account || '4004',
            GST_RECEIVED: '2002',
            INVENTORY: '1200',
            COGS: '5000',
            PAYMENTS_IN_ADVANCE: '2100',
            ACCOUNTS_RECEIVABLE: '1100',
            CASH_DRAWER: '1010'
        };

        const generatedGLTransactions = [];
        const invoiceDate = workOrder.invoice_date || new Date().toISOString().split('T')[0];
        const reference = workOrder.crinv_number || workOrder.ro_number;

        let partsCreditTotal = 0;
        let laborCreditTotal = 0;
        let partsInventoryCostReversed = 0;
        const finalShopSuppliesTotal = parseFloat(workOrder.shop_supply_total || 0);

        // Fetch inventory items to ensure we have accurate costs
        // Collect all unique inventory IDs
        const inventoryIds = [...new Set(lineItems.filter(l => l.inventory_item_id).map(l => l.inventory_item_id))];
        let inventoryItemsMap = {};
        
        if (inventoryIds.length > 0) {
            try {
                // In a perfect world we would do a bulk fetch, but for now we'll fetch list and filter or fetch individually if list is too large
                // Assuming list() returns all or reasonable amount. 
                // Better approach for stability: fetch specifically what we need if possible, but SDK limits might apply.
                // We'll trust that we can fetch the relevant items.
                // If there are many items, this might be slow loop, so let's try to get them.
                
                // For robustness, we will try to use costs from the line item if present, 
                // but fallback to fetching if needed or if we suspect line item cost is stale.
                // However, for Credit Invoice, we usually want the cost *at the time of sale* (from line item) 
                // OR the current replacement cost? 
                // Standard accounting: reverse the cost that was booked at sale. 
                // Since we don't track historical cost layers perfectly on the line, we'll try to use line.cost_ea.
                
                // Note: The user requested changes implies the logic was wrong (summing total parts instead of cost).
                // We will stick to line values primarily.
            } catch (e) {
                console.error("Error preparing inventory costs", e);
            }
        }

        for (const line of lineItems) {
            if (line.is_other_charge) continue;

            const lineTotParts = parseFloat(line.tot_parts || 0);
            const lineLabor = parseFloat(line.labour || 0);

            partsCreditTotal += lineTotParts;
            laborCreditTotal += lineLabor;

            if (line.inventory_item_id && line.qty) {
                const qty = parseFloat(line.qty || 0);
                
                if (line.is_core_virtual) {
                    // It's a virtual core line. Cost is the core_cost.
                    // We expect 'cost' or 'cost_ea' or 'core_cost' to be set on the virtual line by the frontend.
                    const coreCost = parseFloat(line.cost || line.cost_ea || line.core_cost || 0);
                    partsInventoryCostReversed += qty * coreCost;
                } else {
                    // It's a regular part line. Cost is the part cost.
                    // We expect 'cost' or 'cost_ea' to be on the line.
                    const partCost = parseFloat(line.cost || line.cost_ea || 0);
                    partsInventoryCostReversed += qty * partCost;
                }
            }
        }

        const gstTotal = parseFloat(workOrder.tax_amount || 0);

        console.log('--- Calculated Totals ---');
        console.log('Parts Credit:', partsCreditTotal);
        console.log('Labor Credit:', laborCreditTotal);
        console.log('Shop Supplies Credit:', finalShopSuppliesTotal);
        console.log('GST Credit:', gstTotal);
        console.log('Inventory Cost Reversed:', partsInventoryCostReversed);

        // Revenue reversals (debit revenue accounts)
        if (partsCreditTotal !== 0) {
            const partsEntry = {
                account_number: GL_ACCOUNTS.PARTS_SALES,
                transaction_date: invoiceDate,
                description: `Credit Parts sales - ${reference}`,
                reference: reference,
                debit_amount: Math.abs(partsCreditTotal),
                credit_amount: 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(partsEntry);
            generatedGLTransactions.push(partsEntry);
        }

        if (laborCreditTotal !== 0) {
            const laborEntry = {
                account_number: GL_ACCOUNTS.LABOR_SALES,
                transaction_date: invoiceDate,
                description: `Credit Labor sales - ${reference}`,
                reference: reference,
                debit_amount: Math.abs(laborCreditTotal),
                credit_amount: 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(laborEntry);
            generatedGLTransactions.push(laborEntry);
        }

        if (finalShopSuppliesTotal !== 0) {
            const shopSuppliesEntry = {
                account_number: GL_ACCOUNTS.SHOP_SUPPLIES_REVENUE,
                transaction_date: invoiceDate,
                description: `Credit Shop supplies - ${reference}`,
                reference: reference,
                debit_amount: Math.abs(finalShopSuppliesTotal),
                credit_amount: 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(shopSuppliesEntry);
            generatedGLTransactions.push(shopSuppliesEntry);
        }

        if (gstTotal !== 0) {
            const gstEntry = {
                account_number: GL_ACCOUNTS.GST_RECEIVED,
                transaction_date: invoiceDate,
                description: `Credit GST collected - ${reference}`,
                reference: reference,
                debit_amount: Math.abs(gstTotal),
                credit_amount: 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(gstEntry);
            generatedGLTransactions.push(gstEntry);
        }

        // COGS and Inventory reversals
        if (partsInventoryCostReversed !== 0) {
            const cogsEntry = {
                account_number: GL_ACCOUNTS.COGS,
                transaction_date: invoiceDate,
                description: `Credit cost of parts sold - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: Math.abs(partsInventoryCostReversed),
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(cogsEntry);
            generatedGLTransactions.push(cogsEntry);

            const inventoryEntry = {
                account_number: GL_ACCOUNTS.INVENTORY,
                transaction_date: invoiceDate,
                description: `Credit Inventory increase - ${reference}`,
                reference: reference,
                debit_amount: Math.abs(partsInventoryCostReversed),
                credit_amount: 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(inventoryEntry);
            generatedGLTransactions.push(inventoryEntry);
        }

        // Other charges reversals
        for (const line of lineItems) {
            if (line.is_other_charge && line.gl_account) {
                const ocTotal = parseFloat(line.oc_total || 0);
                if (ocTotal !== 0) {
                    const ocEntry = {
                        account_number: line.gl_account,
                        transaction_date: invoiceDate,
                        description: `Credit ${line.description} - ${reference}`,
                        reference: reference,
                        debit_amount: Math.abs(ocTotal),
                        credit_amount: 0,
                        source_type: 'credit_invoice',
                        source_id: workOrder.id
                    };
                    await base44.asServiceRole.entities.GLTransaction.create(ocEntry);
                    generatedGLTransactions.push(ocEntry);
                }
            }
        }

        // Payment reversals (credit payment accounts for refunds)
        let totalAdvancePaymentsReversed = 0;
        let totalOnAccountPaymentsReversed = 0;
        let totalCashPaymentsReversed = 0;

        for (const payment of payments) {
            const amount = parseFloat(payment.amount || 0);
            if (amount === 0) continue;

            if (payment.payment_method === 'advance_pmt') {
                totalAdvancePaymentsReversed += Math.abs(amount);
            } else if (payment.payment_method === 'on_account') {
                totalOnAccountPaymentsReversed += Math.abs(amount);
            } else {
                totalCashPaymentsReversed += Math.abs(amount);
            }
        }

        if (totalAdvancePaymentsReversed !== 0) {
            const advanceEntry = {
                account_number: GL_ACCOUNTS.PAYMENTS_IN_ADVANCE,
                transaction_date: invoiceDate,
                description: `Credit advance payments applied - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: totalAdvancePaymentsReversed,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(advanceEntry);
            generatedGLTransactions.push(advanceEntry);
        }

        if (totalOnAccountPaymentsReversed !== 0) {
            const arEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: invoiceDate,
                description: `Credit AR payment - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: totalOnAccountPaymentsReversed,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(arEntry);
            generatedGLTransactions.push(arEntry);
        }

        if (totalCashPaymentsReversed !== 0) {
            const cashEntry = {
                account_number: GL_ACCOUNTS.CASH_DRAWER,
                transaction_date: invoiceDate,
                description: `Credit Payment refunded - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: totalCashPaymentsReversed,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(cashEntry);
            generatedGLTransactions.push(cashEntry);
        }

        const totalCreditAmount = parseFloat(workOrder.total_amount || 0);
        const totalPaymentsFromCredit = totalAdvancePaymentsReversed + totalOnAccountPaymentsReversed + totalCashPaymentsReversed;
        const remainingBalance = totalCreditAmount + totalPaymentsFromCredit;

        console.log('--- Credit Payment Summary ---');
        console.log('Total Credit Amount:', totalCreditAmount);
        console.log('Total Payments from Credit:', totalPaymentsFromCredit);
        console.log('Remaining Balance:', remainingBalance);

        if (Math.abs(remainingBalance) > 0.01) {
            const arBalanceEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: invoiceDate,
                description: `Credit invoice balance adjustment - ${reference}`,
                reference: reference,
                debit_amount: remainingBalance > 0 ? remainingBalance : 0,
                credit_amount: remainingBalance < 0 ? Math.abs(remainingBalance) : 0,
                source_type: 'credit_invoice',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(arBalanceEntry);
            generatedGLTransactions.push(arBalanceEntry);
        }

        console.log(`--- Generated ${generatedGLTransactions.length} GL transactions for credit invoice ---`);

        return Response.json({
            success: true,
            accounting_details: JSON.stringify(generatedGLTransactions),
            summary: {
                parts_credit: partsCreditTotal,
                labor_credit: laborCreditTotal,
                shop_supplies_credit: finalShopSuppliesTotal,
                gst_credit: gstTotal,
                inventory_increase: partsInventoryCostReversed,
                advance_payments_reversed: totalAdvancePaymentsReversed,
                on_account_payments_reversed: totalOnAccountPaymentsReversed,
                cash_payments_refunded: totalCashPaymentsReversed,
                remaining_balance_adjustment: remainingBalance,
                total_transactions: generatedGLTransactions.length
            }
        });

    } catch (error) {
        console.error('--- Error in handleCreditInvoiceGL ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to process credit GL transactions' 
        }, { status: 500 });
    }
});