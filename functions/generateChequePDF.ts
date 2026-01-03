import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { format } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { chequeReference } = await req.json();
        
        if (!chequeReference) {
            return Response.json({ error: 'Missing chequeReference parameter' }, { status: 400 });
        }

        console.log('generateChequePDF: Processing cheque reference:', chequeReference);

        // Fetch the supplier payment record using the cheque reference
        const payments = await base44.asServiceRole.entities.SupplierPayment.filter({
            cheque_number: chequeReference
        });

        if (!payments || payments.length === 0) {
            return Response.json({ error: 'No payment found for this cheque reference' }, { status: 404 });
        }

        const payment = payments[0];
        console.log('generateChequePDF: Found payment:', payment);

        // Fetch the supplier details
        const supplier = await base44.asServiceRole.entities.Supplier.get(payment.supplier_id);
        if (!supplier) {
            return Response.json({ error: 'Supplier not found' }, { status: 404 });
        }

        console.log('generateChequePDF: Found supplier:', supplier.name);

        // Parse the invoice_number JSON field to get applied invoices
        let appliedInvoices = [];
        try {
            appliedInvoices = JSON.parse(payment.invoice_number || '[]');
        } catch (error) {
            console.error('Error parsing invoice_number JSON:', error);
            appliedInvoices = [];
        }

        console.log('generateChequePDF: Applied invoices:', appliedInvoices);

        // Create PDF (8.5 x 11 inches = 215.9 x 279.4 mm)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = 215.9;
        const chequeHeight = 93.13; // One third of page height
        
        // Format date as "Oct 19, 2025"
        const formattedDate = format(new Date(payment.payment_date), 'MMM dd, yyyy');

        // ===== TOP SECTION - CHEQUE =====
        const chequeTop = 0;
        
        // Date (top right)
        doc.setFontSize(10);
        doc.text(formattedDate, pageWidth - 40, chequeTop + 15, { align: 'right' });

        // Amount in words (left side, middle area)
        const amountInWords = numberToWords(payment.amount);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(`***** ${amountInWords} *****`, 20, chequeTop + 40);
        doc.setFont(undefined, 'normal');

        // Amount in numbers (right side, middle area)
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('$' + payment.amount.toFixed(2), pageWidth - 20, chequeTop + 40, { align: 'right' });
        doc.setFont(undefined, 'normal');

        // Supplier name and address (moved up 5mm)
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(supplier.name.toUpperCase(), 20, chequeTop + 55);
        doc.setFont(undefined, 'normal');
        
        if (supplier.address) {
            doc.setFontSize(9);
            doc.text(supplier.address.toUpperCase(), 20, chequeTop + 61);
        }
        if (supplier.town && supplier.province && supplier.postal_code) {
            doc.setFontSize(9);
            doc.text(`${supplier.town.toUpperCase()}, ${supplier.province.toUpperCase()} ${supplier.postal_code.toUpperCase()}`, 20, chequeTop + 67);
        }

        // ===== MIDDLE STUB =====
        const stub1Top = chequeHeight;
        renderStub(doc, stub1Top, supplier, payment, appliedInvoices, formattedDate, pageWidth);

        // ===== BOTTOM STUB =====
        const stub2Top = chequeHeight * 2;
        renderStub(doc, stub2Top, supplier, payment, appliedInvoices, formattedDate, pageWidth);

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=cheque_${payment.cheque_number}.pdf`
            }
        });

    } catch (error) {
        console.error('Error in generateChequePDF:', error);
        return Response.json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        }, { status: 500 });
    }
});

// Helper function to render a stub section
function renderStub(doc, startY, supplier, payment, appliedInvoices, formattedDate, pageWidth) {
    // Date and amount (right)
    doc.setFontSize(10);
    doc.text(formattedDate, pageWidth - 60, startY + 10);
    doc.text(payment.amount.toFixed(2), pageWidth - 20, startY + 10, { align: 'right' });

    // Supplier name
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(supplier.name.toUpperCase(), 20, startY + 18);
    doc.setFont(undefined, 'normal');

    // Invoice list (removed "Date Recorded" line)
    if (appliedInvoices && appliedInvoices.length > 0) {
        doc.setFontSize(8);
        
        // Calculate how many invoices fit in each column (approximately 10 lines per column)
        const maxInvoicesPerColumn = 10;
        const columnWidth = 60;
        const column1X = 20;
        const column2X = column1X + columnWidth;
        const column3X = column2X + columnWidth;
        
        let yPosition = startY + 28;
        let currentColumn = 0;
        let currentColumnX = column1X;
        let invoiceCount = 0;
        
        for (const inv of appliedInvoices) {
            // Check if we need to move to next column
            if (invoiceCount >= maxInvoicesPerColumn) {
                currentColumn++;
                invoiceCount = 0;
                yPosition = startY + 28;
                
                if (currentColumn === 1) {
                    currentColumnX = column2X;
                } else if (currentColumn === 2) {
                    currentColumnX = column3X;
                } else {
                    // If we run out of columns, just continue in the last column
                    currentColumnX = column3X;
                }
            }
            
            // Print invoice line
            doc.text(`Inv: ${inv.invoice_number}`, currentColumnX, yPosition);
            doc.text(`$${inv.amount_applied.toFixed(2)}`, currentColumnX + 35, yPosition, { align: 'right' });
            
            yPosition += 5;
            invoiceCount++;
        }
    }
}

// Helper function to convert number to words
function numberToWords(amount) {
    const dollars = Math.floor(amount);
    const cents = Math.round((amount - dollars) * 100);
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    function convertLessThanThousand(n) {
        if (n === 0) return '';
        if (n < 10) return ones[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
    }
    
    if (dollars === 0) {
        return `Zero`;
    }
    
    let result = '';
    
    if (dollars >= 1000000) {
        result += convertLessThanThousand(Math.floor(dollars / 1000000)) + ' Million ';
        dollars %= 1000000;
    }
    
    if (dollars >= 1000) {
        result += convertLessThanThousand(Math.floor(dollars / 1000)) + ' Thousand ';
        dollars %= 1000;
    }
    
    if (dollars > 0) {
        result += convertLessThanThousand(dollars);
    }
    
    return `${result.trim()} and ${cents.toString().padStart(2, '0')}`;
}