import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
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

        let workOrder, customer, vehicle, lineItems, wipLegal, defaultMessage;
        try {
            ({ workOrder, customer, vehicle, lineItems, wipLegal, defaultMessage } = await req.json());
        } catch (jsonError) {
            console.error('Error parsing request JSON:', jsonError);
            return Response.json({ error: 'Invalid JSON payload', details: jsonError.message }, { status: 400 });
        }

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

        // Pre-calculate Financials
        const roundToTwo = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        let partsTotal = 0;
        let laborTotal = 0;
        let otherChargesTotal = 0;
        let shopSupplyTotal = 0;
        let taxAmount = 0;
        let totalAmount = 0;

        if (Array.isArray(lineItems) && lineItems.length > 0) {
            partsTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.tot_parts) || 0), 0);
            laborTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
            otherChargesTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
            
            const grandTotalBeforeTax = partsTotal + laborTotal + otherChargesTotal;
            
            let totalTaxableBase = 0;
            lineItems.forEach(item => {
                if (item.taxable === true) {
                    totalTaxableBase += (parseFloat(item.total) || 0);
                }
            });
            
            const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
                if (item.taxable === true) {
                    return sum + (parseFloat(item.labour) || 0);
                }
                return sum;
            }, 0);
            
            shopSupplyTotal = laborTotal * 0.06;
            const taxableShopSupplies = taxableLaborForShopSupply * 0.06;
            totalTaxableBase += taxableShopSupplies;
            
            taxAmount = totalTaxableBase * 0.05;
            totalAmount = grandTotalBeforeTax + shopSupplyTotal + taxAmount;
        } else {
            partsTotal = Number(workOrder?.parts_total || 0);
            laborTotal = Number(workOrder?.labor_total || 0);
            shopSupplyTotal = Number(workOrder?.shop_supply_total || 0);
            otherChargesTotal = Number(workOrder?.other_charges_total || 0);
            taxAmount = Number(workOrder?.tax_amount || 0);
            totalAmount = Number(workOrder?.total_amount || 0);
        }

        partsTotal = roundToTwo(partsTotal);
        laborTotal = roundToTwo(laborTotal);
        otherChargesTotal = roundToTwo(otherChargesTotal);
        shopSupplyTotal = roundToTwo(shopSupplyTotal);
        taxAmount = roundToTwo(taxAmount);
        totalAmount = roundToTwo(totalAmount);
        const subTotal = roundToTwo(partsTotal + laborTotal + otherChargesTotal + shopSupplyTotal);
        
        // Calculate payments sum from payments array to be sure
        let paymentsList = [];
        try {
          const rawPayments = workOrder?.payments;
          paymentsList = rawPayments ? (typeof rawPayments === 'string' ? JSON.parse(rawPayments) : rawPayments) : [];
          // Filter out on_account payments
          paymentsList = paymentsList.filter(p => p.payment_method !== 'on_account');
        } catch(e) { console.warn("Error parsing payments", e); }
        
        const finalPaid = roundToTwo(paymentsList.reduce((acc, p) => acc + (Number(p.amount) || 0), 0));
        const balanceDue = roundToTwo(totalAmount - finalPaid);

        // Constants for Layout
        const headerHeight = 90;
        const custVehHeight = 85; 
        const finBarHeight = 55;
        const footerHeight = 25; // Page numbers
        const bottomReserved = finBarHeight + footerHeight + 40; // Increased buffer to prevent bleeding

        let currentY = margin;

        let docTitle = 'WORK ORDER';
        let globalRefNumber = workOrder.wo_number || workOrder.ro_number || 'N/A';
        let docRefDate = workOrder.wo_date;

        if (workOrder.stage === 'estimate') {
            docTitle = 'ESTIMATE';
            globalRefNumber = workOrder.est_number || globalRefNumber;
            docRefDate = workOrder.est_date || docRefDate;
        } else if (workOrder.stage === 'invoice') {
            docTitle = 'INVOICE';
            globalRefNumber = workOrder.inv_number || globalRefNumber;
            docRefDate = workOrder.invoice_date || docRefDate;
        } else if (workOrder.stage === 'credit_invoice') {
            docTitle = 'CREDIT INVOICE';
            globalRefNumber = workOrder.crinv_number || globalRefNumber;
            docRefDate = workOrder.invoice_date || docRefDate;
        }

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
            
            const titleWidth = doc.getTextWidth(docTitle);
            doc.text(docTitle, pageWidth - margin - titleWidth, currentY + 15);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const refWidth = doc.getTextWidth(globalRefNumber);
            doc.text(globalRefNumber, pageWidth - margin - refWidth, currentY + 35);

            if (docRefDate) {
                // Parse date string carefully to avoid timezone issues
                let dateStr = 'N/A';
                try {
                    const parts = docRefDate.split('-').map(Number);
                    if (parts.length === 3 && !parts.some(isNaN)) {
                        const [y, m, d] = parts;
                        const localDate = new Date(y, m - 1, d);
                        if (!isNaN(localDate.getTime())) {
                            dateStr = localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        } else {
                            dateStr = docRefDate;
                        }
                    } else {
                        dateStr = docRefDate;
                    }
                } catch (e) {
                    dateStr = docRefDate;
                }
                const dateWidth = doc.getTextWidth(`Date: ${dateStr}`);
                doc.text(`Date: ${dateStr}`, pageWidth - margin - dateWidth, currentY + 50);
            }

            if (workOrder?.po_number) {
                doc.setFont('helvetica', 'bold');
                const poWidth = doc.getTextWidth(`PO: ${workOrder.po_number}`);
                doc.text(`PO: ${workOrder.po_number}`, pageWidth - margin - poWidth, currentY + 65);
                doc.setFont('helvetica', 'normal');
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
                doc.text('Customer', margin, currentY);
                doc.text('Vehicle', margin + 280, currentY);

                currentY += 5;
                doc.setLineWidth(1);
                doc.line(margin, currentY, margin + 200, currentY);
                doc.line(margin + 280, currentY, margin + 480, currentY);

                currentY += 15;
                doc.setFontSize(10);
                
                const startY = currentY;

                // Customer Info
                let customerY = startY;
                const customerName = customer?.org_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'N/A';
                
                // Name (Bold)
                doc.setFont('helvetica', 'bold');
                doc.text(customerName, margin, customerY);
                doc.setFont('helvetica', 'normal');
                customerY += 12;

                // Contact Person (if org)
                if (customer?.org_name && (customer?.first_name || customer?.last_name)) {
                    const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
                    if (contactName) {
                        doc.text(`Contact: ${contactName}`, margin, customerY);
                        customerY += 12;
                    }
                }

                // Address Line 1
                if (customer?.address) {
                    doc.text(customer.address, margin, customerY);
                    customerY += 12;
                }

                // City, Province, Zip
                const cityStateZip = `${customer?.city || ''}${customer?.city && (customer?.state || customer?.zip_code) ? ', ' : ''}${customer?.state || ''} ${customer?.zip_code || ''}`.trim();
                if (cityStateZip && cityStateZip !== ',') {
                    doc.text(cityStateZip, margin, customerY);
                    customerY += 12;
                }

                // Phone
                if (customer?.phone) {
                    doc.text(customer.phone, margin, customerY);
                    customerY += 12;
                }

                // Vehicle Info
                let vehicleY = startY;
                if (vehicle) {
                    // YMM (Bold)
                    doc.setFont('helvetica', 'bold');
                    const vehString = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim();
                    if (vehString) {
                        doc.text(vehString, margin + 280, vehicleY);
                        vehicleY += 12;
                    }
                    doc.setFont('helvetica', 'normal');

                    // VIN
                    if (vehicle.vin) {
                        doc.text(vehicle.vin, margin + 280, vehicleY);
                        vehicleY += 12;
                    }

                    // License
                    if (vehicle.license_plate) {
                        doc.text(vehicle.license_plate, margin + 280, vehicleY);
                        vehicleY += 12;
                    }
                    
                    // Odometer
                    if (workOrder.odometer) {
                         doc.text(`${Number(workOrder.odometer).toLocaleString()} km`, margin + 280, vehicleY);
                         vehicleY += 12;
                    }

                    // Unit Number
                    if (vehicle.unit_number) {
                        doc.text(`Unit: ${vehicle.unit_number}`, margin + 280, vehicleY);
                        vehicleY += 12;
                    }

                    // CVIP
                    if (workOrder?.cvip) {
                        doc.text(`CVIP: ${workOrder.cvip}`, margin + 280, vehicleY);
                        vehicleY += 12;
                    }
                }

                currentY = Math.max(customerY, vehicleY) + 25;
            }
        }

        const drawFinancialBar = (doc) => {
          const barY = pageHeight - margin - footerHeight - finBarHeight; 
          
          doc.setDrawColor(200);
          doc.setLineWidth(1);
          doc.rect(margin, barY, contentWidth, finBarHeight, 'S');

          if (workOrder?.ro_number) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text(String(workOrder.ro_number), margin + 6, barY + 11);
          }
          
          const cols = [
            { label: "PARTS TOTAL", val: partsTotal },
            { label: "LABOUR TOTAL", val: laborTotal },
            { label: "OTHER CHARGES", val: otherChargesTotal },
            { label: "SHOP SUPPLIES", val: shopSupplyTotal },
            { label: "GST (5%)", val: taxAmount },
            { label: "TOTAL", val: totalAmount, isTotal: true },
            { label: "PAYMENTS", val: finalPaid },
            { label: "AMOUNT OWING", val: balanceDue, isTotal: true }
          ];
          
          const colWidth = contentWidth / cols.length;
          
          cols.forEach((col, i) => {
             const cx = margin + (i * colWidth);
             const center = cx + (colWidth / 2);
             
             if (col.isTotal) {
                 doc.setFillColor(230, 230, 230);
                 doc.rect(cx, barY, colWidth, finBarHeight, 'F');
                 doc.setDrawColor(200);
                 doc.rect(cx, barY, colWidth, finBarHeight, 'S');
             }
             
             doc.setFontSize(7);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(col.isTotal ? 0 : 100); 
             doc.text(col.label, center, barY + 15, { align: 'center' });
             
             doc.setFontSize(col.isTotal ? 12 : 9);
             doc.setFont('helvetica', col.isTotal ? 'bold' : 'normal');
             doc.setTextColor(0);
             doc.text(`$${col.val.toFixed(2)}`, center, barY + 35, { align: 'center' });
          });
        };
        
        const drawPageFooter = (doc, pageNum, totalPages) => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            const text = `Page ${pageNum} of ${totalPages}`;
            doc.text(text, pageWidth / 2, pageHeight - margin, { align: 'center' });
        };
        
        const drawPaymentDetails = (doc, y) => {
           doc.setFontSize(9);
           doc.setFont('helvetica', 'bold');
           doc.setFillColor(240, 240, 240);
           doc.rect(margin, y, contentWidth, 15, 'F');
           doc.text("Payment Details", margin + 5, y + 11);
           
           doc.rect(margin, y, contentWidth, 15, 'S'); 
           
           let py = y + 15;
           const paymentsHeight = Math.max(25, (paymentsList.length * 12) + 10);
           doc.rect(margin, py, contentWidth, paymentsHeight, 'S');
           
           py += 10;
           doc.setFont('helvetica', 'normal');
           doc.setFontSize(9);
           
           if (paymentsList.length === 0) {
               doc.text("No payments recorded.", margin + 5, py);
           } else {
               paymentsList.forEach(p => {
                   let dateStr = 'N/A';
                   try {
                       if (p.payment_date) {
                           const parts = p.payment_date.split('-').map(Number);
                           if (parts.length === 3 && !parts.some(isNaN)) {
                               const [y, m, d] = parts;
                               const localDate = new Date(y, m - 1, d);
                               if (!isNaN(localDate.getTime())) {
                                   dateStr = localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                               } else {
                                   dateStr = p.payment_date;
                               }
                           } else {
                               dateStr = p.payment_date;
                           }
                       }
                   } catch (e) { dateStr = p.payment_date || 'N/A'; }
                   const m = p.payment_method ? p.payment_method.replace(/_/g, ' ') : 'N/A';
                   const a = p.amount ? Number(p.amount).toFixed(2) : '0.00';
                   doc.text(`${dateStr} - ${m} - $${a}`, margin + 5, py);
                   py += 12;
               });
           }
           
           return 15 + paymentsHeight;
        };
        
        const drawTermsWarranty = (doc, y) => {
           const height = 140;
           const gap = 10;
           const boxWidth = (contentWidth - gap) / 2;
           
           doc.setFontSize(9);
           doc.setFont('helvetica', 'bold');
           doc.text("Terms of Service", margin + 5, y + 12);
           
           doc.setFontSize(7);
           doc.setFont('helvetica', 'normal');
           const termsText = wipLegal || "I agree to pay the amount displayed on this repair order, and any subsequent interest. Any balance owing after 30 days of the invoice date may be subject to 24.99% interest. An express lien is acknowledged on the above vehicle, to secure the amount agreed to, under the Alberta Garagekeepers Lien Act. I agree to hold Ken's Auto harmless and free from indemnity for any loss or damage to the vehicle or any articles in it, while in the care of Ken's Auto, for fire, theft, vandalism, or any other event beyond our control. Any payment applied to the above work or signature below constitutes an acknowledgement and agreement to these terms of service.\n\n\nX __________________________________________\n\nName: ______________________________________";
           const termsLines = doc.splitTextToSize(termsText, boxWidth - 10);
           let ty = y + 22;
           termsLines.forEach(l => {
               doc.text(l, margin + 5, ty);
               ty += 8;
           });
           
           const rightX = margin + boxWidth + gap;
           
           let wy = y + 10;
           const wLines = defaultMessage 
              ? defaultMessage.split('\n') 
              : [
                  'IF YOUR WHEELS HAVE BEEN REMOVED for any service performed, your wheels have been torqued to manufacturer\'s specifications. Ken\'s Auto reminds you that wheel nut tightness should be re-checked in the next 100 KM for vehicle safety.',
                  '',
                  'Ken\'s Auto will accept Debit, Mastercard, Visa, Cash, Cheque, or E-transfer to settle the balance owing. E-transfers can be sent to: Shop@kensauto.ca. Ken\'s Auto reserves the right to refuse cheques at their discretion. We assess a $30 fee on all returned cheques.',
                  '',
                  '10,000 KM OR 3 MONTH PARTS & LABOUR WARRANTY - whichever occurs first. Installed parts & work performed not warrantied beyond warranties given by respective manufacturers.'
                ];
           
           wLines.forEach(para => {
              if (!para) { wy += 5; return; }
              const lines = doc.splitTextToSize(para, boxWidth - 10);
              lines.forEach(l => {
                  doc.text(l, rightX + 5, wy);
                  wy += 8;
              });
           });
           
           return height;
        };

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
                        tot_parts: (Number(item.tot_parts || 0) - coreOsamt),
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

            if (currentY + finalRowHeight > pageHeight - bottomReserved) {
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
            doc.text(item.part_number ? `$${roundToTwo(Number(item.parts_ea || 0)).toFixed(2)}/${(item.unit && String(item.unit).trim()) || 'ea'}` : '', x + colWidths.parts - 5, textY, { align: 'right' });
            x += colWidths.parts;
            // Labour
            doc.text(item.labour ? `$${roundToTwo(item.labour).toFixed(2)}` : '', x + colWidths.labour - 5, textY, { align: 'right' });
            x += colWidths.labour;
            // Tax
            doc.text(item.taxable ? 'Y' : '', x + 15, textY, { align: 'center' });
            x += colWidths.tax;
            // Total
            doc.text(`$${roundToTwo(item.total || 0).toFixed(2)}`, x + colWidths.total - 5, textY, { align: 'right' });

            currentY += finalRowHeight;
        });

        // Notes to Customer
        if (workOrder.notes_to_customer) {
            currentY += 10;
            if (currentY + 80 > pageHeight - bottomReserved) {
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

        // --- LAST PAGE BLOCKS ---
        const paymentH = Math.max(40, (paymentsList.length * 12) + 30);
        const termsH = 140;
        const blocksTotalH = paymentH + termsH + 20;
        
        if (currentY + blocksTotalH > pageHeight - bottomReserved) {
            doc.addPage();
            addHeader(false);
            currentY = margin + headerHeight + 10;
        } else {
            currentY += 20;
        }
        
        const hUsed = drawPaymentDetails(doc, currentY);
        currentY += hUsed + 10;
        
        drawTermsWarranty(doc, currentY);

        // --- FINALIZE PAGES ---
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            drawFinancialBar(doc);
            drawPageFooter(doc, i, totalPages);
        }

        // Return as base64 JSON to avoid binary handling issues with SDK
        const pdfDataUri = doc.output('datauristring');

        return Response.json({ 
            pdfDataUri,
            filename: `${globalRefNumber}.pdf`
        });

    } catch (error) {
        console.error("PDF Generation Error:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});