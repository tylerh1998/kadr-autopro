import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "npm:jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      cashBreakdown,
      cheques,
      bankAccountNumber,
      bankAccountName,
      depositDate,
      totalCash,
      totalCheques,
      depositAmount
    } = await req.json();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Company Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("Ken's Auto & Diesel Repair", pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('5002 49 Ave - PO Box 160', pageWidth / 2, 28, { align: 'center' });
    doc.text('Dewberry, AB T0B 1G0', pageWidth / 2, 34, { align: 'center' });
    doc.text('Phone: 780-847-3002       Fax: 780-847-3004', pageWidth / 2, 40, { align: 'center' });
    doc.text('Email: Shop@kensauto.ca       Website: www.kensauto.ca', pageWidth / 2, 46, { align: 'center' });

    // Grey header bar
    doc.setFillColor(200, 200, 200);
    doc.rect(10, 55, pageWidth - 20, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEPOSIT SLIP', 12, 61);

    let leftY = 72;
    let rightY = 72;

    // LEFT COLUMN - Deposit Info and Cheques
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Deposit to the credit of:', 12, leftY);
    leftY += 6;
    doc.setFont('helvetica', 'normal');
    doc.text("Ken's Auto & Diesel Repair", 12, leftY);
    leftY += 6;
    // Format date as "Nov 25, 2025"
    let formattedDate = depositDate || '';
    if (depositDate) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const [year, month, day] = depositDate.split('-');
      formattedDate = `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
    }
    doc.text(`Date: ${formattedDate}`, 12, leftY);
    leftY += 6;
    doc.text(`Account # ${bankAccountNumber || ''}`, 12, leftY);
    leftY += 10;

    // Cheques section header
    doc.setFillColor(200, 200, 200);
    doc.rect(12, leftY - 4, 80, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('CHEQUES', 45, leftY, { align: 'center' });
    leftY += 6;

    // Cheques table header
    doc.setFont('helvetica', 'normal');
    doc.text('Cheque Name', 14, leftY);
    doc.text('Amount', 75, leftY);
    leftY += 2;
    doc.line(12, leftY, 92, leftY);
    leftY += 5;

    // Cheques list
    let chequesTotal = 0;
    if (cheques && cheques.length > 0) {
      cheques.forEach((cheque) => {
        // Use cheque_name (passed as customerName from the modal) for the deposit slip
        const chequeName = (cheque.customerName || 'Unknown').substring(0, 25);
        const amount = cheque.amount || 0;
        chequesTotal += amount;
        doc.text(chequeName, 14, leftY);
        doc.text(`$${amount.toFixed(2)}`, 90, leftY, { align: 'right' });
        leftY += 6;
      });
    }

    // Empty rows to match template (at least 8 rows total)
    const minRows = 8;
    const emptyRows = Math.max(0, minRows - (cheques?.length || 0));
    for (let i = 0; i < emptyRows; i++) {
      doc.line(12, leftY + 2, 92, leftY + 2);
      leftY += 6;
    }

    // Total Cheques
    leftY += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL CHQ', 14, leftY);
    doc.text(`$${(totalCheques || 0).toFixed(2)}`, 90, leftY, { align: 'right' });

    // RIGHT COLUMN - Bills and Coins
    const rightX = 110;
    const valueX = 190;

    // Bills header
    doc.setFillColor(200, 200, 200);
    doc.rect(rightX, rightY - 4, 85, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Qty', rightX + 5, rightY);
    doc.text('BILLS', rightX + 35, rightY);
    doc.text('$', rightX + 70, rightY);
    rightY += 8;

    doc.setFont('helvetica', 'normal');
    const bills = [
      { key: 'bills_5', label: 'X $5', multiplier: 5 },
      { key: 'bills_10', label: 'X $10', multiplier: 10 },
      { key: 'bills_20', label: 'X $20', multiplier: 20 },
      { key: 'bills_50', label: 'X $50', multiplier: 50 },
      { key: 'bills_100', label: 'X $100', multiplier: 100 },
    ];

    let billsTotal = 0;
    bills.forEach(bill => {
      const qty = cashBreakdown?.[bill.key] || 0;
      const value = qty * bill.multiplier;
      billsTotal += value;
      doc.text(qty.toString(), rightX + 8, rightY);
      doc.text(bill.label, rightX + 35, rightY);
      doc.text(value.toFixed(2), valueX, rightY, { align: 'right' });
      rightY += 6;
    });

    // Bills total
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', rightX + 35, rightY);
    doc.text(billsTotal.toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 8;

    // Coins header
    doc.setFillColor(200, 200, 200);
    doc.rect(rightX, rightY - 4, 85, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Qty', rightX + 5, rightY);
    doc.text('COIN', rightX + 35, rightY);
    doc.text('$', rightX + 70, rightY);
    rightY += 8;

    doc.setFont('helvetica', 'normal');
    const coins = [
      { key: 'coins_5', label: 'X 5c', multiplier: 0.05 },
      { key: 'coins_10', label: 'X 10c', multiplier: 0.10 },
      { key: 'coins_25', label: 'X 25c', multiplier: 0.25 },
      { key: 'coins_100', label: 'X $1.00', multiplier: 1 },
      { key: 'coins_200', label: 'X $2.00', multiplier: 2 },
    ];

    let coinsTotal = 0;
    coins.forEach(coin => {
      const qty = cashBreakdown?.[coin.key] || 0;
      const value = qty * coin.multiplier;
      coinsTotal += value;
      doc.text(qty.toString(), rightX + 8, rightY);
      doc.text(coin.label, rightX + 35, rightY);
      doc.text(value.toFixed(2), valueX, rightY, { align: 'right' });
      rightY += 6;
    });

    // Rolled coin
    const rolledCoin = cashBreakdown?.rolled_coin || 0;
    doc.text('ROLLED COIN', rightX + 35, rightY);
    doc.text(rolledCoin.toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 6;

    // Coins total
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', rightX + 35, rightY);
    doc.text((coinsTotal + rolledCoin).toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 6;

    // Total Cash
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL CASH', rightX + 25, rightY);
    doc.text((totalCash || 0).toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 12;

    // Summary section
    doc.line(rightX, rightY, valueX, rightY);
    rightY += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('Total Cash', rightX + 35, rightY);
    doc.text((totalCash || 0).toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 6;
    doc.text('Total Cheques', rightX + 35, rightY);
    doc.text((totalCheques || 0).toFixed(2), valueX, rightY, { align: 'right' });
    rightY += 8;

    // Deposit Amount
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEPOSIT AMOUNT', rightX + 10, rightY);
    doc.text((depositAmount || 0).toFixed(2), valueX, rightY, { align: 'right' });

    // Signature section at bottom
    const sigY = Math.max(leftY, rightY) + 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    doc.rect(12, sigY, 80, 20);
    doc.text("Teller's Initials:", 14, sigY + 6);

    doc.rect(rightX, sigY, 85, 20);
    doc.text('Deposited By:', rightX + 2, sigY + 6);

    // Generate PDF
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename=deposit_slip_${depositDate || 'unknown'}.pdf`
      }
    });
  } catch (error) {
    console.error('Error generating deposit slip PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
