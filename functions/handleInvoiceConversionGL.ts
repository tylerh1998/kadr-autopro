import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let workOrder, lineItems, payments, systemSettings, action;
        try {
            ({ workOrder, lineItems, payments, systemSettings, action } = await req.json());
        } catch (jsonError) {
            console.error('Error parsing request JSON:', jsonError);
            return Response.json({ error: 'Invalid JSON payload', details: jsonError.message }, { status: 400 });
        }

        console.log('--- handleInvoiceConversionGL Invoked ---');
        console.log('Action:', action);
        console.log('Work Order RO:', workOrder?.ro_number);

        if (!workOrder || !lineItems || !payments || !systemSettings || !action) {
            return Response.json({ 
                error: 'Missing required parameters: workOrder, lineItems, payments, systemSettings, action' 
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
        const reference = workOrder.inv_number || workOrder.ro_number;

        // --- Step 1: Reversal Logic (unchanged) ---
        if (workOrder.accounting_details && action === 'convert') {
            try {
                const previousEntries = JSON.parse(workOrder.accounting_details);
                for (const entry of previousEntries) {
                    const reversalEntry = {
                        account_number: entry.account_number,
                        transaction_date: invoiceDate,
                        description: `REVERSAL: ${entry.description}`,
                        reference: reference,
                        debit_amount: entry.credit_amount,
                        credit_amount: entry.debit_amount,
                        source_type: 'work_order',
                        source_id: workOrder.id
                    };
                    await base44.asServiceRole.entities.GLTransaction.create(reversalEntry);
                    generatedGLTransactions.push(reversalEntry);
                }
            } catch (error) {
                console.error('Error reversing previous entries:', error);
            }
        }

        // --- Step 2: Calculate Revenue & Inventory Totals ---
        let partsSalesTotal = 0;
        let laborTotal = 0;
        let partsInventoryCost = 0;
        const finalShopSuppliesTotal = parseFloat(workOrder.shop_supply_total || 0);
        
        // Helper to round to 2 decimals
        const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

        for (const line of lineItems) {
            if (line.is_other_charge) continue;

            partsSalesTotal += parseFloat(line.tot_parts || 0);
            laborTotal += parseFloat(line.labour || 0);

            if (line.inventory_item_id && line.qty) {
                const qty = parseFloat(line.qty || 0);
                const costEa = parseFloat(line.cost_ea || 0);
                const basePartCost = qty * costEa;
                
                const coreNum = parseFloat(line.Core_num || 0);
                const coreRet = parseFloat(line.core_ret || 0);
                const coreCost = parseFloat(line.core_cost || 0);
                const outstandingCores = coreNum - coreRet;
                const coreCostContribution = outstandingCores * coreCost;
                
                partsInventoryCost += basePartCost + coreCostContribution;
            }
        }

        const gstTotal = parseFloat(workOrder.tax_amount || 0);

        // --- Step 3: Create Invoice Transaction (Revenue & AR) ---
        // Strategy: Gross Method. 
        // 1. Post all Revenues (Credits).
        // 2. Post full Invoice Amount to AR (Debit).
        // 3. Ensure this transaction balances perfectly.

        const invoiceEntries = [];
        let totalInvoiceCredits = 0;

        // Parts Sales
        if (partsSalesTotal !== 0) {
            const amount = round2(partsSalesTotal);
            invoiceEntries.push({
                account_number: GL_ACCOUNTS.PARTS_SALES,
                description: `Parts sales - ${reference}`,
                credit_amount: amount,
                debit_amount: 0
            });
            totalInvoiceCredits += amount;
        }

        // Labor Sales
        if (laborTotal !== 0) {
            const amount = round2(laborTotal);
            invoiceEntries.push({
                account_number: GL_ACCOUNTS.LABOR_SALES,
                description: `Labor sales - ${reference}`,
                credit_amount: amount,
                debit_amount: 0
            });
            totalInvoiceCredits += amount;
        }

        // Shop Supplies
        if (finalShopSuppliesTotal !== 0) {
            const amount = round2(finalShopSuppliesTotal);
            invoiceEntries.push({
                account_number: GL_ACCOUNTS.SHOP_SUPPLIES_REVENUE,
                description: `Shop supplies - ${reference}`,
                credit_amount: amount,
                debit_amount: 0
            });
            totalInvoiceCredits += amount;
        }

        // GST
        if (gstTotal !== 0) {
            const amount = round2(gstTotal);
            invoiceEntries.push({
                account_number: GL_ACCOUNTS.GST_RECEIVED,
                description: `GST collected - ${reference}`,
                credit_amount: amount,
                debit_amount: 0
            });
            totalInvoiceCredits += amount;
        }

        // Other Charges
        for (const line of lineItems) {
            if (line.is_other_charge) {
                const ocTotal = parseFloat(line.oc_total || 0);
                if (ocTotal !== 0) {
                    const amount = round2(ocTotal);
                    const account_number = line.gl_account || '4003';
                    
                    // Other charges can be negative (discounts), handling debit/credit accordingly
                    if (amount > 0) {
                        invoiceEntries.push({
                            account_number: account_number,
                            description: `${line.description} - ${reference}`,
                            credit_amount: amount,
                            debit_amount: 0
                        });
                        totalInvoiceCredits += amount;
                    } else {
                        // Negative revenue = Debit
                        const absAmount = Math.abs(amount);
                        invoiceEntries.push({
                            account_number: account_number,
                            description: `${line.description} - ${reference}`,
                            credit_amount: 0,
                            debit_amount: absAmount
                        });
                        totalInvoiceCredits -= absAmount; // Net credit decreases
                    }
                }
            }
        }

        // AR Debit (Full Amount)
        // We set AR Debit exactly equal to totalInvoiceCredits to force balance
        const arDebitAmount = round2(totalInvoiceCredits);
        
        if (arDebitAmount !== 0) {
            const arEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: invoiceDate,
                description: `Invoice Total - ${reference}`,
                reference: reference,
                debit_amount: arDebitAmount,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            
            // Save AR entry
            await base44.asServiceRole.entities.GLTransaction.create(arEntry);
            generatedGLTransactions.push(arEntry);

            // Save Revenue entries
            for (const entry of invoiceEntries) {
                const glEntry = {
                    ...entry,
                    transaction_date: invoiceDate,
                    reference: reference,
                    source_type: 'work_order',
                    source_id: workOrder.id
                };
                await base44.asServiceRole.entities.GLTransaction.create(glEntry);
                generatedGLTransactions.push(glEntry);
            }
        }

        // --- Step 4: Inventory & COGS (unchanged dates, balanced) ---
        if (partsInventoryCost !== 0) {
            const cogsAmount = round2(partsInventoryCost);
            
            const cogsEntry = {
                account_number: GL_ACCOUNTS.COGS,
                transaction_date: invoiceDate,
                description: `Cost of parts sold - ${reference}`,
                reference: reference,
                debit_amount: cogsAmount,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(cogsEntry);
            generatedGLTransactions.push(cogsEntry);

            const inventoryEntry = {
                account_number: GL_ACCOUNTS.INVENTORY,
                transaction_date: invoiceDate,
                description: `Inventory reduction - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: cogsAmount,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(inventoryEntry);
            generatedGLTransactions.push(inventoryEntry);
        }

        // --- Step 5: Process Payments (Gross Method) ---
        // Create individual balanced transactions for each payment
        // Debit Cash/Advance, Credit AR
        
        let totalAdvancePayments = 0;
        let totalOnAccountPayments = 0;
        let totalCashPayments = 0;

        for (const payment of payments) {
            const amount = round2(parseFloat(payment.amount || 0));
            if (amount === 0) continue;

            // Skip "on_account" payments here because they effectively mean "Leave in AR"
            // Since we already debited Full AR in Step 3, doing nothing leaves it in AR.
            if (payment.payment_method === 'on_account') {
                totalOnAccountPayments += amount;
                continue;
            }

            const isAdvance = payment.advance_pmt === true;
            totalAdvancePayments += isAdvance ? amount : 0;
            totalCashPayments += !isAdvance ? amount : 0;

            const debitAccount = isAdvance ? GL_ACCOUNTS.PAYMENTS_IN_ADVANCE : GL_ACCOUNTS.CASH_DRAWER;
            // Use Invoice Date for advance payments (application date), Payment Date for new cash
            const txDate = isAdvance ? invoiceDate : (payment.payment_date || invoiceDate);
            const desc = isAdvance ? `Advance Pmt Applied - ${reference}` : `Payment Received (${payment.payment_method}) - ${reference}`;

            // Debit Cash/Advance
            const debitEntry = {
                account_number: debitAccount,
                transaction_date: txDate,
                description: desc,
                reference: reference,
                debit_amount: amount,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(debitEntry);
            generatedGLTransactions.push(debitEntry);

            // Credit AR
            const creditEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: txDate,
                description: `Payment Applied - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: amount, // Balancing the debit exactly
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(creditEntry);
            generatedGLTransactions.push(creditEntry);
        }

        // Calculate Remaining Balance for summary (Display only, logic handled by GL)
        // AR Debit (Step 3) - AR Credits (Step 5)
        const totalPaymentsApplied = totalAdvancePayments + totalCashPayments;
        const remainingBalance = round2(arDebitAmount - totalPaymentsApplied); // AR Debit - Payment Credits

        console.log(`Generated ${generatedGLTransactions.length} balanced GL transactions`);

        return Response.json({
            success: true,
            accounting_details: JSON.stringify(generatedGLTransactions),
            summary: {
                parts_sales: partsSalesTotal,
                labor_sales: laborTotal,
                shop_supplies: finalShopSuppliesTotal,
                gst: gstTotal,
                inventory_cost: partsInventoryCost,
                advance_payments: totalAdvancePayments,
                on_account_payments: totalOnAccountPayments,
                cash_payments: totalCashPayments,
                remaining_balance: remainingBalance,
                total_transactions: generatedGLTransactions.length
            }
        });

    } catch (error) {
        console.error('Error in handleInvoiceConversionGL:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to process GL transactions' 
        }, { status: 500 });
    }
});