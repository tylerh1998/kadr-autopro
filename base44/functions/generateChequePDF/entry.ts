import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { jsPDF } from 'npm:jspdf@2.5.2';
import { format } from 'npm:date-fns@3.6.0';

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

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const { data: payment, error: paymentError } = await supabase
            .from('SupplierPayment')
            .select('*')
            .eq('cheque_number', String(chequeReference))
            .limit(1)
            .single();

        if (paymentError || !payment) {
            return Response.json({ error: 'No payment found for this cheque reference' }, { status: 404 });
        }

        const { data: supplier, error: supplierError } = await supabase
            .from('Supplier')
            .select('*')
            .eq('id', payment.supplier_id)
            .single();

        if (supplierError || !supplier) {
            return Response.json({ error: 'Supplier not found' }, { status: 404 });
        }

        let appliedInvoices = [];
        try {
            appliedInvoices = JSON.parse(payment.invoice_number || '[]');
        } catch (error) {
            console.error('Error parsing invoice_number JSON:', error);
            appliedInvoices = [];
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = 215.9;
        const chequeHeight = 93.13;
        const formattedDate = format(new Date(payment.payment_date), 'MMM dd, yyyy');
        const amount = parseFloat(payment.amount) || 0;
        const chequeTop = 0;

        doc.setFontSize(10);
        doc.text(formattedDate, pageWidth - 40, chequeTop + 15, { align: 'right' });

        const amountInWords = numberToWords(amount);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(`***** ${amountInWords} *****`, 20, chequeTop + 40);
        doc.setFont(undefined, 'normal');

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('$' + amount.toFixed(2), pageWidth - 20, chequeTop + 40, { align: 'right' });
        doc.setFont(undefined, 'normal');

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

        const stub1Top = chequeHeight;
        renderStub(doc, stub1Top, supplier, { ...payment, amount }, appliedInvoices, formattedDate, pageWidth);

        const stub2Top = chequeHeight * 2;
        renderStub(doc, stub2Top, supplier, { ...payment, amount }, appliedInvoices, formattedDate, pageWidth);

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

function renderStub(doc, startY, supplier, payment, appliedInvoices, formattedDate, pageWidth) {
    doc.setFontSize(10);
    doc.text(formattedDate, pageWidth - 60, startY + 10);
    doc.text(payment.amount.toFixed(2), pageWidth - 20, startY + 10, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(supplier.name.toUpperCase(), 20, startY + 18);
    doc.setFont(undefined, 'normal');

    if (appliedInvoices && appliedInvoices.length > 0) {
        doc.setFontSize(8);

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
            if (invoiceCount >= maxInvoicesPerColumn) {
                currentColumn++;
                invoiceCount = 0;
                yPosition = startY + 28;

                if (currentColumn === 1) {
                    currentColumnX = column2X;
                } else if (currentColumn === 2) {
                    currentColumnX = column3X;
                } else {
                    currentColumnX = column3X;
                }
            }

            doc.text(`Inv: ${inv.invoice_number}`, currentColumnX, yPosition);
            doc.text(`$${inv.amount_applied.toFixed(2)}`, currentColumnX + 35, yPosition, { align: 'right' });

            yPosition += 5;
            invoiceCount++;
        }
    }
}

function numberToWords(amount) {
    let dollars = Math.floor(amount);
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
        return 'Zero';
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