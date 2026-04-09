import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { payments, adjustments, depositDate } = await req.json();

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();

        // Company Header - Left Side
        try {
            const logoRes = await fetch("https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b90236f4d7e6ac0de4a262/094d1d78c_KensLogoOnly.jpg");
            if (logoRes.ok) {
                const logoBuffer = await logoRes.arrayBuffer();
                const logoArray = new Uint8Array(logoBuffer);
                let binary = '';
                for (let i = 0; i < logoArray.byteLength; i++) {
                    binary += String.fromCharCode(logoArray[i]);
                }
                const logoBase64 = btoa(binary);
                doc.addImage(logoBase64, 'JPEG', 18, 16, 32, 20);
            } else {
                throw new Error("Failed to fetch logo");
            }
        } catch (e) {
            console.error('Error loading logo:', e);
            doc.setFillColor(150, 160, 170);
            doc.rect(20, 20, 12, 18, 'F');
            doc.setFillColor(0, 0, 0);
            doc.triangle(32, 38, 50, 20, 42, 38, 'F');
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text("Ken's Auto & Diesel Repair", 55, 24);
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.text("5002 49 Ave - PO Box 160", 55, 28);
        doc.text("Dewberry, AB T0B 1G0", 55, 32);
        doc.text("Phone: 780-847-3002           Fax: 780-847-3004", 55, 36);
        doc.text("Email: Shop@kensauto.ca     Website: www.kensauto.ca", 55, 40);

        // Header - Right Side
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text("Deposit Detail Report", pageWidth - 20, 25, { align: 'right' });
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        let formattedDate = depositDate || '';
        if (depositDate) {
            try {
                formattedDate = format(new Date(depositDate + 'T00:00:00'), 'MMMM d, yyyy');
            } catch (e) {
                formattedDate = depositDate;
            }
        }
        doc.text(`Date: ${formattedDate}`, pageWidth - 20, 32, { align: 'right' });

        let yPos = 55;

        // Table Header
        doc.setFillColor(0, 0, 0);
        doc.rect(20, yPos, pageWidth - 40, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text("Customer", 22, yPos + 5.5);
        doc.text("Date", 80, yPos + 5.5);
        doc.text("Method", 130, yPos + 5.5);
        doc.text("Amount", 170, yPos + 5.5);

        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');

        const rows = [];
        
        (payments || []).forEach(p => {
            let m = p.payment_method || '';
            if (m === 'credit_card') m = 'Credit';
            else m = m.charAt(0).toUpperCase() + m.slice(1).replace('_', ' ');
            
            let d = p.payment_date || '';
            if (d) {
                try {
                    d = format(new Date(d + 'T00:00:00'), 'MMM d, yyyy');
                } catch(e) {}
            }

            rows.push({
                customer: p.customerName || 'Unknown',
                date: d,
                method: m,
                amount: p.amount || 0,
                rawMethod: p.payment_method
            });
        });

        (adjustments || []).forEach(a => {
            let m = a.payment_method || '';
            if (m === 'credit_card') m = 'Credit';
            else m = m.charAt(0).toUpperCase() + m.slice(1).replace('_', ' ');

            let d = a.adjustment_date || '';
            if (d) {
                try {
                    d = format(new Date(d + 'T00:00:00'), 'MMM d, yyyy');
                } catch(e) {}
            }

            rows.push({
                customer: a.description || 'Adjustment',
                date: d,
                method: m,
                amount: a.amount || 0,
                rawMethod: a.payment_method
            });
        });

        // Draw rows
        rows.forEach(row => {
            if (yPos > 260) {
                doc.addPage();
                yPos = 20;
            }
            doc.rect(20, yPos, pageWidth - 40, 8, 'S');
            doc.text(row.customer.substring(0, 30), 22, yPos + 5.5);
            doc.text(row.date, 80, yPos + 5.5);
            doc.text(row.method, 130, yPos + 5.5);
            doc.text(`$${row.amount.toFixed(2)}`, 170, yPos + 5.5);
            yPos += 8;
        });

        yPos += 15;

        if (yPos > 240) {
            doc.addPage();
            yPos = 20;
        }

        // Summary Table
        doc.setFillColor(0, 0, 0);
        doc.rect(20, yPos, pageWidth - 40, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        const colWidth = (pageWidth - 40) / 6;
        doc.text("Debit", 20 + (colWidth * 0) + 2, yPos + 5.5);
        doc.text("Credit", 20 + (colWidth * 1) + 2, yPos + 5.5);
        doc.text("E Transfer", 20 + (colWidth * 2) + 2, yPos + 5.5);
        doc.text("Cash", 20 + (colWidth * 3) + 2, yPos + 5.5);
        doc.text("Cheque", 20 + (colWidth * 4) + 2, yPos + 5.5);
        doc.text("Other", 20 + (colWidth * 5) + 2, yPos + 5.5);

        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');

        const totals = {
            debit: 0,
            credit_card: 0,
            e_transfer: 0,
            cash: 0,
            cheque: 0,
            other: 0
        };

        rows.forEach(r => {
            const rm = r.rawMethod || 'other';
            if (totals[rm] !== undefined) totals[rm] += r.amount;
            else totals.other += r.amount;
        });

        // Draw summary values box
        for(let i=0; i<6; i++) {
            doc.rect(20 + (colWidth * i), yPos, colWidth, 10, 'S');
        }

        doc.text(`$${totals.debit.toFixed(2)}`, 20 + (colWidth * 0) + 2, yPos + 6.5);
        doc.text(`$${totals.credit_card.toFixed(2)}`, 20 + (colWidth * 1) + 2, yPos + 6.5);
        doc.text(`$${totals.e_transfer.toFixed(2)}`, 20 + (colWidth * 2) + 2, yPos + 6.5);
        doc.text(`$${totals.cash.toFixed(2)}`, 20 + (colWidth * 3) + 2, yPos + 6.5);
        doc.text(`$${totals.cheque.toFixed(2)}`, 20 + (colWidth * 4) + 2, yPos + 6.5);
        doc.text(`$${totals.other.toFixed(2)}`, 20 + (colWidth * 5) + 2, yPos + 6.5);

        yPos += 10;

        // Total Card
        doc.setFillColor(0, 0, 0);
        doc.rect(20, yPos, colWidth * 2, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.text("Total Card", 22, yPos + 5.5);
        
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.rect(20, yPos, colWidth * 2, 10, 'S');
        const totalCard = totals.debit + totals.credit_card;
        doc.text(`$${totalCard.toFixed(2)}`, 22, yPos + 6.5);

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="DepositDetailReport_${formattedDate.replace(/ /g, '_')}.pdf"`
            }
        });

    } catch (error) {
        console.error('Error generating deposit detail report:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});