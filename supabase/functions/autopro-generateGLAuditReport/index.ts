import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

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
  const cronSecret = Deno.env.get('AUTOPRO_CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');
  
  if ((!cronSecret || providedSecret !== cronSecret) && !authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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
    return new Response(JSON.stringify({ error }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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

  const stage5Html = generateTableHtml(auditData.stage5_ar, [
    { key: 'activity_date', label: 'Activity Date' },
    { key: 'target_ref', label: 'Invoice / Reference' },
    { key: 'expected_ar_debit', label: 'Expected AR (Work Orders)' },
    { key: 'ledger_ar_debit', label: 'Posted AR (GL Account 1100)' }
  ]);

  const stage6Html = generateTableHtml(auditData.stage6_gst, [
    { key: 'activity_date', label: 'Activity Date' },
    { key: 'target_ref', label: 'Invoice / Reference' },
    { key: 'expected_gst', label: 'Expected GST Collected (Work Orders)' },
    { key: 'ledger_gst_collected', label: 'Posted GST (GL Account 2002)' }
  ]);

  let stage7Html = '';
  if (auditData.stage7_inventory) {
    const inv = auditData.stage7_inventory;
    stage7Html = `<ul style="list-style-type: none; padding-left: 0; font-size: 15px; color: #374151;">
      <li><strong>Physical Sub-Ledger Value:</strong> $${inv.physical_value?.toFixed(2) || '0.00'}</li>
      <li><strong>GL Account 1200 Value:</strong> $${inv.gl_value?.toFixed(2) || '0.00'}</li>
      <li style="color: ${Math.abs(inv.discrepancy) > 0.01 ? '#dc2626' : '#16a34a'};"><strong>Discrepancy:</strong> $${inv.discrepancy?.toFixed(2) || '0.00'}</li>
    </ul>`;
  }

  const stage8Html = generateTableHtml(auditData.stage8_bank, [
    { key: 'feed_debit', label: 'Expected Debit (Bank Feeds)' },
    { key: 'feed_credit', label: 'Expected Credit (Bank Feeds)' },
    { key: 'gl_debit', label: 'Posted Debit (GL Account 1001)' },
    { key: 'gl_credit', label: 'Posted Credit (GL Account 1001)' }
  ]);

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

      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 5: Accounts Receivable vs. Work Orders</h3>
      ${stage5Html}

      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 6: GST Collected vs. Work Orders</h3>
      ${stage6Html}

      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 7: Live Inventory Valuation vs. Account 1200</h3>
      ${stage7Html}

      <h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Stage 8: Primary Bank Feed vs. Account 1001</h3>
      <p style="font-size: 14px; color: #4b5563;"><em>Note: Compares the total aggregate movement for the 7-day window.</em></p>
      ${stage8Html}
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
     return new Response(JSON.stringify({ error: "Failed to send email", details: resendErr }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, startDate, endDate }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
