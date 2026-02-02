import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Sends statement email via Resend API with aged balances
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

        const { to, subject, body, customer_id, portal_url, aged_balances } = await req.json();

        // Support comma-separated recipients
        const recipients = to ? to.split(',').map(email => email.trim()).filter(Boolean) : [];

        if (!to || recipients.length === 0 || !subject || !body) {
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
            work_order_id: null,
            tracking_id: null,
            portal_url: portal_url || null,
        });
        logIdToUpdate = createdLog.id;

        // Build account summary HTML
        let accountSummaryHtml = '';
        if (aged_balances) {
            accountSummaryHtml = `
                <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1e293b;">Account Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">Current</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600;">$${aged_balances.current?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">31-60 Days</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #eab308;">$${aged_balances['30']?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">61-90 Days</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #f97316;">$${aged_balances['60']?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">Over 90 Days</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #dc2626;">$${aged_balances['90+']?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr style="background-color: #1e40af; color: white;">
                            <td style="padding: 10px 8px; font-weight: bold;">Balance Due</td>
                            <td style="padding: 10px 8px; text-align: right; font-weight: bold; font-size: 18px;">$${aged_balances.total?.toFixed(2) || '0.00'}</td>
                        </tr>
                    </table>
                </div>
            `;
        }

        // Build HTML body
        const htmlBody = `
            <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
                ${body.replace(/\n/g, '<br>')}
                ${accountSummaryHtml}
                ${portal_url ? `<div style="text-align: center; margin: 30px 0;"><a href="${portal_url}" style="display: inline-block; padding: 12px 30px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Statement</a></div>` : ''}
            </div>
        `;

        const fromAddress = `Ken's Auto & Diesel Repair <${fromEmail}>`;

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromAddress,
                to: recipients,
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

        return Response.json({ success: true, message: 'Statement email sent successfully', id: result.id });
    } catch (error) {
        console.error('Error sending statement email via Resend:', error);

        // Update log to failed status if log was created
        if (logIdToUpdate) {
            await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, {
                status: 'failed',
                status_message: error.message || 'Unknown error',
            }).catch(e => console.error("Failed to update log on error:", e.message));
        }

        return Response.json({ error: error.message }, { status: 500 });
    }
});