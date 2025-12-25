import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { format } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
  try {
    console.log('--- sendARReceiptEmail: Starting ---');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId, toEmail, subject, body } = await req.json();
    console.log('--- sendARReceiptEmail: paymentId:', paymentId, 'toEmail:', toEmail, 'subject:', subject);

    if (!paymentId || !toEmail || !subject || !body) {
      return Response.json({ error: 'paymentId, toEmail, subject, and body are required' }, { status: 400 });
    }

    // Fetch the payment record
    const payment = await base44.asServiceRole.entities.CustomerPayments.get(paymentId);
    if (!payment) {
      return Response.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Fetch the customer details
    const customer = await base44.asServiceRole.entities.Customer.get(payment.customer_id);
    if (!customer) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Parse ar_applyto to get applied items for the email body
    const arApplyTo = payment.ar_applyto || '';
    const appliedDetails = [];

    if (arApplyTo) {
      const entries = arApplyTo.split(',').filter(e => e.trim());

      for (const entry of entries) {
        const [recordId, amountStr] = entry.split(':');
        const amount = parseFloat(amountStr);

        if (!recordId || isNaN(amount)) continue;

        try {
          const customerPayment = await base44.asServiceRole.entities.CustomerPayments.get(recordId);
          if (customerPayment) {
            let description = customerPayment.notes || 'Invoice';
            let reference = customerPayment.invoice_number || '';
            
            if (customerPayment.work_order_id) {
                try {
                    const wo = await base44.asServiceRole.entities.WorkOrder.get(customerPayment.work_order_id);
                    if (wo) {
                        description = wo.description || description;
                        reference = wo.inv_number || customerPayment.invoice_number || wo.ro_number || '';
                    }
                } catch (e) {
                    console.warn('Could not fetch work order:', e);
                }
            }

            appliedDetails.push({
              type: 'Invoice',
              reference: reference,
              description: description,
              amountApplied: amount,
              date: customerPayment.payment_date
            });
            continue;
          }
        } catch (e) {
          // Not a payment, try adjustment
        }

        try {
          const adjustment = await base44.asServiceRole.entities.CustomerARAdjustment.get(recordId);
          if (adjustment) {
            appliedDetails.push({
              type: adjustment.amount > 0 ? 'Charge' : 'Credit',
              reference: adjustment.reference || '',
              description: adjustment.description || '',
              amountApplied: amount,
              date: adjustment.adjustment_date
            });
          }
        } catch (e) {
          // Record not found
        }
      }
    }

    // Sort transactions by date, oldest at top
    appliedDetails.sort((a, b) => new Date(a.date) - new Date(b.date));

    const formatPaymentMethod = (method) => {
      if (!method) return 'Unknown';
      return method.replace(/_/g, ' ').split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };

    // Build applied items table HTML
    let appliedItemsHtml = '';
    if (appliedDetails.length > 0) {
      appliedItemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 0;">
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Reference</th>
            <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Description</th>
            <th style="padding: 4px 6px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Amount Applied</th>
          </tr>
          ${appliedDetails.map(d => `
            <tr>
              <td style="padding: 4px 6px; border: 1px solid #ddd; font-size: 12px;">${d.reference}</td>
              <td style="padding: 4px 6px; border: 1px solid #ddd; font-size: 12px;">${d.description}</td>
              <td style="padding: 4px 6px; text-align: right; border: 1px solid #ddd; font-size: 12px;">$${d.amountApplied.toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    const customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    // Create SentEmailLog record
    let emailLogId = null;
    try {
        const emailLog = await base44.asServiceRole.entities.SentEmailLog.create({
            to_email: toEmail,
            from_email: Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca",
            subject: subject,
            body_preview: body.substring(0, 255),
            status: 'pending',
            sent_date: new Date().toISOString(),
            customer_id: customer.id,
            email_type: 'payment_receipt'
        });
        emailLogId = emailLog.id;
        console.log('Created SentEmailLog record:', emailLogId);
    } catch (logError) {
        console.error('Failed to create SentEmailLog record:', logError);
        // Continue sending email even if logging fails, but log the error
    }

    // Build HTML email body using the user-provided body as the intro
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.3;">
        <div style="background-color: #1e40af; color: white; padding: 8px; text-align: center;">
          <h1 style="margin: 0; font-size: 18px;">Payment Receipt</h1>
          <p style="margin: 0; font-size: 12px;">Ken's Auto & Diesel Repair</p>
        </div>
        <div style="padding: 8px; background-color: #f9fafb;">
          <p style="margin: 0 0 6px 0; font-size: 13px;">Hello ${customerName},</p>
          <p style="margin: 0 0 6px 0; font-size: 13px;">${body.replace(/\n\n+/g, '<br>').replace(/\n/g, ' ')}</p>
          <div style="background-color: white; padding: 6px 8px; border-radius: 4px; margin: 0 0 6px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Payment Date:</strong></td>
                <td style="text-align: right; font-size: 13px;">${format(new Date(payment.payment_date), 'MMMM d, yyyy')}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Payment Method:</strong></td>
                <td style="text-align: right; font-size: 13px;">${formatPaymentMethod(payment.payment_method)}</td>
              </tr>${payment.reference ? `
              <tr>
                <td style="padding: 2px 0; font-size: 13px;"><strong>Reference:</strong></td>
                <td style="text-align: right; font-size: 13px;">${payment.reference}</td>
              </tr>` : ''}
              <tr style="border-top: 2px solid #1e40af;">
                <td style="padding: 4px 0 0 0; font-size: 14px;"><strong>Total Payment:</strong></td>
                <td style="text-align: right; font-size: 14px; color: #1e40af; padding-top: 4px;"><strong>$${(payment.amount || 0).toFixed(2)}</strong></td>
              </tr>
            </table>
          </div>${appliedDetails.length > 0 ? `<p style="margin: 0 0 2px 0; font-size: 13px;"><strong>Applied To:</strong></p>${appliedItemsHtml}` : ''}
          <p style="margin: 8px 0 4px 0; font-size: 12px;">If you have any questions about this payment, please don't hesitate to contact us.</p>
          <p style="margin: 0; font-size: 12px;">Best regards,<br><strong>Ken's Auto & Diesel Repair</strong></p>
        </div>
        <div style="background-color: #374151; color: #9ca3af; padding: 6px; text-align: center; font-size: 10px;">
          <p style="margin: 0;">5002 49 Ave • PO Box 160 • Dewberry, AB T0B 1G0 | Phone: 780-847-3002 | Email: Shop@kensauto.ca</p>
        </div>
      </div>
    `;

    console.log('--- sendARReceiptEmail: Sending via Resend API ---');

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";

    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY');
      return Response.json({ error: 'Resend API key is not configured.' }, { status: 500 });
    }

    const fromAddress = `Ken's Auto & Diesel Repair <${fromEmail}>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject: subject,
        html: htmlBody
      })
    });

    const emailResult = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', emailResult);
      if (emailLogId) {
          try {
              await base44.asServiceRole.entities.SentEmailLog.update(emailLogId, { 
                  status: 'failed',
                  status_message: emailResult.message || 'Resend API Error'
              });
          } catch (e) { console.error('Failed to update email log status to failed', e); }
      }
      return Response.json({ error: emailResult.message || 'Failed to send email via Resend' }, { status: response.status });
    }

    if (emailLogId) {
        try {
            await base44.asServiceRole.entities.SentEmailLog.update(emailLogId, { status: 'sent' });
        } catch (e) { console.error('Failed to update email log status to sent', e); }
    }

    console.log('--- sendARReceiptEmail: Email sent successfully, id:', emailResult.id, '---');
    return Response.json({ success: true, message: `Receipt sent to ${toEmail}`, id: emailResult.id });

  } catch (error) {
    console.error('Error sending AR receipt email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});