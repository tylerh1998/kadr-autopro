import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    console.log('--- sendAppointmentReminders function invoked. ---');
    const base44 = createClientFromRequest(req);

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

        if (!resendApiKey) {
            throw new Error('Missing RESEND_API_KEY environment variable');
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
            if (appt.reminders_email && appt.start_time && appt.reminder_days_before >= 0) {
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
        
        console.log(`Found ${remindersToSend.length} reminders to send for today.`);

        if (remindersToSend.length === 0) {
            return Response.json({ success: true, message: 'No reminders to send today.' });
        }
        
        // Fetch necessary customer and vehicle data in batches
        const customerIds = [...new Set(remindersToSend.map(r => r.customer_id).filter(Boolean))];
        const vehicleIds = [...new Set(remindersToSend.map(r => r.vehicle_id).filter(Boolean))];
        
        const customers = customerIds.length > 0 ? await base44.asServiceRole.entities.Customer.filter({ id: { $in: customerIds } }) : [];
        const vehicles = vehicleIds.length > 0 ? await base44.asServiceRole.entities.Vehicle.filter({ id: { $in: vehicleIds } }) : [];
        
        const customerMap = new Map(customers.map(c => [c.id, c]));
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

        // Build all email messages and create log entries
        const emailBatch = [];
        const logIdMap = new Map(); // Maps batch index to log DB ID

        for (const appt of remindersToSend) {
            const customer = customerMap.get(appt.customer_id);
            const vehicle = vehicleMap.get(appt.vehicle_id);
            const recipientEmail = appt.reminder_email_address || customer?.email;

            if (!recipientEmail) {
                console.log(`Skipping reminder for appointment ${appt.id}: no email address found.`);
                continue;
            }

            const appointmentDateTime = new Date(appt.start_time);
            const appointmentTime = formatMstTime(appointmentDateTime);
            const appointmentDateStr = formatMstDate(appointmentDateTime);

            const subject = `Appointment Reminder for ${appointmentDateStr}`;
            
            // Build vehicle description
            const vehicleDesc = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A';
            
            try {
                // Create log entry without tracking_id (will be set after Resend responds)
                const createdLog = await base44.asServiceRole.entities.SentEmailLog.create({
                    to_email: recipientEmail,
                    from_email: fromEmail,
                    subject: subject,
                    body_preview: `Appointment reminder for ${appointmentDateStr}`,
                    body: `Appointment: ${appointmentDateStr} at ${appointmentTime} for ${vehicleDesc}`,
                    status: 'pending',
                    sent_date: new Date().toISOString(),
                    customer_id: appt.customer_id || null,
                    appointment_id: appt.id,
                    tracking_id: null,
                });

                // Build HTML body
                const htmlBody = `
                    <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; color: #1e293b;">
                        <p style="font-size: 16px; margin-bottom: 20px;">Hello ${customer?.first_name || 'Valued Customer'},</p>
                        
                        <p style="font-size: 16px; margin-bottom: 20px;">This is a friendly reminder about your upcoming appointment with Ken's Auto & Diesel Repair.</p>
                        
                        <div style="margin: 20px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb;">
                            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b;">Appointment Details</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Date:</td>
                                    <td style="padding: 8px 0; color: #1e293b;">${appointmentDateStr}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Time:</td>
                                    <td style="padding: 8px 0; color: #1e293b;">${appointmentTime}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Vehicle:</td>
                                    <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${vehicleDesc}</td>
                                </tr>
                                ${appt.notes ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #64748b; font-weight: 600; vertical-align: top;">Notes:</td>
                                    <td style="padding: 8px 0; color: #1e293b;">${appt.notes}</td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                        
                        <p style="font-size: 16px; margin-top: 20px;">If you need to reschedule, please call us at <strong style="color: #2563eb;">780-847-3002</strong>.</p>
                        
                        <p style="font-size: 16px; margin-top: 30px; color: #64748b;">Thank you,<br><strong style="color: #1e293b;">Ken's Auto & Diesel Repair</strong></p>
                    </div>
                `;

                // Add to batch array
                emailBatch.push({
                    from: `Ken's Auto & Diesel Repair <${fromEmail}>`,
                    to: [recipientEmail],
                    subject: subject,
                    html: htmlBody
                });

                // Map this batch index to the log DB ID
                logIdMap.set(emailBatch.length - 1, createdLog.id);

            } catch (logError) {
                console.error(`Failed to create log for appointment ${appt.id}:`, logError.message);
                // Skip this email if we can't create a log entry
                continue;
            }
        }

        console.log(`Prepared ${emailBatch.length} emails for batch sending.`);

        if (emailBatch.length === 0) {
            return Response.json({ success: true, message: 'No valid emails to send.' });
        }

        // Send emails in batches of 100
        let sentCount = 0;
        const BATCH_SIZE = 100;
        
        for (let i = 0; i < emailBatch.length; i += BATCH_SIZE) {
            const batch = emailBatch.slice(i, i + BATCH_SIZE);
            console.log(`Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails...`);

            try {
                const response = await fetch('https://api.resend.com/emails/batch', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batch)
                });

                const result = await response.json();

                if (!response.ok) {
                    console.error('Resend Batch API error:', result);
                    throw new Error(result.message || 'Failed to send batch via Resend');
                }

                // Update log entries with sent status and Resend's message IDs
                // result.data is an array of {id: string} for each sent email
                if (result.data && Array.isArray(result.data)) {
                    for (let j = 0; j < result.data.length; j++) {
                        const batchIndex = i + j;
                        const logId = logIdMap.get(batchIndex);
                        if (logId && result.data[j]?.id) {
                            await base44.asServiceRole.entities.SentEmailLog.update(logId, { 
                                status: 'sent',
                                tracking_id: result.data[j].id
                            });
                            sentCount++;
                        }
                    }
                }

                console.log(`Successfully sent batch ${Math.floor(i / BATCH_SIZE) + 1}`);
            } catch (batchError) {
                console.error(`Failed to send batch starting at index ${i}:`, batchError.message);
                
                // Update all logs in this failed batch to failed status
                for (let j = 0; j < batch.length; j++) {
                    const batchIndex = i + j;
                    const logId = logIdMap.get(batchIndex);
                    if (logId) {
                        await base44.asServiceRole.entities.SentEmailLog.update(logId, {
                            status: 'failed',
                            status_message: batchError.message || 'Batch send failed',
                        }).catch(e => console.error("Failed to update log on batch error:", e.message));
                    }
                }
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processed reminders. Sent ${sentCount} of ${remindersToSend.length} scheduled reminders.` 
        });

    } catch (error) {
        console.error('--- Critical error in sendAppointmentReminders function ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        return Response.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
    }
});