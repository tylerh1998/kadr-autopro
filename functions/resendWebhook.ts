import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    console.log('--- Resend webhook received ---');
    
    const base44 = createClientFromRequest(req);

    try {
        const payload = await req.json();
        console.log('Webhook payload:', JSON.stringify(payload, null, 2));

        const eventType = payload.type;
        const data = payload.data;

        // Extract email_id from Resend webhook payload
        const trackingId = data?.email_id;
        
        if (!trackingId) {
            console.log('No email_id found in webhook payload');
            return Response.json({ 
                success: false, 
                message: 'No email_id found' 
            }, { status: 400 });
        }

        console.log(`Processing event: ${eventType} for tracking_id: ${trackingId}`);

        // Find the email log by tracking_id
        const emailLogs = await base44.asServiceRole.entities.SentEmailLog.filter({ 
            tracking_id: trackingId 
        });

        if (!emailLogs || emailLogs.length === 0) {
            console.log(`No email log found for tracking_id: ${trackingId}`);
            return Response.json({ 
                success: false, 
                message: 'Email log not found' 
            }, { status: 404 });
        }

        const emailLog = emailLogs[0];
        const updates = {};

        // Map Resend webhook events to status updates
        switch (eventType) {
            case 'email.sent':
                updates.status = 'sent';
                updates.status_message = 'Email successfully sent';
                break;

            case 'email.delivered':
                updates.status = 'delivered';
                updates.status_message = 'Email delivered successfully';
                break;

            case 'email.bounced':
                updates.status = 'bounced';
                updates.status_message = `Bounced: ${data?.bounce?.type || 'Unknown'} - ${data?.bounce?.reason || 'No reason provided'}`;
                break;

            case 'email.complained':
                updates.status = 'complained';
                updates.status_message = `Spam complaint received from recipient`;
                break;

            case 'email.delivery_delayed':
                updates.status = 'delivery_delayed';
                updates.status_message = `Delivery delayed: ${data?.delay?.reason || 'Unknown reason'}`;
                break;

            case 'email.opened':
                // Don't update status for opens, just log it
                console.log(`Email ${trackingId} was opened`);
                break;

            case 'email.clicked':
                // Don't update status for clicks, just log it
                console.log(`Email ${trackingId} was clicked`);
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