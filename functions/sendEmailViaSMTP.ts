import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Sends email via Resend API with logging to SentEmailLog
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    let logIdToUpdate = null;

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

        if (!resendApiKey) {
            console.error('Missing RESEND_API_KEY');
            return Response.json({ error: 'Resend API key is not configured.' }, { status: 500 });
        }

        const { to, subject, body, from_name, work_order_id, customer_id, portal_url } = await req.json();

        if (!to || !subject || !body) {
            return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
        }

        // Create log entry without tracking_id (will be set after Resend responds)
        const createdLog = await base44.asServiceRole.entities.SentEmailLog.create({
            to_email: to,
            from_email: fromEmail,
            subject: subject,
            body_preview: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
            body: body,
            status: 'pending',
            sent_date: new Date().toISOString(),
            customer_id: customer_id || null,
            work_order_id: work_order_id || null,
            tracking_id: null,
            portal_url: portal_url || null,
        });
        logIdToUpdate = createdLog.id;

        // Build HTML body
        const htmlBody = `
            <div style="font-family: sans-serif; line-height: 1.6;">
                ${body}
            </div>
        `;

        const fromAddress = from_name ? `${from_name} <${fromEmail}>` : fromEmail;

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [to],
                subject: subject,
                html: htmlBody
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Resend API error:', result);
            throw new Error(result.message || 'Failed to send email via Resend');
        }

        // Update log with sent status and Resend's message ID
        await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, { 
            status: 'sent',
            tracking_id: result.id
        });

        return Response.json({ status: 'success', message: 'Email sent successfully', id: result.id });
    } catch (error) {
        console.error('Error sending email via Resend:', error);

        // Update log to failed status if log was created
        if (logIdToUpdate) {
            await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, {
                status: 'failed',
                status_message: error.message || 'Unknown error',
            }).catch(e => console.error("Failed to update log on error:", e.message));
        }

        // Send internal notification about the failure
        try {
            await base44.integrations.Core.SendEmail({
                to: 'shop@kensauto.ca',
                subject: `Email Sending Failed: ${subject || 'No Subject'}`,
                body: `
An email failed to send immediately via the API.

Error: ${error.message}

Details:
To: ${to}
Subject: ${subject}
Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })}
                `
            });
            console.log('Failure notification sent to shop@kensauto.ca');
        } catch (notifyError) {
            console.error('Failed to send failure notification:', notifyError);
        }

        return Response.json({ error: error.message }, { status: 500 });
    }
});