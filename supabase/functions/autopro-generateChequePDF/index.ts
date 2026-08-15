import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsPDF } from "npm:jspdf@2.5.2";
import { format } from "npm:date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function safeParseJsonArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const errRes = (message: string) => {
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  };

  try {
    const { chequeReference } = await req.json();

    if (!chequeReference) {
      return errRes('Missing chequeReference parameter');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseSecret) {
      return errRes('Supabase credentials not configured');
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
      return errRes('No payment found for this cheque reference');
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    if (supplierError || !supplier) {
      return errRes('Supplier not found');
    }

    const appliedInvoices: any[] = safeParseJsonArray(payment.invoice_number);

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
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=cheque_${payment.cheque_number}.pdf`
      }
    });
  } catch (error: any) {
    console.error('Error in generateChequePDF:', error);
    return errRes(error.message || 'Internal server error');
  }
});

function renderStub(doc: any, startY: number, supplier: any, payment: any, appliedInvoices: any[], formattedDate: string, pageWidth: number) {
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

function numberToWords(amount: number) {
  let dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanThousand(n: number): string {
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
