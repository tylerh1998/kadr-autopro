import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function getWorkOrderNumber(workOrder) {
  return workOrder?.inv_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.ro_number || '';
}

function buildHtml({ customerName, total, paid, balance, portalUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <p style="font-size: 16px; margin-bottom: 20px;">Hello ${customerName},</p>
      <p style="font-size: 16px; margin-bottom: 20px;">Please find your work order details below:</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Total:</td>
            <td style="padding: 8px 0; text-align: right;">$${Number(total || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Paid:</td>
            <td style="padding: 8px 0; text-align: right;">$${Number(paid || 0).toFixed(2)}</td>
          </tr>
          <tr style="border-top: 2px solid #dee2e6;">
            <td style="padding: 8px 0; font-weight: 700; font-size: 18px;">Balance Due:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 18px; color: #2563eb;">$${Number(balance || 0).toFixed(2)}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 16px; margin-bottom: 10px;">You can also view it online by following this link:</p>
      <p style="margin-bottom: 30px;"><a href="${portalUrl}" style="color: #2563eb; text-decoration: none;">${portalUrl}</a></p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">View Work Order</a>
      </div>
      <p style="font-size: 16px; margin-top: 30px;">Thank you,<br>Ken's Auto & Diesel Repair</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, customer, workOrders } = await req.json();

    if (!to || !customer || !Array.isArray(workOrders) || workOrders.length === 0) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const customerName = customer.org_name && String(customer.org_name).trim() !== ''
      ? customer.org_name
      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    const results = [];

    for (const workOrder of workOrders) {
      const number = getWorkOrderNumber(workOrder);
      const total = Number(workOrder.total_amount || 0);
      const paid = Number(workOrder.amount_paid || 0);
      const balance = total - paid;
      const portalUrl = workOrder.portal_url;
      const label = `Invoice #${number}`;

      if (!portalUrl) {
        results.push({
          work_order_id: workOrder.id,
          label,
          success: false,
          message: 'Missing portal URL'
        });
        continue;
      }

      const htmlBody = buildHtml({
        customerName,
        total,
        paid,
        balance,
        portalUrl
      });

      try {
        const sendResult = await base44.functions.invoke('sendEmailViaSMTP', {
          to,
          subject: `Invoice #${number} from Ken's Auto & Diesel Repair`,
          body: htmlBody,
          from_name: "Ken's Auto & Diesel Repair",
          work_order_id: workOrder.id,
          customer_id: workOrder.customer_id || customer.id || null,
          portal_url: portalUrl
        });

        if (sendResult.data?.status === 'success') {
          results.push({
            work_order_id: workOrder.id,
            label,
            success: true,
            message: 'Email sent successfully'
          });
        } else {
          results.push({
            work_order_id: workOrder.id,
            label,
            success: false,
            message: sendResult.data?.error || 'Failed to send email'
          });
        }
      } catch (error) {
        results.push({
          work_order_id: workOrder.id,
          label,
          success: false,
          message: error.message
        });
      }
    }

    return Response.json({
      success: true,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});