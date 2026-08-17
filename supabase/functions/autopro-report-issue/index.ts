import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendViaResend } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ATTACHMENT_BUCKET = "kadr-issue-report-attachments";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, description, errorMessage, severity, url, userEmail, employeeName, consoleLogs, attachments } = await req.json();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailTo = Deno.env.get("SUPPORT_EMAIL_TO");
    const emailFrom = Deno.env.get("SUPPORT_EMAIL_FROM") || "onboarding@resend.dev";

    if (!resendApiKey || !emailTo) {
      throw new Error("Missing RESEND_API_KEY or SUPPORT_EMAIL_TO environment secrets.");
    }

    const logsHtml = Array.isArray(consoleLogs)
      ? consoleLogs.map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`).join("\n")
      : "No logs captured";

    let attachmentsHtml = "";
    if (Array.isArray(attachments) && attachments.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const links = [];
        for (const attachment of attachments) {
          if (!attachment?.path) continue;
          const { data: signedUrlData } = await supabase.storage
            .from(ATTACHMENT_BUCKET)
            .createSignedUrl(attachment.path, SIGNED_URL_EXPIRY_SECONDS);
          if (signedUrlData?.signedUrl) {
            links.push(`<li><a href="${signedUrlData.signedUrl}">${attachment.filename || attachment.path}</a></li>`);
          }
        }
        if (links.length > 0) {
          attachmentsHtml = `<hr /><h3>Attachments (link expires in 7 days):</h3><ul>${links.join("")}</ul>`;
        }
      }
    }

    const emailBody = `
      <h2>New Issue Report (AutoPRO)</h2>
      <p><strong>From:</strong> ${employeeName} (${userEmail})</p>
      <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
      <p><strong>URL:</strong> ${url}</p>
      <hr />
      <h3>Description:</h3>
      <p>${description}</p>

      ${errorMessage ? `<h3>Error Message Displayed:</h3><p>${errorMessage}</p>` : ""}
      ${attachmentsHtml}

      <hr />
      <h3>Console Logs (Last 100):</h3>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px; font-size: 11px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;">
${logsHtml}
      </pre>
    `;

    const data = await sendViaResend(resendApiKey, emailFrom, [emailTo], `[AutoPRO Issue] [${severity.toUpperCase()}] ${title}`, emailBody);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
