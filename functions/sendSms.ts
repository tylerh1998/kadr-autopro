import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import twilio from 'npm:twilio';

const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

const client = new twilio(accountSid, authToken);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Basic security check - ensure user is logged in
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { to, message } = await req.json();

        if (!to || !message) {
            return Response.json({ error: 'Missing "to" or "message" parameter' }, { status: 400 });
        }

        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to
        });

        return Response.json({ 
            success: true, 
            sid: result.sid, 
            status: result.status 
        });

    } catch (error) {
        console.error('Twilio Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});