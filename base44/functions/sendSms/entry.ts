import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import twilio from 'npm:twilio';

const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

const client = new twilio(accountSid, authToken);

Deno.serve(async (req) => {
    let logId = null;

    try {
        const base44 = createClientFromRequest(req);
        
        // Basic security check - ensure user is logged in
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            to,
            message,
            subject,
            customer_id,
            work_order_id,
            portal_url,
        } = await req.json();

        if (!to || !message) {
            return Response.json({ error: 'Missing "to" or "message" parameter' }, { status: 400 });
        }

        const logEntry = await base44.asServiceRole.entities.SentEmailLog.create({
            to_email: to,
            from_email: 'system generated message',
            subject: subject || 'SMS Message',
            body: message,
            body_preview: message,
            status: 'pending',
            sent_date: new Date().toISOString(),
            customer_id: customer_id || null,
            work_order_id: work_order_id || null,
            portal_url: portal_url || null,
            tracking_id: null,
        });
        logId = logEntry.id;

        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to
        });

        await base44.asServiceRole.entities.SentEmailLog.update(logId, {
            status: 'sent',
            tracking_id: result.sid,
        });

        return Response.json({ 
            success: true, 
            sid: result.sid, 
            status: result.status 
        });

    } catch (error) {
        if (logId) {
            try {
                const base44 = createClientFromRequest(req);
                await base44.asServiceRole.entities.SentEmailLog.update(logId, {
                    status: 'failed',
                    status_message: error.message || 'SMS Send Failed',
                });
            } catch (updateError) {
                console.error('Failed to update SMS log status:', updateError);
            }
        }

        console.error('Twilio Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});