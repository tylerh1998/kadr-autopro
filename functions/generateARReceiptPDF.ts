import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { format } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { paymentId } = await req.json();
        
        if (!paymentId) {
            return Response.json({ error: 'Missing paymentId parameter' }, { status: 400 });
        }

        console.log('generateARReceiptPDF: Processing payment ID:', paymentId);

        // Fetch the payment record
        const payment = await base44.asServiceRole.entities.CustomerPayments.get(paymentId);
        if (!payment) {
            return Response.json({ error: 'Payment not found' }, { status: 404 });
        }

        console.log('generateARReceiptPDF: Found payment:', payment);

        // Fetch the customer details
        const customer = await base44.asServiceRole.entities.Customer.get(payment.customer_id);
        if (!customer) {
            return Response.json({ error: 'Customer not found' }, { status: 404 });
        }

        console.log('generateARReceiptPDF: Found customer:', customer.first_name, customer.last_name);

        // Parse ar_applyto to get applied items
        const arApplyTo = payment.ar_applyto || '';
        const appliedDetails = [];

        if (arApplyTo) {
            const entries = arApplyTo.split(',').filter(e => e.trim());

            for (const entry of entries) {
                const [recordId, amountStr] = entry.split(':');
                const amount = parseFloat(amountStr);

                if (!recordId || isNaN(amount)) continue;

                // Try to fetch as CustomerPayments (invoice)
                try {
                    const customerPayment = await base44.asServiceRole.entities.CustomerPayments.get(recordId);
                    if (customerPayment) {
                        let description = customerPayment.notes || 'Invoice';
                        if (customerPayment.work_order_id) {
                            try {
                                const wo = await base44.asServiceRole.entities.WorkOrder.get(customerPayment.work_order_id);
                                if (wo) description = wo.description || description;
                            } catch (e) {
                                console.warn('Could not fetch work order:', e);
                            }
                        }

                        appliedDetails.push({
                            type: 'Invoice',
                            reference: customerPayment.invoice_number || '',
                            date: customerPayment.payment_date,
                            description: description,
                            amountApplied: amount
                        });
                        continue;
                    }
                } catch (e) {
                    // Not a payment, try adjustment
                }

                // Try to fetch as CustomerARAdjustment
                try {
                    const adjustment = await base44.asServiceRole.entities.CustomerARAdjustment.get(recordId);
                    if (adjustment) {
                        appliedDetails.push({
                            type: adjustment.amount > 0 ? 'Charge' : 'Credit',
                            reference: adjustment.reference || '',
                            date: adjustment.adjustment_date,
                            description: adjustment.description || 'Adjustment',
                            amountApplied: amount
                        });
                    }
                } catch (e) {
                    console.warn('Could not fetch record:', recordId, e);
                }
            }
        }

        console.log('generateARReceiptPDF: Applied details:', appliedDetails);

        // Create PDF
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = 215.9;
        const margin = 20;
        let yPosition = 20;

        // Company Header
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text("Ken's Auto & Diesel Repair", margin, yPosition);
        yPosition += 6;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text("5002 49 Ave • PO Box 160", margin, yPosition);
        yPosition += 5;
        doc.text("Dewberry, AB T0B 1G0", margin, yPosition);
        yPosition += 5;
        doc.text("Phone: 780-847-3002 | Fax: 780-847-3004", margin, yPosition);
        yPosition += 5;
        doc.text("Email: Shop@kensauto.ca | Website: www.kensauto.ca", margin, yPosition);
        yPosition += 15;

        // Two-column layout: Customer Info (left) and Payment Summary (right)
        const columnStartY = yPosition;
        const leftColumnX = margin;
        const rightColumnX = pageWidth / 2 + 5;
        const columnWidth = (pageWidth / 2) - margin - 10;

        // Left Column - Customer Information
        yPosition = columnStartY;
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text("Customer:", leftColumnX, yPosition);
        doc.setFont(undefined, 'normal');
        yPosition += 6;
        
        const customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        doc.setFontSize(10);
        doc.text(customerName, leftColumnX + 5, yPosition);
        yPosition += 6;
        
        if (customer.org_name && (customer.first_name || customer.last_name)) {
            const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
            doc.text(`Contact: ${contactName}`, leftColumnX + 5, yPosition);
            yPosition += 6;
        }
        
        if (customer.address) {
            doc.text(customer.address, leftColumnX + 5, yPosition);
            yPosition += 6;
        }
        
        if (customer.city && customer.state) {
            doc.text(`${customer.city}, ${customer.state} ${customer.zip_code || ''}`, leftColumnX + 5, yPosition);
            yPosition += 6;
        }
        
        if (customer.phone) {
            doc.text(`Phone: ${customer.phone}`, leftColumnX + 5, yPosition);
            yPosition += 6;
        }

        // Right Column - Payment Receipt Box
        yPosition = columnStartY;
        
        // Box title
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text("Payment Receipt", rightColumnX, yPosition);
        yPosition += 3;
        
        // Payment Summary Box
        const boxHeight = 45;
        doc.setFillColor(245, 245, 245);
        doc.rect(rightColumnX, yPosition, columnWidth, boxHeight, 'F');
        
        yPosition += 8;
        doc.setFontSize(9);
        
        // Payment Date
        doc.setFont(undefined, 'bold');
        doc.text("Payment Date:", rightColumnX + 3, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(format(new Date(payment.payment_date), 'MMM d, yyyy'), rightColumnX + 32, yPosition);
        yPosition += 7;

        // Payment Method
        const formatPaymentMethod = (method) => {
            if (!method) return 'Unknown';
            return method.replace(/_/g, ' ').split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
        };
        
        doc.setFont(undefined, 'bold');
        doc.text("Payment Method:", rightColumnX + 3, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(formatPaymentMethod(payment.payment_method), rightColumnX + 32, yPosition);
        yPosition += 7;

        // Reference (if exists)
        if (payment.reference) {
            doc.setFont(undefined, 'bold');
            doc.text("Reference:", rightColumnX + 3, yPosition);
            doc.setFont(undefined, 'normal');
            doc.text(payment.reference, rightColumnX + 32, yPosition);
            yPosition += 7;
        } else {
            yPosition += 7; // Keep spacing consistent
        }

        // Total Payment
        doc.setFont(undefined, 'bold');
        doc.text("Total Payment:", rightColumnX + 3, yPosition);
        doc.setFontSize(11);
        doc.text(`$${(payment.amount || 0).toFixed(2)}`, rightColumnX + 32, yPosition);
        doc.setFontSize(9);

        // Move yPosition below both columns
        yPosition = columnStartY + boxHeight + 15;

        // Applied To Section
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text("Applied To:", margin, yPosition);
        yPosition += 8;

        if (appliedDetails.length > 0) {
            // Table Header
            doc.setFillColor(230, 230, 230);
            doc.rect(margin, yPosition - 5, pageWidth - (margin * 2), 8, 'F');
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text("Type", margin + 2, yPosition);
            doc.text("Reference", margin + 25, yPosition);
            doc.text("Date", margin + 55, yPosition);
            doc.text("Description", margin + 85, yPosition);
            doc.text("Amount Applied", pageWidth - margin - 35, yPosition);
            
            yPosition += 8;
            doc.setFont(undefined, 'normal');

            // Table Rows
            let totalApplied = 0;
            for (const detail of appliedDetails) {
                // Check if we need a new page
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }

                doc.text(detail.type, margin + 2, yPosition);
                doc.text(detail.reference, margin + 25, yPosition);
                doc.text(format(new Date(detail.date), 'MMM d, yyyy'), margin + 55, yPosition);
                
                // Wrap description if too long
                const descriptionWidth = 60;
                const descriptionLines = doc.splitTextToSize(detail.description, descriptionWidth);
                doc.text(descriptionLines[0], margin + 85, yPosition);
                
                doc.text(`$${detail.amountApplied.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });
                
                totalApplied += detail.amountApplied;
                yPosition += 7;
            }

            // Total Applied Row
            yPosition += 2;
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, yPosition - 5, pageWidth - (margin * 2), 8, 'F');
            
            doc.setFont(undefined, 'bold');
            doc.text("Total Applied:", pageWidth - margin - 45, yPosition);
            doc.text(`$${totalApplied.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });
        } else {
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.text("No payment application details available.", margin + 5, yPosition);
        }

        // Footer
        yPosition = 270;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text("Thank you for your business!", pageWidth / 2, yPosition, { align: 'center' });

        const pdfBytes = doc.output('arraybuffer');

        // Create filename
        const customerNameForFile = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        const dateForFile = format(new Date(payment.payment_date), 'yyyy-MM-dd');
        const filename = `PaymentReceipt_${customerNameForFile}_${dateForFile}.pdf`;

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=${filename}`
            }
        });

    } catch (error) {
        console.error('Error in generateARReceiptPDF:', error);
        return Response.json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        }, { status: 500 });
    }
});