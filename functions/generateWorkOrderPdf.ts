import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { jsPDF } from "npm:jspdf@2.5.2";

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68c2336578e56a2a43619143/c30ea97f0_image.png';

async function loadImageAsBase64(url) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64;
    } catch (error) {
        console.error('Error loading image:', error);
        return null;
    }
}

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workOrder, customer, vehicle, lineItems } = await req.json();

        if (!workOrder) {
            return Response.json({ error: 'Work Order data missing' }, { status: 400 });
        }

        // Initialize PDF
        const doc = new jsPDF('p', 'pt', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        const contentWidth = pageWidth - (margin * 2);

        // Load logo
        const logoImg = await loadImageAsBase64(LOGO_URL);

        let currentY = margin;

        // Helper: Add Header
        function addHeader(isFirst = false) {
            currentY = margin;
            
            // Logo
            if (logoImg) {
                try {
                    doc.addImage(logoImg, 'PNG', margin, currentY, 80, 60);
                } catch (e) {
                    console.error("Error adding logo:", e);
                }
            }

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text("Ken's Auto & Diesel Repair", margin + 100, currentY + 15);
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('5002 49 Ave • PO Box 160', margin + 100, currentY + 30);
            doc.text('Dewberry, AB T0B 1G0', margin + 100, currentY + 42);
            doc.text('Phone: 780-847-3002        Fax: 780-847-3004', margin + 100, currentY + 54);
            doc.text('Email: Shop@kensauto.ca        Website: www.kensauto.ca', margin + 100, currentY + 66);

            // Document Title
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            
            let title = 'WORK ORDER';
            let refNumber = workOrder.wo_number || workOrder.ro_number || 'N/A';
            let refDate = workOrder.wo_date;

            if (workOrder.stage === 'estimate') {
                title = 'ESTIMATE';
                refNumber = workOrder.est_number || refNumber;
                refDate = workOrder.est_date || refDate;
            } else if (workOrder.stage === 'invoice') {
                title = 'INVOICE';
                refNumber = workOrder.inv_number || refNumber;
                refDate = workOrder.invoice_date || refDate;
            } else if (workOrder.stage === 'credit_invoice') {
                title = 'CREDIT INVOICE';
                refNumber = workOrder.crinv_number || refNumber;
                refDate = workOrder.invoice_date || refDate;
            }

            const titleWidth = doc.getTextWidth(title);
            doc.text(title, pageWidth - margin - titleWidth, currentY + 15);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const refWidth = doc.getTextWidth(refNumber);
            doc.text(refNumber, pageWidth - margin - refWidth, currentY + 35);

            if (refDate) {
                // Parse date string carefully to avoid timezone issues
                let dateStr = 'N/A';
                try {
                    const [y, m, d] = refDate.split('-').map(Number);
                    const localDate = new Date(y, m - 1, d);
                    dateStr = localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                } catch (e) {
                    dateStr = refDate;
                }
                const dateWidth = doc.getTextWidth(`Date: ${dateStr}`);
                doc.text(`Date: ${dateStr}`, pageWidth - margin - dateWidth, currentY + 50);
            }

            // Line
            doc.setDrawColor(0);
            doc.setLineWidth(2);
            doc.line(margin, currentY + 80, pageWidth - margin, currentY + 80);

            currentY = currentY + 100;

            // Customer/Vehicle Info (First page only)
            if (isFirst) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Customer Information', margin, currentY);
                doc.text('Vehicle Information', margin + 280, currentY);

                currentY += 5;
                doc.setLineWidth(1);
                doc.line(margin, currentY, margin + 200, currentY);
                doc.line(margin + 280, currentY, margin + 480, currentY);

                currentY += 15;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');

                // Customer Info
                let customerY = currentY;
                const customerName = customer?.org_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'N/A';
                
                doc.setFont('helvetica', 'bold');
                doc.text(`Name: `, margin, customerY);
                doc.setFont('helvetica', 'normal');
                doc.text(customerName, margin + 40, customerY);

                if (customer?.email) {
                    customerY += 15;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Email: ', margin, customerY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(customer.email, margin + 40, customerY);
                }

                if (customer?.address) {
                    customerY += 15;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Address: ', margin, customerY);
                    doc.setFont('helvetica', 'normal');
                    // Simple address formatting
                    const addressStr = `${customer.address || ''} ${customer.city ? ', ' + customer.city : ''}`.trim();
                    doc.text(addressStr, margin + 40, customerY);
                }

                // Vehicle Info
                let vehicleY = currentY;
                if (vehicle) {
                    doc.setFont('helvetica', 'bold');
                    doc.text('Vehicle: ', margin + 280, vehicleY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`, margin + 325, vehicleY);

                    if (vehicle.vin) {
                        vehicleY += 15;
                        doc.setFont('helvetica', 'bold');
                        doc.text('VIN: ', margin + 280, vehicleY);
                        doc.setFont('helvetica', 'normal');
                        doc.text(vehicle.vin, margin + 310, vehicleY);
                    }

                    if (vehicle.license_plate) {
                        vehicleY += 15;
                        doc.setFont('helvetica', 'bold');
                        doc.text('License: ', margin + 280, vehicleY);
                        doc.setFont('helvetica', 'normal');
                        doc.text(vehicle.license_plate, margin + 325, vehicleY);
                    }
                    
                    if (workOrder.odometer) {
                         vehicleY += 15;
                         doc.setFont('helvetica', 'bold');
                         doc.text('Odometer: ', margin + 280, vehicleY);
                         doc.setFont('helvetica', 'normal');
                         doc.text(workOrder.odometer.toString(), margin + 335, vehicleY);
                    }
                }

                currentY = Math.max(customerY, vehicleY) + 25;
            }
        }

        // Helper: Add Footer
        function addFooter() {
            const pageNumberSpace = 40;
            const footerHeight = 250; 
            const footerStartY = pageHeight - pageNumberSpace - footerHeight;

            // Warranty Box
            doc.setFillColor(255, 255, 255);
            doc.rect(margin, footerStartY, contentWidth, 70, 'S');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');

            const warrantyTextLines = [
                'IF YOUR WHEELS HAVE BEEN REMOVED for any service performed, your wheels have been torqued to manufacturer\'s specifications. Ken\'s Auto reminds you that wheel nut tightness should be re-checked in the next 100 KM for vehicle safety.',
                '',
                'Ken\'s Auto will accept Debit, Mastercard, Visa, Cash, Cheque, or E-transfer to settle the balance owing. E-transfers can be sent to: Shop@kensauto.ca. Ken\'s Auto reserves the right to refuse cheques at their discretion. We assess a $30 fee on all returned cheques.',
                '',
                '10,000 KM OR 3 MONTH PARTS & LABOUR WARRANTY - whichever occurs first. Installed parts & work performed not warrantied beyond warranties given by respective manufacturers.'
            ];

            let textY = footerStartY + 10;
            warrantyTextLines.forEach(paragraph => {
                if (paragraph === '') {
                    textY += 6;
                } else {
                    const lines = doc.splitTextToSize(paragraph, contentWidth - 10);
                    lines.forEach(line => {
                        doc.text(line, margin + 5, textY);
                        textY += 7;
                    });
                }
            });

            // Terms & Financials
            const boxY = footerStartY + 80;
            const termsWidth = contentWidth * 0.55;
            const financialWidth = contentWidth * 0.43;

            // Terms
            doc.rect(margin, boxY, termsWidth, 150, 'S');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Terms of Service', margin + 5, boxY + 15);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            const termsLines = doc.splitTextToSize(
                'I agree to pay the amount displayed on this repair order, and any subsequent interest. Any balance owing after 30 days of the invoice date may be subject to 24.99% interest. An express lien is acknowledged on the above vehicle, to secure the amount agreed to, under the Alberta Garagekeepers Lien Act. I agree to hold Ken\'s Auto harmless and free from indemnity for any loss or damage to the vehicle or any articles in it, while in the care of Ken\'s Auto, for fire, theft, vandalism, or any other event beyond our control. Any payment applied to the above work or signature below constitutes an acknowledgement and agreement to these terms of service.',
                termsWidth - 10
            );

            let termsY = boxY + 28;
            termsLines.forEach(line => {
                doc.text(line, margin + 5, termsY);
                termsY += 9;
            });

            // Signatures
            doc.text('X', margin + 5, boxY + 130);
            doc.line(margin + 15, boxY + 130, margin + termsWidth - 5, boxY + 130);
            doc.text('Name:', margin + 5, boxY + 145);
            doc.line(margin + 35, boxY + 145, margin + termsWidth - 5, boxY + 145);

            // Financials
            const finX = margin + termsWidth + 10;
            doc.rect(finX, boxY, financialWidth, 150, 'S');

            doc.setFontSize(9);
            // Calculate totals manually from line items to ensure accuracy if workOrder totals are stale/missing
            // (Assuming workOrder object passed has correct totals, otherwise we could recalc here)
            const partsTotal = Number(workOrder.parts_total || 0);
            const laborTotal = Number(workOrder.labor_total || 0);
            const shopSupplies = Number(workOrder.shop_supply_total || 0);
            const taxAmount = Number(workOrder.tax_amount || 0);
            const totalAmount = Number(workOrder.total_amount || 0);
            const amountPaid = Number(workOrder.amount_paid || 0);
            
            // Calculate other charges total (usually included in total amount but we might want to separate)
            // For now rely on workOrder properties passed
            // Note: If 'shop_supply_total' in input is actually 'other charges + shop supplies', we might need to adjust.
            // Based on report logic: other charges is separate from shop supplies.
            // But workOrder entity usually has shop_supply_total distinct.
            // We'll calculate 'Other Charges' as Total - (Parts + Labor + ShopSupplies + Tax) to be safe, or just use what we have.
            // Actually, let's use the recalculation logic from the report if possible, but for simplicity let's stick to what's passed if avail.
            // If workOrder doesn't have explicit other_charges_total, we might miss it.
            // Let's recalc 'Other Charges' from line items just to be safe.
            const otherChargesTotal = Array.isArray(lineItems) 
                ? lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0) + (item.is_other_charge ? (parseFloat(item.total)||0) : 0), 0)
                : 0;
            
            // Adjust shop supplies if needed. The input `shop_supply_total` from entity usually works.

            let finY = boxY + 15;
            const labelX = finX + 5;
            const valueX = finX + financialWidth - 5;

            doc.setFont('helvetica', 'normal');
            doc.text('Parts Subtotal:', labelX, finY);
            doc.text(`$${partsTotal.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.text('Labour Subtotal:', labelX, finY);
            doc.text(`$${laborTotal.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.text('Other Charges:', labelX, finY);
            doc.text(`$${otherChargesTotal.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.setLineWidth(0.5);
            doc.line(finX + 5, finY, finX + financialWidth - 5, finY);
            finY += 10;
            
            // Subtotal before tax/supplies (Parts + Labor + Other)
            const subtotal = partsTotal + laborTotal + otherChargesTotal;
            doc.text('Subtotal:', labelX, finY);
            doc.text(`$${subtotal.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.text('Shop Supplies (7%):', labelX, finY);
            doc.text(`$${shopSupplies.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.text('GST (5%):', labelX, finY);
            doc.text(`$${taxAmount.toFixed(2)}`, valueX, finY, { align: 'right' });

            finY += 12;
            doc.setLineWidth(1);
            doc.line(finX + 5, finY, finX + financialWidth - 5, finY);
            finY += 10;
            doc.setFont('helvetica', 'bold');
            doc.text('Grand Total:', labelX, finY);
            doc.text(`$${totalAmount.toFixed(2)}`, valueX, finY, { align: 'right' });

            // Payments
            let payments = [];
            try {
                payments = typeof workOrder.payments === 'string' ? JSON.parse(workOrder.payments) : workOrder.payments;
            } catch (e) { console.error(e); }

            if (Array.isArray(payments) && payments.length > 0) {
                const actualPayments = payments.filter(p => p.payment_method !== 'on_account');
                
                if (actualPayments.length > 0) {
                    finY += 15;
                    doc.setLineWidth(0.5);
                    doc.line(finX + 5, finY, finX + financialWidth - 5, finY);
                    finY += 10;
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Payment History', labelX, finY);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);

                    actualPayments.forEach(payment => {
                        finY += 10;
                        let dateStr = 'N/A';
                        try {
                           const [y, m, d] = payment.payment_date.split('-').map(Number);
                           dateStr = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        } catch (e) { dateStr = payment.payment_date || 'N/A'; }
                        
                        const method = payment.payment_method?.replace(/_/g, ' ') || 'N/A';
                        doc.text(`${dateStr} - ${method}`, labelX, finY);
                        doc.text(`-$${(Number(payment.amount) || 0).toFixed(2)}`, valueX, finY, { align: 'right' });
                    });

                    finY += 12;
                    doc.setFontSize(9);
                    doc.setLineWidth(1);
                    doc.line(finX + 5, finY, finX + financialWidth - 5, finY);
                    finY += 10;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Balance Due:', labelX, finY);
                    doc.text(`$${(totalAmount - amountPaid).toFixed(2)}`, valueX, finY, { align: 'right' });
                }
            }
        }

        // Start Document
        addHeader(true);

        const colWidths = {
            qty: 28,
            hrs: 28,
            description: 220,
            parts: 70,
            labour: 70,
            tax: 35,
            total: 75
        };

        function drawTableHeader() {
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, currentY, contentWidth, 20, 'F');
            doc.setDrawColor(0);
            doc.rect(margin, currentY, contentWidth, 20, 'S');

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');

            let x = margin + 5;
            doc.text('Qty', x + 10, currentY + 13, { align: 'center' });
            x += colWidths.qty;
            doc.text('Hrs', x + 10, currentY + 13, { align: 'center' });
            x += colWidths.hrs;
            doc.text('Description', x, currentY + 13);
            x += colWidths.description;
            doc.text('Parts', x + colWidths.parts - 5, currentY + 13, { align: 'right' });
            x += colWidths.parts;
            doc.text('Labour', x + colWidths.labour - 5, currentY + 13, { align: 'right' });
            x += colWidths.labour;
            doc.text('Tax', x + 15, currentY + 13, { align: 'center' });
            x += colWidths.tax;
            doc.text('Total', x + colWidths.total - 5, currentY + 13, { align: 'right' });

            currentY += 20;
        }

        drawTableHeader();

        // Process line items (Core logic)
        const processedLineItems = [];
        if (Array.isArray(lineItems)) {
            lineItems.forEach(item => {
                const coreNum = Number(item.Core_num || item.core_num || 0);
                const coreRet = Number(item.core_ret || 0);
                const coreOsamt = Number(item.core_osamt || 0);
                const coreCost = Number(item.core_cost || 0);

                if (coreNum > 0 && coreOsamt !== 0) {
                    // Main item with reduced total
                    processedLineItems.push({
                        ...item,
                        total: (Number(item.total || 0) - coreOsamt)
                    });
                    // Core line
                    processedLineItems.push({
                        qty: coreNum - coreRet,
                        hrs: '',
                        description: `CORE - ${item.description || ''}`,
                        part_number: item.part_number,
                        serial_num: '',
                        tot_parts: coreCost * (coreNum - coreRet),
                        labour: 0,
                        taxable: item.taxable,
                        total: coreOsamt,
                        bold: false
                    });
                } else {
                    processedLineItems.push(item);
                }
            });
        }

        const footerHeight = 300; 
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        processedLineItems.forEach((item, index) => {
            const hasParts = item.tot_parts && Number(item.tot_parts) !== 0;
            const hasLabour = item.labour && Number(item.labour) !== 0;

            const descriptionWidth = (!hasParts && !hasLabour) 
                ? colWidths.description + colWidths.parts + colWidths.labour 
                : colWidths.description;

            const descLines = doc.splitTextToSize(item.description || '', descriptionWidth - 10);
            const rowHeight = Math.max(20, descLines.length * 10 + 10);
            const hasPartNumber = item.part_number && item.part_number.trim() !== '';
            const finalRowHeight = hasPartNumber ? rowHeight + 8 : rowHeight;

            if (currentY + finalRowHeight + footerHeight > pageHeight) {
                addFooter();
                doc.addPage();
                addHeader(false);
                drawTableHeader();
            }

            // Draw Row
            if (index % 2 === 1) {
                doc.setFillColor(249, 249, 249);
                doc.rect(margin, currentY, contentWidth, finalRowHeight, 'F');
            }

            doc.setDrawColor(220, 220, 220);
            doc.rect(margin, currentY, contentWidth, finalRowHeight, 'S');

            let x = margin + 5;
            const textY = currentY + 13;

            // Qty
            doc.text((item.qty || '').toString(), x + 10, textY, { align: 'center' });
            x += colWidths.qty;
            // Hrs
            doc.text((item.hrs || '').toString(), x + 10, textY, { align: 'center' });
            x += colWidths.hrs;

            // Description
            const descX = x;
            const isBold = item.bold === true;
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            let descY = textY;
            descLines.forEach((line) => {
                doc.text(line, descX, descY);
                descY += 10;
            });
            doc.setFont('helvetica', 'normal');

            // Part/Serial
            if (hasPartNumber) {
                doc.setFontSize(7);
                doc.setTextColor(100, 100, 100);
                let partText = `Part #: ${item.part_number}`;
                if (item.serial_num && item.serial_num.trim() !== '') {
                    partText += `    S/N: ${item.serial_num}`;
                }
                doc.text(partText, descX, descY);
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(9);
            }
            x += colWidths.description;

            // Parts
            doc.text(item.tot_parts ? `$${Number(item.tot_parts).toFixed(2)}` : '', x + colWidths.parts - 5, textY, { align: 'right' });
            x += colWidths.parts;
            // Labour
            doc.text(item.labour ? `$${Number(item.labour).toFixed(2)}` : '', x + colWidths.labour - 5, textY, { align: 'right' });
            x += colWidths.labour;
            // Tax
            doc.text(item.taxable ? 'Y' : '', x + 15, textY, { align: 'center' });
            x += colWidths.tax;
            // Total
            doc.text(`$${Number(item.total || 0).toFixed(2)}`, x + colWidths.total - 5, textY, { align: 'right' });

            currentY += finalRowHeight;
        });

        // Notes to Customer
        if (workOrder.notes_to_customer) {
            currentY += 10;
            if (currentY + 80 + footerHeight > pageHeight) {
                addFooter();
                doc.addPage();
                addHeader(false);
            }
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Notes to Customer', margin, currentY);
            currentY += 5;
            doc.rect(margin, currentY, contentWidth, 60, 'S');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const notesLines = doc.splitTextToSize(workOrder.notes_to_customer, contentWidth - 10);
            currentY += 12;
            notesLines.forEach(line => {
                doc.text(line, margin + 5, currentY);
                currentY += 10;
            });
            currentY += 15;
        }

        // Add footer to last page
        addFooter();

        // Thank you & Page Numbers
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        const thankYou = 'Thank you for your business!';
        const thankYouWidth = doc.getTextWidth(thankYou);
        const totalPages = doc.getNumberOfPages();

        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            
            // Thank you on all pages or just last? User code said "Thank you footer" then "Add page numbers".
            // Typically thank you is at bottom of last page content, but user code put it at specific coordinates on every page?
            // "doc.text(thankYou...)" was outside the loop in user code, meaning it only printed on the last active page.
            if (i === totalPages) {
                doc.text(thankYou, (pageWidth - thankYouWidth) / 2, pageHeight - 20);
            }

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            const pageText = `Page ${i} of ${totalPages}`;
            const pageTextWidth = doc.getTextWidth(pageText);
            doc.text(pageText, (pageWidth - pageTextWidth) / 2, pageHeight - 10);
        }

        const pdfArrayBuffer = doc.output('arraybuffer');

        return new Response(pdfArrayBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="WorkOrder_${workOrder.wo_number || 'document'}.pdf"`,
            }
        });

    } catch (error) {
        console.error("PDF Generation Error:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});