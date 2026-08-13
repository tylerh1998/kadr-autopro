import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendViaResend } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, description, errorMessage, severity, url, userEmail, employeeName, consoleLogs } = await req.json();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailTo = Deno.env.get("SUPPORT_EMAIL_TO");
    const emailFrom = Deno.env.get("SUPPORT_EMAIL_FROM") || "onboarding@resend.dev";

    if (!resendApiKey || !emailTo) {
      throw new Error("Missing RESEND_API_KEY or SUPPORT_EMAIL_TO environment secrets.");
    }

    const logsHtml = Array.isArray(consoleLogs)
      ? consoleLogs.map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`).join("\n")
      : "No logs captured";

    const emailBody = `
      <h2>New Issue Report (WorkPro)</h2>
      <p><strong>From:</strong> ${employeeName} (${userEmail})</p>
      <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
      <p><strong>URL:</strong> ${url}</p>
      <hr />
      <h3>Description:</h3>
      <p>${description}</p>
      
      ${errorMessage ? `<h3>Error Message Displayed:</h3><p>${errorMessage}</p>` : ""}
      
      <hr />
      <h3>Console Logs (Last 100):</h3>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px; font-size: 11px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;">
${logsHtml}
      </pre>
    `;

    const data = await sendViaResend(resendApiKey, emailFrom, [emailTo], `[WorkPro Issue] [${severity.toUpperCase()}] ${title}`, emailBody);
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
