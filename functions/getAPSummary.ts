import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all active suppliers
        const suppliers = await base44.asServiceRole.entities.Supplier.filter({});

        if (!suppliers || suppliers.length === 0) {
            return Response.json({
                success: true,
                data: []
            });
        }

        // Fetch ALL invoice lines for all suppliers in one query
        const allInvoiceLines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({});

        // Group invoice lines by supplier
        const supplierLinesMap = new Map();
        allInvoiceLines.forEach(line => {
            if (!supplierLinesMap.has(line.supplier_id)) {
                supplierLinesMap.set(line.supplier_id, []);
            }
            supplierLinesMap.get(line.supplier_id).push(line);
        });

        // Process each supplier to create conceptual invoices
        const suppliersWithInvoices = suppliers.map(supplier => {
            const lines = supplierLinesMap.get(supplier.id) || [];
            
            // Group lines into conceptual invoices (by invoice_number + invoice_date)
            const invoiceGroups = new Map();
            
            lines.forEach(line => {
                const key = `${line.invoice_number}_${line.invoice_date}`;
                if (!invoiceGroups.has(key)) {
                    invoiceGroups.set(key, []);
                }
                invoiceGroups.get(key).push(line);
            });

            // Create conceptual invoices with proper rounding
            const conceptualInvoices = Array.from(invoiceGroups.values()).map(invoiceLines => {
                const firstLine = invoiceLines[0];
                
                // Calculate totals with 2-decimal rounding
                const subtotal = Math.round(invoiceLines.reduce((sum, l) => sum + (l.purchase_amount || 0), 0) * 100) / 100;
                const tax_amount = Math.round(invoiceLines.reduce((sum, l) => sum + (l.gst_amount || 0), 0) * 100) / 100;
                const total_amount = Math.round((subtotal + tax_amount) * 100) / 100;
                const amount_paid = Math.round(invoiceLines.reduce((sum, l) => sum + (l.paid_amount || 0), 0) * 100) / 100;
                const balance_due = Math.round((total_amount - amount_paid) * 100) / 100;

                return {
                    supplier_id: firstLine.supplier_id,
                    invoice_number: firstLine.invoice_number,
                    invoice_date: firstLine.invoice_date,
                    line_count: invoiceLines.length,
                    subtotal,
                    tax_amount,
                    total_amount,
                    amount_paid,
                    balance_due
                };
            });

            return {
                supplier,
                conceptualInvoices
            };
        });

        return Response.json({
            success: true,
            data: suppliersWithInvoices
        });

    } catch (error) {
        console.error('Error in getAPSummary:', error);
        return Response.json({
            success: false,
            error: error.message || 'Internal server error'
        }, { status: 500 });
    }
});