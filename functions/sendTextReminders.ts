import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import twilio from 'npm:twilio';

const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

// Initialize Twilio client outside the handler if possible, or inside if scope requires it.
// Standard practice: init client once if credentials are constant.
const client = (accountSid && authToken) ? new twilio(accountSid, authToken) : null;

Deno.serve(async (req) => {
    console.log('--- sendTextReminders function invoked. ---');
    const base44 = createClientFromRequest(req);

    try {
        if (!client || !fromNumber) {
             throw new Error('Missing Twilio configuration (SID, Token, or Phone Number)');
        }

        // Use service role to fetch all appointments
        console.log('Fetching all appointments...');
        const appointments = await base44.asServiceRole.entities.Appointment.list();
        console.log(`Found ${appointments.length} total appointments.`);

        // MST/MDT timezone offset (-7 hours, -6 hours during DST)
        const now = new Date();
        const utcTime = now.getTime();
        const mstOffset = -7 * 60 * 60 * 1000; // MST is UTC-7
        const mstTime = new Date(utcTime + mstOffset);
        const todayStr = mstTime.toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log(`Current date in MST: ${todayStr}`);

        const remindersToSend = [];

        for (const appt of appointments) {
            // Check if text reminders enabled and valid phone number exists
            if (appt.reminders_text && appt.reminders_phone && appt.start_time && appt.reminder_days_before >= 0) {
                const appointmentDate = new Date(appt.start_time);
                const appointmentMstTime = new Date(appointmentDate.getTime() + mstOffset);
                
                const reminderDate = new Date(appointmentMstTime);
                reminderDate.setDate(reminderDate.getDate() - appt.reminder_days_before);
                
                const reminderDateStr = reminderDate.toISOString().split('T')[0];

                if (reminderDateStr === todayStr) {
                    remindersToSend.push(appt);
                }
            }
        }
        
        console.log(`Found ${remindersToSend.length} text reminders to send for today.`);

        if (remindersToSend.length === 0) {
            return Response.json({ success: true, message: 'No text reminders to send today.' });
        }
        
        // Fetch necessary vehicle data in batches
        const vehicleIds = [...new Set(remindersToSend.map(r => r.vehicle_id).filter(Boolean))];
        const vehicles = vehicleIds.length > 0 ? await base44.asServiceRole.entities.Vehicle.filter({ id: { $in: vehicleIds } }) : [];
        const vehicleMap = new Map(vehicles.map(v => [v.id, v]));

        // Helper function to format date/time in MST
        const formatMstDate = (date) => {
            const mstDate = new Date(date.getTime() + mstOffset);
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return `${days[mstDate.getUTCDay()]}, ${months[mstDate.getUTCMonth()]} ${mstDate.getUTCDate()}, ${mstDate.getUTCFullYear()}`;
        };

        const formatMstTime = (date) => {
            const mstDate = new Date(date.getTime() + mstOffset);
            let hours = mstDate.getUTCHours();
            const minutes = mstDate.getUTCMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const minutesStr = minutes < 10 ? '0' + minutes : minutes;
            return `${hours}:${minutesStr} ${ampm}`;
        };

        let sentCount = 0;
        let failedCount = 0;

        for (const appt of remindersToSend) {
            try {
                const vehicle = vehicleMap.get(appt.vehicle_id);
                const appointmentDateTime = new Date(appt.start_time);
                const appointmentTime = formatMstTime(appointmentDateTime);
                const appointmentDateStr = formatMstDate(appointmentDateTime);

                const vehicleDesc = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your vehicle';
                
                // Construct the SMS message
                const messageBody = `Reminder: Appointment with Ken's Auto on ${appointmentDateStr} at ${appointmentTime} for ${vehicleDesc}. Call 780-847-3002 to reschedule.`;

                console.log(`Sending SMS to ${appt.reminders_phone} for appt ${appt.id}`);

                await client.messages.create({
                    body: messageBody,
                    from: fromNumber,
                    to: appt.reminders_phone
                });

                sentCount++;
                
                // Optional: Log to SentEmailLog or a new SentSmsLog if it existed. 
                // For now, just console log success.

            } catch (smsError) {
                console.error(`Failed to send SMS for appointment ${appt.id}:`, smsError.message);
                failedCount++;
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processed text reminders. Sent ${sentCount}, Failed ${failedCount} of ${remindersToSend.length} scheduled reminders.` 
        });

    } catch (error) {
        console.error('--- Critical error in sendTextReminders function ---');
        console.error('Error Message:', error.message);
        return Response.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
    }
});