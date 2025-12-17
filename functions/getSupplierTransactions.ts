import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    console.log('--- getSupplierTransactions: Function invoked ---');
    
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate the user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const { supplierId, dateRange } = await req.json();
        
        if (!supplierId) {
            return Response.json({ error: 'supplierId is required' }, { status: 400 });
        }

        console.log(`Fetching data for supplier: ${supplierId}`);
        console.log(`Date range: ${dateRange?.from || 'N/A'} to ${dateRange?.to || 'N/A'}`);

        // Convert dateRange strings to Date objects if provided
        let fromDate = null;
        let toDate = null;
        if (dateRange?.from && dateRange?.to) {
            fromDate = new Date(dateRange.from);
            toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999); // End of day
        }

        // Fetch supplier data using service role
        console.log('Fetching supplier...');
        const supplierData = await base44.asServiceRole.entities.Supplier.get(supplierId);

        // Fetch chart of accounts
        console.log('Fetching chart of accounts...');
        const chartOfAccountsData = await base44.asServiceRole.entities.ChartOfAccount.list('account_number');

        // Fetch all supplier invoice lines for this supplier
        console.log('Fetching supplier invoice lines...');
        const allLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({ 
            supplier_id: supplierId 
        });

        // Fetch all payments for this supplier (for Payment History tab)
        console.log('Fetching supplier payments...');
        const paymentsData = await base44.asServiceRole.entities.SupplierPayment.filter({ 
            supplier_id: supplierId 
        });

        console.log(`Total lines fetched: ${allLines.length}`);
        console.log(`Total payments fetched: ${paymentsData.length}`);

        // Group lines by (supplier_id, invoice_number, invoice_date) to create conceptual invoices
        const invoiceMap = {};
        
        allLines.forEach(line => {
            const key = `${line.supplier_id}_${line.invoice_number}_${line.invoice_date}`;
            
            if (!invoiceMap[key]) {
                invoiceMap[key] = {
                    supplier_id: line.supplier_id,
                    invoice_number: line.invoice_number,
                    invoice_date: line.invoice_date,
                    lines: [],
                    subtotal: 0,
                    tax_amount: 0,
                    total_amount: 0,
                    amount_paid: 0,
                    balance_due: 0,
                    line_count: 0
                };
            }
            
            // Add line to invoice
            invoiceMap[key].lines.push(line);
            invoiceMap[key].line_count++;
            
            // Calculate totals
            const linePurchaseAmount = parseFloat(line.purchase_amount || 0);
            const lineGstAmount = parseFloat(line.gst_amount || 0);
            const linePaidAmount = parseFloat(line.paid_amount || 0);
            
            invoiceMap[key].subtotal += linePurchaseAmount;
            invoiceMap[key].tax_amount += lineGstAmount;
            invoiceMap[key].total_amount += linePurchaseAmount + lineGstAmount;
            
            // NEW: Calculate amount_paid directly from SupplierInvoiceLine.paid_amount
            invoiceMap[key].amount_paid += linePaidAmount;
        });

        // Convert to array
        let conceptualInvoices = Object.values(invoiceMap);

        console.log(`Created ${conceptualInvoices.length} conceptual invoices from lines`);

        // Calculate balance_due for each invoice
        conceptualInvoices.forEach(invoice => {
            invoice.balance_due = invoice.total_amount - invoice.amount_paid;
            
            // Round all monetary values to 2 decimal places
            invoice.subtotal = Math.round(invoice.subtotal * 100) / 100;
            invoice.tax_amount = Math.round(invoice.tax_amount * 100) / 100;
            invoice.total_amount = Math.round(invoice.total_amount * 100) / 100;
            invoice.amount_paid = Math.round(invoice.amount_paid * 100) / 100;
            invoice.balance_due = Math.round(invoice.balance_due * 100) / 100;
        });

        // Calculate total current balance (sum of all balance_due)
        let currentBalance = conceptualInvoices.reduce((sum, inv) => sum + inv.balance_due, 0);
        currentBalance = Math.round(currentBalance * 100) / 100;

        // Filter conceptual invoices by date range if provided
        let invoicesInDateRange = conceptualInvoices;
        if (fromDate && toDate) {
            invoicesInDateRange = conceptualInvoices.filter(invoice => {
                const invoiceDate = new Date(invoice.invoice_date);
                return invoiceDate >= fromDate && invoiceDate <= toDate;
            });
        }

        console.log(`Invoices in date range: ${invoicesInDateRange.length}`);

        // Extract all lines from invoices in date range for the invoice lines tab
        const linesInDateRange = invoicesInDateRange.flatMap(inv => 
            inv.lines.map(line => ({
                ...line,
                invoice_number: inv.invoice_number,
                invoice_date: inv.invoice_date,
                charge: line.purchase_amount || 0,
                gst: line.gst_amount || 0,
                line_total: (line.purchase_amount || 0) + (line.gst_amount || 0)
            }))
        );

        // For payment history, we need ALL lines (enriched with charge, gst, line_total)
        const allLinesEnriched = allLines.map(line => ({
            ...line,
            charge: line.purchase_amount || 0,
            gst: line.gst_amount || 0,
            line_total: (line.purchase_amount || 0) + (line.gst_amount || 0)
        }));

        // Calculate date range total
        const dateRangeTotal = linesInDateRange.reduce((sum, line) => 
            sum + parseFloat(line.line_total || 0), 0
        );

        console.log('Data aggregation complete. Returning response...');

        // Return all aggregated data
        return Response.json({
            success: true,
            data: {
                supplier: supplierData,
                chartOfAccounts: chartOfAccountsData,
                payments: paymentsData,
                conceptualInvoices: invoicesInDateRange, // Filtered by date range
                allConceptualInvoices: conceptualInvoices, // All invoices for balance calculation
                invoiceLines: linesInDateRange, // Lines for the invoice lines tab (filtered by date)
                allInvoiceLines: allLinesEnriched, // All lines for payment history (not filtered by date)
                currentBalance: currentBalance,
                dateRangeTotal: Math.round(dateRangeTotal * 100) / 100
            }
        });

    } catch (error) {
        console.error('--- Error in getSupplierTransactions ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to fetch supplier transactions' 
        }, { status: 500 });
    }
});