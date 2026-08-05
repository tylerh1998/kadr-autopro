import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsPDF } from "npm:jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const parseArApplyTo = (value: any) => {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};

const parseAppliedData = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildAppliedDetails = async (supabase: any, payment: any) => {
  if (!payment.customer_id) return [];

  const { data: customerData, error: customerDataError } = await supabase.rpc('get_customer_ar_data', {
    customer_id_val: payment.customer_id
  });
  if (customerDataError) throw customerDataError;

  const rowMap = Object.fromEntries((customerData || []).map((row: any) => [row.transaction_id, row]));
  const paymentRow = rowMap[payment.id];
  const rpcAppliedData = parseAppliedData(paymentRow?.applied_data);
  const parsedAppliedData = rpcAppliedData.length
    ? rpcAppliedData
    : parseArApplyTo(payment.ar_applyto);

  return parsedAppliedData
    .map((item: any) => {
      const id = item?.id;
      const amountApplied = Number(item?.amount) || 0;
      if (!id) return null;

      const row = rowMap[id];
      if (!row) {
        return { id, reference: '', date: null, description: item?.description || '', amountApplied };
      }

      return {
        id,
        reference: row.reference || '',
        date: row.txn_date ? String(row.txn_date).slice(0, 10) : null,
        description: item?.description || row.description || '',
        amountApplied
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const dateA = a.date || '9999-12-31';
      const dateB = b.date || '9999-12-31';
      return dateA.localeCompare(dateB);
    });
};

const formatPaymentMethod = (method: string) => {
  if (!method) return 'Unknown';
  return method.replace(/_/g, ' ').split(' ').map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { paymentId } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Missing paymentId parameter' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: payment, error: paymentError } = await supabase
      .from('CustomerPayments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: customer, error: customerError } = await supabase
      .from('Customer')
      .select('*')
      .eq('id', payment.customer_id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appliedDetails = await buildAppliedDetails(supabase, payment);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const pageWidth = 215.9;
    const margin = 20;
    let yPosition = 20;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text("Ken's Auto & Diesel Repair", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text("5002 49 Ave - PO Box 160", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 5;
    doc.text("Dewberry, AB T0B 1G0", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 5;
    doc.text("Phone: 780-847-3002 | Fax: 780-847-3004", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 5;
    doc.text("Email: Shop@kensauto.ca | Website: www.kensauto.ca", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    const columnStartY = yPosition;
    const leftColumnX = margin;
    const rightColumnX = pageWidth / 2 + 5;
    const columnWidth = (pageWidth / 2) - margin - 10;

    yPosition = columnStartY;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("Customer:", leftColumnX, yPosition);
    doc.setFont('helvetica', 'normal');
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

    yPosition = columnStartY;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("Payment Receipt", rightColumnX, yPosition);
    yPosition += 3;

    const boxHeight = 45;
    doc.setFillColor(245, 245, 245);
    doc.rect(rightColumnX, yPosition, columnWidth, boxHeight, 'F');

    yPosition += 8;
    doc.setFontSize(9);

    doc.setFont('helvetica', 'bold');
    doc.text("Payment Date:", rightColumnX + 3, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(payment.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), rightColumnX + 32, yPosition);
    yPosition += 7;

    doc.setFont('helvetica', 'bold');
    doc.text("Payment Method:", rightColumnX + 3, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(formatPaymentMethod(payment.payment_method), rightColumnX + 32, yPosition);
    yPosition += 7;

    if (payment.reference) {
      doc.setFont('helvetica', 'bold');
      doc.text("Reference:", rightColumnX + 3, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(payment.reference, rightColumnX + 32, yPosition);
      yPosition += 7;
    } else {
      yPosition += 7;
    }

    doc.setFont('helvetica', 'bold');
    doc.text("Total Payment:", rightColumnX + 3, yPosition);
    doc.setFontSize(11);
    doc.text(`$${(payment.amount || 0).toFixed(2)}`, rightColumnX + 32, yPosition);
    doc.setFontSize(9);

    yPosition = columnStartY + boxHeight + 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("Applied To:", margin, yPosition);
    yPosition += 8;

    if (appliedDetails.length > 0) {
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, yPosition - 5, pageWidth - (margin * 2), 8, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text("Reference", margin + 2, yPosition);
      doc.text("Date", margin + 40, yPosition);
      doc.text("Description", margin + 70, yPosition);
      doc.text("Amount Applied", pageWidth - margin - 35, yPosition);

      yPosition += 8;
      doc.setFont('helvetica', 'normal');

      let totalApplied = 0;
      for (const detail of appliedDetails) {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        const referenceLines = doc.splitTextToSize(detail.reference || '', 35);
        doc.text(referenceLines[0] || '', margin + 2, yPosition);

        doc.text(detail.date ? new Date(detail.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '', margin + 40, yPosition);

        const descriptionLines = doc.splitTextToSize(detail.description || '', 70);
        doc.text(descriptionLines[0] || '', margin + 70, yPosition);

        doc.text(`$${detail.amountApplied.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });

        totalApplied += detail.amountApplied;
        yPosition += 7;
      }

      yPosition += 2;
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, yPosition - 5, pageWidth - (margin * 2), 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.text("Total Applied:", pageWidth - margin - 45, yPosition);
      doc.text(`$${totalApplied.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text("No payment application details available.", margin + 5, yPosition);
    }

    yPosition = 270;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text("Thank you for your business!", pageWidth / 2, yPosition, { align: 'center' });

    const pdfDataUri = doc.output('datauristring');
    const customerNameForFile = customerName.replace(/[^a-zA-Z0-9]/g, '_');
    const dateForFile = String(payment.payment_date).slice(0, 10);
    const filename = `PaymentReceipt_${customerNameForFile}_${dateForFile}.pdf`;

    return new Response(JSON.stringify({ pdfDataUri, filename }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error('Error in autopro-generateARReceiptPDF:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
