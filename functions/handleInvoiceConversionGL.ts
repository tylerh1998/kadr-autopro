import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workOrder, lineItems, payments, systemSettings, action } = await req.json();

        console.log('--- handleInvoiceConversionGL Invoked ---');
        console.log('Action:', action);
        console.log('Work Order RO:', workOrder?.ro_number);
        console.log('Line Items Count:', lineItems?.length);
        console.log('Payments Count:', payments?.length);
        console.log('Existing Accounting Details:', workOrder?.accounting_details ? 'Present' : 'None');

        if (!workOrder || !lineItems || !payments || !systemSettings || !action) {
            return Response.json({ 
                error: 'Missing required parameters: workOrder, lineItems, payments, systemSettings, action' 
            }, { status: 400 });
        }

        // Define GL Accounts from system settings or defaults
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

        // Step 1: Handle reversal if accounting_details exists (re-conversion scenario)
        if (workOrder.accounting_details && action === 'convert') {
            console.log('--- Detected previous accounting entries, reversing them ---');
            try {
                const previousEntries = JSON.parse(workOrder.accounting_details);
                
                // Reverse all previous entries
                for (const entry of previousEntries) {
                    const reversalEntry = {
                        account_number: entry.account_number,
                        transaction_date: invoiceDate,
                        description: `REVERSAL: ${entry.description}`,
                        reference: reference,
                        debit_amount: entry.credit_amount, // Swap debit and credit
                        credit_amount: entry.debit_amount,
                        source_type: 'work_order',
                        source_id: workOrder.id
                    };
                    
                    await base44.asServiceRole.entities.GLTransaction.create(reversalEntry);
                    generatedGLTransactions.push(reversalEntry);
                }
                
                console.log(`Reversed ${previousEntries.length} previous GL entries`);
            } catch (error) {
                console.error('Error parsing or reversing previous accounting_details:', error);
                // Continue with normal processing even if reversal fails
            }
        }

        // Step 2: Calculate totals from line items and WorkOrder properties
        let partsSalesTotal = 0;
        let laborTotal = 0;
        let partsInventoryCost = 0;

        // Get shop supply total directly from the workOrder object
        const finalShopSuppliesTotal = parseFloat(workOrder.shop_supply_total || 0);

        for (const line of lineItems) {
            if (line.is_other_charge) {
                // Other charges are handled separately
                continue;
            }

            const lineTotParts = parseFloat(line.tot_parts || 0);
            const lineLabor = parseFloat(line.labour || 0);

            partsSalesTotal += lineTotParts;
            laborTotal += lineLabor;

            // Calculate COGS if part is from inventory
            if (line.inventory_item_id && line.qty) {
                const qty = parseFloat(line.qty || 0);
                const costEa = parseFloat(line.cost_ea || 0);
                const basePartCost = qty * costEa;
                
                // Include outstanding cores in cost calculation
                const coreNum = parseFloat(line.Core_num || 0);
                const coreRet = parseFloat(line.core_ret || 0);
                const coreCost = parseFloat(line.core_cost || 0);
                const outstandingCores = coreNum - coreRet;
                const coreCostContribution = outstandingCores * coreCost;
                
                partsInventoryCost += basePartCost + coreCostContribution;
            }
        }

        // GST calculation
        const gstTotal = parseFloat(workOrder.tax_amount || 0);

        console.log('--- Calculated Totals (from WorkOrder entity) ---');
        console.log('Parts Sales:', partsSalesTotal);
        console.log('Labor:', laborTotal);
        console.log('Shop Supplies:', finalShopSuppliesTotal);
        console.log('GST:', gstTotal);
        console.log('Parts Inventory Cost (COGS):', partsInventoryCost);

        // Step 3: Post revenue entries (credits to revenue accounts)
        
        // Parts Sales
        if (partsSalesTotal !== 0) {
            const partsEntry = {
                account_number: GL_ACCOUNTS.PARTS_SALES,
                transaction_date: invoiceDate,
                description: `Parts sales - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: partsSalesTotal,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(partsEntry);
            generatedGLTransactions.push(partsEntry);
        }

        // Labor Sales
        if (laborTotal !== 0) {
            const laborEntry = {
                account_number: GL_ACCOUNTS.LABOR_SALES,
                transaction_date: invoiceDate,
                description: `Labor sales - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: laborTotal,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(laborEntry);
            generatedGLTransactions.push(laborEntry);
        }

        // Shop Supplies Revenue
        if (finalShopSuppliesTotal !== 0) {
            const shopSuppliesEntry = {
                account_number: GL_ACCOUNTS.SHOP_SUPPLIES_REVENUE,
                transaction_date: invoiceDate,
                description: `Shop supplies - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: finalShopSuppliesTotal,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(shopSuppliesEntry);
            generatedGLTransactions.push(shopSuppliesEntry);
        }

        // GST Received
        if (gstTotal !== 0) {
            const gstEntry = {
                account_number: GL_ACCOUNTS.GST_RECEIVED,
                transaction_date: invoiceDate,
                description: `GST collected - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: gstTotal,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(gstEntry);
            generatedGLTransactions.push(gstEntry);
        }

        // Step 4: Post COGS and Inventory entries
        if (partsInventoryCost !== 0) {
            // Debit COGS
            const cogsEntry = {
                account_number: GL_ACCOUNTS.COGS,
                transaction_date: invoiceDate,
                description: `Cost of parts sold - ${reference}`,
                reference: reference,
                debit_amount: partsInventoryCost,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(cogsEntry);
            generatedGLTransactions.push(cogsEntry);

            // Credit Inventory
            const inventoryEntry = {
                account_number: GL_ACCOUNTS.INVENTORY,
                transaction_date: invoiceDate,
                description: `Inventory reduction - ${reference}`,
                reference: reference,
                debit_amount: 0,
                credit_amount: partsInventoryCost,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(inventoryEntry);
            generatedGLTransactions.push(inventoryEntry);
        }

        // Step 5: Post Other Charge entries (credit to their specific GL accounts)
        for (const line of lineItems) {
            if (line.is_other_charge) {
                const ocTotal = parseFloat(line.oc_total || 0);
                if (ocTotal !== 0) {
                    // Fallback to '4000' if no GL account is specified to ensure GL balance
                    const account_number = line.gl_account || '4003';
                    
                    const ocEntry = {
                        account_number: account_number,
                        transaction_date: invoiceDate,
                        description: `${line.description} - ${reference}`,
                        reference: reference,
                        debit_amount: 0,
                        credit_amount: ocTotal,
                        source_type: 'work_order',
                        source_id: workOrder.id
                    };
                    await base44.asServiceRole.entities.GLTransaction.create(ocEntry);
                    generatedGLTransactions.push(ocEntry);
                }
            }
        }

        // Step 6: Post payment entries
        let totalAdvancePayments = 0;
        let totalOnAccountPayments = 0;
        let totalCashPayments = 0;

        for (const payment of payments) {
            const amount = parseFloat(payment.amount || 0);
            
            if (amount === 0) continue;

            if (payment.advance_pmt === true) {
                // Advance payment - debit Payments in Advance
                totalAdvancePayments += amount;
            } else if (payment.payment_method === 'on_account') {
                // On account payment - debit Accounts Receivable
                totalOnAccountPayments += amount;
            } else {
                // Regular payment - debit Cash Drawer
                totalCashPayments += amount;
            }
        }

        // Post advance payments
        if (totalAdvancePayments !== 0) {
            const advanceEntry = {
                account_number: GL_ACCOUNTS.PAYMENTS_IN_ADVANCE,
                transaction_date: invoiceDate,
                description: `Advance payments applied - ${reference}`,
                reference: reference,
                debit_amount: totalAdvancePayments,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(advanceEntry);
            generatedGLTransactions.push(advanceEntry);
        }

        // Post on account payments
        if (totalOnAccountPayments !== 0) {
            const arEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: invoiceDate,
                description: `AR payment - ${reference}`,
                reference: reference,
                debit_amount: totalOnAccountPayments,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(arEntry);
            generatedGLTransactions.push(arEntry);
        }

        // Post cash payments
        if (totalCashPayments !== 0) {
            const cashEntry = {
                account_number: GL_ACCOUNTS.CASH_DRAWER,
                transaction_date: invoiceDate,
                description: `Payment received - ${reference}`,
                reference: reference,
                debit_amount: totalCashPayments,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(cashEntry);
            generatedGLTransactions.push(cashEntry);
        }

        // Step 7: Calculate remaining balance and post to AR if there's an outstanding balance
        const totalRevenue = partsSalesTotal + laborTotal + finalShopSuppliesTotal + gstTotal + 
                            lineItems.filter(l => l.is_other_charge).reduce((sum, l) => sum + parseFloat(l.oc_total || 0), 0);
        const totalPayments = totalAdvancePayments + totalOnAccountPayments + totalCashPayments;
        const remainingBalance = totalRevenue - totalPayments;

        console.log('--- Payment Summary ---');
        console.log('Total Revenue:', totalRevenue);
        console.log('Total Payments:', totalPayments);
        console.log('Remaining Balance:', remainingBalance);

        if (remainingBalance > 0.01) { // Use small threshold to avoid floating point issues
            const arBalanceEntry = {
                account_number: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                transaction_date: invoiceDate,
                description: `Outstanding balance - ${reference}`,
                reference: reference,
                debit_amount: remainingBalance,
                credit_amount: 0,
                source_type: 'work_order',
                source_id: workOrder.id
            };
            await base44.asServiceRole.entities.GLTransaction.create(arBalanceEntry);
            generatedGLTransactions.push(arBalanceEntry);
        }

        console.log(`--- Generated ${generatedGLTransactions.length} GL transactions ---`);

        // Calculate total debits and credits
        const totalDebits = generatedGLTransactions.reduce((sum, t) => sum + (t.debit_amount || 0), 0);
        const totalCredits = generatedGLTransactions.reduce((sum, t) => sum + (t.credit_amount || 0), 0);

        console.log('Total Debits:', totalDebits.toFixed(2));
        console.log('Total Credits:', totalCredits.toFixed(2));

        // Check for balance
        const balanceDifference = Math.abs(totalDebits - totalCredits);
        if (balanceDifference > 0.02) { // Allow small floating point difference
            console.error(`ACCOUNTING ERROR: Invoice conversion imbalance for WO ${workOrder.ro_number} (ID: ${workOrder.id}). Debits: ${totalDebits}, Credits: ${totalCredits}, Diff: ${balanceDifference}`);
            console.error('Transactions:', JSON.stringify(generatedGLTransactions, null, 2));
            
            return Response.json({ 
                success: false, 
                error: "An accounting error has occured. Please advise the system administrator of this invoice.",
                details: {
                    debits: totalDebits,
                    credits: totalCredits,
                    difference: balanceDifference
                }
            }, { status: 400 });
        }

        // Return the accounting details as a JSON string
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
        console.error('--- Error in handleInvoiceConversionGL ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to process GL transactions' 
        }, { status: 500 });
    }
});