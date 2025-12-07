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

        for (const line of lineItems) {
            if (line.is_other_charge) continue;

            const lineTotParts = parseFloat(line.tot_parts || 0);
            const lineLabor = parseFloat(line.labour || 0);

            partsCreditTotal += lineTotParts;
            laborCreditTotal += lineLabor;

            if (line.inventory_item_id && line.qty) {
                const qty = parseFloat(line.qty || 0);
                const costEa = parseFloat(line.cost_ea || 0);
                const basePartCost = qty * costEa;
                
                const coreNum = parseFloat(line.Core_num || 0);
                const coreRet = parseFloat(line.core_ret || 0);
                const coreCost = parseFloat(line.core_cost || 0);
                const outstandingCores = coreNum - coreRet;
                const coreCostContribution = outstandingCores * coreCost;
                
                partsInventoryCostReversed += basePartCost + coreCostContribution;
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