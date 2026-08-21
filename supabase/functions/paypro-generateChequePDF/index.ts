import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsPDF } from "npm:jspdf@2.5.2";
import { format } from "npm:date-fns@3.6.0";

// Payroll's manual-cheque backup path. Same physical layout as autopro-generateChequePDF
// (pre-printed cheque stock, no MICR/routing drawn), but sourced from PayPro_PayStub +
// PayPro_Employee instead of SupplierPayment + Supplier, and forked rather than
// generalizing the AP function - zero chance of a payroll change ever touching live AP
// cheque printing. Deliberately kept a separate paypro-* function per this module's
// established naming convention (master_context.md §4).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decodes the JWT payload directly (no network call to auth.getUser()) - the gateway
// (verify_jwt: true) already validated the signature before this function runs. Same
// pattern as paypro-generatePayStubPDF, since a payroll cheque is exactly as sensitive
// as a pay stub PDF.
const decodeJwtPayload = (token: string): any => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const hasStrongAuth = (claims: any): boolean => {
  if (!claims) return false;
  if (claims.aal === 'aal2') return true;
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.some((entry: any) => {
    const method = (entry?.method || '').toLowerCase();
    return method.includes('webauthn') || method.includes('passkey');
  });
};

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseSecret) {
      return errRes('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errRes('Authentication required');
    }

    const claims = decodeJwtPayload(authHeader.substring(7));
    const mykadrUserId = claims?.sub;
    if (!mykadrUserId) {
      return errRes('Invalid session token');
    }
    if (!hasStrongAuth(claims)) {
      return errRes('This action requires multi-factor authentication.');
    }

    const { data: caller, error: callerError } = await supabase
      .from('Employee')
      .select('paypro_user')
      .eq('mykadr_user_id', mykadrUserId)
      .maybeSingle();
    if (callerError || !caller || caller.paypro_user !== true) {
      return errRes('You do not have access to the payroll module.');
    }

    const { chequeReference } = await req.json().catch(() => ({}));
    if (!chequeReference) {
      return errRes('Missing chequeReference parameter');
    }

    const { data: stub, error: stubError } = await supabase
      .from('PayPro_PayStub')
      .select('*')
      .eq('cheque_number', String(chequeReference))
      .limit(1)
      .maybeSingle();

    if (stubError || !stub) {
      return errRes('No pay stub found for this cheque reference');
    }

    // employee_id is the business key (e.g. EMP001), matching PayPro_Employee.employee_id -
    // not the system id (lesson 1, same join every other PayPRO PDF function uses).
    const { data: employee, error: employeeError } = await supabase
      .from('PayPro_Employee')
      .select('*')
      .eq('employee_id', stub.employee_id)
      .maybeSingle();

    if (employeeError || !employee) {
      return errRes('Employee not found');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const pageWidth = 215.9;
    const chequeHeight = 93.13;
    const formattedDate = format(new Date(stub.pay_date), 'MMM dd, yyyy');
    const amount = parseFloat(stub.net_pay) || 0;
    const chequeTop = 0;
    const employeeName = `${employee.first_name} ${employee.last_name}`;

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
    doc.text(employeeName.toUpperCase(), 20, chequeTop + 55);
    doc.setFont(undefined, 'normal');

    if (employee.address) {
      doc.setFontSize(9);
      doc.text(employee.address.toUpperCase(), 20, chequeTop + 61);
    }
    if (employee.town && employee.province && employee.postal_code) {
      doc.setFontSize(9);
      doc.text(`${employee.town.toUpperCase()}, ${employee.province.toUpperCase()} ${employee.postal_code.toUpperCase()}`, 20, chequeTop + 67);
    }

    const stub1Top = chequeHeight;
    renderStub(doc, stub1Top, employeeName, stub, amount, formattedDate, pageWidth);

    const stub2Top = chequeHeight * 2;
    renderStub(doc, stub2Top, employeeName, stub, amount, formattedDate, pageWidth);

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=paycheque_${stub.cheque_number}.pdf`
      }
    });
  } catch (error: any) {
    console.error('Error in paypro-generateChequePDF:', error);
    return errRes(error.message || 'Internal server error');
  }
});

// Payroll's stub band shows pay-period/gross/deductions/net instead of AP's applied-invoice
// list - there's no equivalent "line items" concept on a single pay stub.
function renderStub(doc: any, startY: number, employeeName: string, stub: any, amount: number, formattedDate: string, pageWidth: number) {
  doc.setFontSize(10);
  doc.text(formattedDate, pageWidth - 60, startY + 10);
  doc.text(amount.toFixed(2), pageWidth - 20, startY + 10, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(employeeName.toUpperCase(), 20, startY + 18);
  doc.setFont(undefined, 'normal');

  doc.setFontSize(9);
  doc.text(`Paycheque: ${stub.paycheque_number || 'N/A'}`, 20, startY + 26);
  doc.text(`Pay Period: ${stub.pay_period_start || ''} - ${stub.pay_period_end || ''}`, 20, startY + 32);

  const totalDeductions =
    (stub.federal_tax || 0) + (stub.provincial_tax || 0) +
    (stub.cpp_deduction || 0) + (stub.cpp2_deduction || 0) +
    (stub.ei_deduction || 0);

  const rows = [
    ['Gross Pay:', `$${(stub.gross_pay || 0).toFixed(2)}`],
    ['Total Deductions:', `$${totalDeductions.toFixed(2)}`],
    ['Net Pay:', `$${amount.toFixed(2)}`],
  ];

  let y = startY + 40;
  for (const [label, value] of rows) {
    doc.text(label, 20, y);
    doc.text(value, 90, y, { align: 'right' });
    y += 6;
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
