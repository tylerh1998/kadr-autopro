import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { SESClient, SendEmailCommand } from 'npm:@aws-sdk/client-ses@3';

Deno.serve(async (req) => {
    console.log('sendCustomEmail function invoked.');
    const base44 = createClientFromRequest(req);
    let logIdToUpdate = null;

    try {
        console.log('--- DEPLOYMENT CHECK: AWS SES version is running ---');
        // Read environment variables inside the handler
        const AWS_REGION = Deno.env.get("AWS_REGION");
        const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
        const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
        const SES_FROM_EMAIL = Deno.env.get("SES_FROM_EMAIL");

        // Log the presence of secrets for debugging, not the values
        console.log('Checking for AWS environment variables...', {
            hasAwsRegion: !!AWS_REGION,
            hasAwsAccessKey: !!AWS_ACCESS_KEY_ID,
            hasAwsSecretKey: !!AWS_SECRET_ACCESS_KEY,
            hasSesFromEmail: !!SES_FROM_EMAIL,
        });
        
        if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !SES_FROM_EMAIL) {
             throw new Error("Server is not configured for sending emails. One or more required AWS SES environment variables are missing.");
        }
        
        console.log(`Initializing SES client for region: ${AWS_REGION}`);
        const sesClient = new SESClient({
            region: AWS_REGION,
            credentials: {
                accessKeyId: AWS_ACCESS_KEY_ID,
                secretAccessKey: AWS_SECRET_ACCESS_KEY,
            },
        });
        console.log('SES client initialized successfully.');

        const { to, subject, body, work_order_id, customer_id, portal_url } = await req.json();
        console.log(`Attempting to send email to: ${to} with subject: "${subject}"`);

        const tracking_id = crypto.randomUUID();
        console.log(`Creating email log with tracking ID: ${tracking_id}`);
        const createdLog = await base44.asServiceRole.entities.SentEmailLog.create({
            to_email: to,
            from_email: SES_FROM_EMAIL,
            subject: subject,
            body_preview: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
            status: 'pending',
            sent_date: new Date().toISOString(),
            customer_id,
            work_order_id,
            tracking_id,
        });
        logIdToUpdate = createdLog.id;
        console.log(`Email log created with ID: ${logIdToUpdate}`);

        const appUrl = new URL(req.url).origin;
        const trackingPixelUrl = `${appUrl}/functions/emailTrackingPixel?tracking_id=${tracking_id}`;

        const textBody = `${body}\n\n${portal_url ? `View Work Order online: ${portal_url}` : ''}`;
        
        const htmlBody = `
            <div style="font-family: sans-serif; line-height: 1.6;">
                ${body.replace(/\n/g, '<br>')}
                ${portal_url ? `<br><br><p>For more details, you can view the work order online:</p><a href="${portal_url}" style="display: inline-block; padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Work Order</a>` : ''}
                <img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display: none;" />
            </div>
        `;

        const sendEmailCommand = new SendEmailCommand({
            Source: `"Ken's Auto & Diesel Repair" <${SES_FROM_EMAIL}>`,
            Destination: { ToAddresses: [to] },
            Message: {
                Subject: { Data: subject, Charset: 'UTF-8' },
                Body: {
                    Html: { Data: htmlBody, Charset: 'UTF-8' },
                    Text: { Data: textBody, Charset: 'UTF-8' }
                },
            },
        });

        console.log('Sending email command to SES...');
        await sesClient.send(sendEmailCommand);
        console.log('SES send command successful.');
        
        await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, { status: 'sent' });
        console.log('Email log status updated to "sent".');

        return Response.json({ success: true, message: 'Email sent successfully via SES.' });

    } catch (error) {
        // Log the full error object for detailed diagnostics
        console.error('--- Caught exception in sendCustomEmail ---');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        console.error('Full Error Object:', JSON.stringify(error, null, 2));
        console.error('--- End of exception details ---');

        if (logIdToUpdate) {
            console.log(`Attempting to update log ID ${logIdToUpdate} to "failed".`);
            await base44.asServiceRole.entities.SentEmailLog.update(logIdToUpdate, {
                status: 'failed',
                status_message: error.message || 'Unknown error',
            }).catch(e => console.error("Failed to update log on error:", e.message));
        }
        return Response.json({ error: error.message || 'Failed to send email' }, { status: 500 });
    }
});