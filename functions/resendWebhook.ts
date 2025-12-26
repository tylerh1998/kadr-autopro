import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    console.log('--- Resend webhook received ---');
    
    const base44 = createClientFromRequest(req);

    try {
        const payload = await req.json();
        console.log('Webhook payload:', JSON.stringify(payload, null, 2));

        const eventType = payload.type;
        const data = payload.data;
        const timestamp = payload.created_at;

        // Extract email_id from Resend webhook payload
        const trackingId = data?.email_id;
        
        if (!trackingId) {
            console.log('No email_id found in webhook payload - skipping');
            // Return 200 to acknowledge receipt even if we can't process it, so Resend doesn't retry
            return Response.json({ 
                success: true, 
                message: 'No email_id found, skipped' 
            });
        }

        console.log(`Processing event: ${eventType} for tracking_id: ${trackingId}`);

        // Find the email log by tracking_id
        const emailLogs = await base44.asServiceRole.entities.SentEmailLog.filter({ 
            tracking_id: trackingId 
        });

        if (!emailLogs || emailLogs.length === 0) {
            console.log(`No email log found for tracking_id: ${trackingId} - skipping`);
            // Return 200 to acknowledge receipt so Resend doesn't retry for emails we don't track
            return Response.json({ 
                success: true, 
                message: 'Email log not found, skipped' 
            });
        }

        const emailLog = emailLogs[0];
        const updates = {};

        // Helper function to format timestamp in Mountain Time
        const formatMountainTime = (isoTimestamp) => {
            if (!isoTimestamp) return '';
            const date = new Date(isoTimestamp);
            // Mountain Time is UTC-7 (MST) or UTC-6 (MDT)
            const mtOffset = -7 * 60; // MST offset in minutes
            const localDate = new Date(date.getTime() + mtOffset * 60 * 1000);
            const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(localDate.getUTCDate()).padStart(2, '0');
            const year = localDate.getUTCFullYear();
            const hours = String(localDate.getUTCHours()).padStart(2, '0');
            const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
            return ` (${month}/${day}/${year} ${hours}:${minutes} MT)`;
        };

        const timeStr = formatMountainTime(timestamp);

        // Map Resend webhook events to status updates
        switch (eventType) {
            case 'email.sent':
                updates.status = 'sent';
                updates.status_message = `Email successfully sent${timeStr}`;
                break;

            case 'email.delivered':
                updates.status = 'delivered';
                updates.status_message = `Email delivered successfully${timeStr}`;
                break;

            case 'email.bounced':
                updates.status = 'bounced';
                updates.status_message = `Bounced: ${data?.bounce?.type || 'Unknown'} - ${data?.bounce?.reason || 'No reason provided'}${timeStr}`;
                break;

            case 'email.complained':
                updates.status = 'complained';
                updates.status_message = `Spam complaint received from recipient${timeStr}`;
                break;

            case 'email.delivery_delayed':
                updates.status = 'delivery_delayed';
                updates.status_message = `Delivery delayed: ${data?.delay?.reason || 'Unknown reason'}${timeStr}`;
                break;

            case 'email.opened':
                updates.status = 'opened';
                updates.status_message = `Email opened by recipient${timeStr}`;
                break;

            case 'email.clicked':
                updates.status = 'clicked';
                updates.status_message = `Link clicked by recipient${timeStr}`;
                break;

            default:
                console.log(`Unhandled event type: ${eventType}`);
        }

        // Update the email log if there are changes
        if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.SentEmailLog.update(emailLog.id, updates);
            console.log(`Updated email log ${emailLog.id}:`, updates);
        }

        return Response.json({ 
            success: true, 
            message: 'Webhook processed successfully' 
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});