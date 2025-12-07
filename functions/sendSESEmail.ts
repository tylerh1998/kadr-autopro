import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    console.log('--- sendSESEmail invoked (using Resend API). ---');
    const base44 = createClientFromRequest(req);
    let logIdToUpdate = null;

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

        if (!resendApiKey) {
            throw new Error('RESEND_API_KEY is not configured.');
        }

        const { to, subject, body, work_order_id, customer_id, portal_url } = await req.json();

        const tracking_id = crypto.randomUUID();
        const createdLog = await base44.asServiceRole.entities.SentEmailLog.create({
            to_email: to,
            from_email: fromEmail,
            subject: subject,
            body_preview: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
            body: body,
            status: 'pending',
            sent_date: new Date().toISOString(),
            customer_id,
            work_order_id,
            tracking_id,
            portal_url,
        });
        logIdToUpdate = createdLog.id;

        const appUrl = new URL(req.url).origin;
        const trackingPixelUrl = `${appUrl}/functions/emailTrackingPixel?tracking_id=${tracking_id}`;

        const htmlBody = `
            <div style="font-family: sans-serif; line-height: 1.6;">
                ${body.replace(/\n/g, '<br>')}
                ${portal_url ? `<br><br><p>For more details, you can view the work order online:</p><a href="${portal_url}" style="display: inline-block; padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Work Order</a>` : ''}
                <img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display: none;" />
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

        await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, { status: 'sent' });

        return Response.json({ success: true, message: 'Email sent successfully.', id: result.id });

    } catch (error) {
        console.error('--- Caught exception in sendSESEmail ---');
        console.error('Error Message:', error.message);

        if (logIdToUpdate) {
            await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, {
                status: 'failed',
                status_message: error.message || 'Unknown error',
            }).catch(e => console.error("Failed to update log on error:", e.message));
        }
        return Response.json({ error: error.message || 'Failed to send email' }, { status: 500 });
    }
});