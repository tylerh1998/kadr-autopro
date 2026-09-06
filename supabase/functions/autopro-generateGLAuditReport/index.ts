import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function generateTableHtml(data: any[], columns: { key: string, label: string }[]) {
  if (!data || data.length === 0) return "<p><i>None</i></p>";
  
  let html = `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: sans-serif; text-align: left;">`;
  html += `<thead><tr style="background-color: #f3f4f6; border-bottom: 2px solid #d1d5db;">`;
  columns.forEach(col => {
    html += `<th style="padding: 10px; border: 1px solid #e5e7eb;">${col.label}</th>`;
  });
  html += `</tr></thead><tbody>`;
  
  data.forEach((row, idx) => {
    const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
    html += `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #e5e7eb;">`;
    columns.forEach(col => {
      let val = row[col.key];
      if (val === null || val === undefined) val = '-';
      else if (typeof val === 'number') val = val.toFixed(2);
      html += `<td style="padding: 10px; border: 1px solid #e5e7eb;">${val}</td>`;
    });
    html += `</tr>`;
  });
  
  html += `</tbody></table>`;
  return html;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const cronSecret = Deno.env.get('AUTOPRO_CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');
  
  if ((!cronSecret || providedSecret !== cronSecret) && !authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    // Ignore
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
  
  const endDate = body.end_date || new Date().toISOString().split('T')[0];
  const startDate = body.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: auditData, error } = await supabase.rpc('generate_autopro_audit_report', {
    start_date: startDate,
    end_date: endDate
  });

  if (error) {
    console.error("RPC Error:", error);
    return new Response(JSON.stringify({ error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const stage1Html = generateTableHtml(auditData.stage1_imbalances, [
    { key: 'last_date', label: 'Date' },
    { key: 'base_ref', label: 'Reference' },
    { key: 'accounts', label: 'GL Accounts' },
    { key: 'total_debit', label: 'Total Debit' },
    { key: 'total_credit', label: 'Total Credit' }
  ]);

  const stage2Html = generateTableHtml(auditData.stage2_anomalies, [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Reference' },
    { key: 'account_number', label: 'Account' },
    { key: 'debit_amount', label: 'Debit' },
    { key: 'credit_amount', label: 'Credit' },
    { key: 'description', label: 'Description' }
  ]);

  const stage3Html = generateTableHtml(auditData.stage3_discrepancies, [
    { key: 'activity_date', label: 'Activity Date' },
    { key: 'target_ref', label: 'Invoice / Reference' },
    { key: 'expected_ap', label: 'Expected AP (Supplier Invoices)' },
    { key: 'ledger_net_ap', label: 'Posted AP (GL)' },
    { key: 'expected_gst', label: 'Expected GST' },
    { key: 'ledger_net_gst', label: 'Posted GST' }
  ]);

  const stage4NegativesHtml = generateTableHtml(auditData.stage4_negatives, [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Reference' },
    { key: 'account_number', label: 'Account' },
    { key: 'debit_amount', label: 'Debit' },
    { key: 'credit_amount', label: 'Credit' }
  ]);

  const stage4OrphansHtml = generateTableHtml(auditData.stage4_orphans, [
    { key: 'date', label: 'Date' },
    { key: 'account_number', label: 'Account' },
    { key: 'debit_amount', label: 'Debit' },
    { key: 'credit_amount', label: 'Credit' },
    { key: 'description', label: 'Description' }
  ]);

  const stage5_ar = auditData.stage5_ar || {};
  let stage5Html = '';
  if (stage5_ar) {
    stage5Html = `<ul style="list-style-type: none; padding-left: 0; font-size: 15px; color: #374151;">
      <li><strong>Total Customer AR (Sub-Ledger):</strong> $${stage5_ar.sub_ledger_ar?.toFixed(2) || '0.00'}</li>
      <li><strong>Posted AR (GL Account 1100):</strong> $${stage5_ar.gl_ar?.toFixed(2) || '0.00'}</li>
      <li style="color: ${Math.abs(stage5_ar.discrepancy) > 0.01 ? '#dc2626' : '#16a34a'};"><strong>Discrepancy:</strong> $${stage5_ar.discrepancy?.toFixed(2) || '0.00'}</li>
    </ul>`;
  }

  const htmlBody = `
    <div style="font-family: sans-serif; color: #1f2937;">
      <h2 style="color: #111827;">AutoPRO GL Weekly Audit: ${startDate} to ${endDate}</h2>
      
      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 1: Structural Imbalances</h3>
      ${stage1Html}
      
      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 2: Top Inventory Adjustments</h3>
      ${stage2Html}
      
      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 3: Supplier Invoices vs. General Ledger</h3>
      <p style="font-size: 14px; color: #4b5563;"><em>Note: Matches using Net Impact Accounting and 60-day supplier invoice buffer.</em></p>
      ${stage3Html}
      
      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 4: Structural Oddities</h3>
      <h4 style="color: #4b5563; margin-bottom: 5px;">Negative Floats</h4>
      ${stage4NegativesHtml}
      <h4 style="color: #4b5563; margin-bottom: 5px;">Orphaned Records (Missing References)</h4>
      ${stage4OrphansHtml}

      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 5: Accounts Receivable vs. GL Account 1100</h3>
      <p style="font-size: 14px; color: #4b5563;"><em>Note: Checks the total historical balance calculated per the CustomerARSummary formula against the total 1100 GL balance.</em></p>
      ${stage5Html}
    </div>
  `;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AutoPRO Audit <audit@kensauto.ca>",
      to: "tyler@kensauto.ca",
      subject: `🚨 AutoPRO GL Audit Exception Report - ${endDate}`,
      html: htmlBody,
    }),
  });
  
  if (!resendRes.ok) {
     const resendErr = await resendRes.text();
     console.error("Resend API Error:", resendErr);
     return new Response(JSON.stringify({ error: "Failed to send email", details: resendErr }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, startDate, endDate }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
