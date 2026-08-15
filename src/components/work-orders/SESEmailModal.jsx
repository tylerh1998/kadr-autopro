import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Send, Copy, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from '@/lib/supabase';
// Email sent via Resend API through the autopro-sendEmailViaSMTP edge function

export default function SESEmailModal({ open, onClose, workOrder, customer, vehicle, lineItems }) {
  const [sendMode, setSendMode] = useState('email');
  const [emailData, setEmailData] = useState({ to: '', subject: '', body: '' });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [portalUrl, setPortalUrl] = useState('');
  const [snapshotError, setSnapshotError] = useState('');

  const stageTitle = workOrder?.stage === 'estimate' ? 'Estimate' :
                     workOrder?.stage === 'work_order' ? 'Work Order' :
                     workOrder?.stage === 'invoice' ? 'Invoice' :
                     workOrder?.stage === 'credit_invoice' ? 'Credit Invoice' :
                     workOrder?.stage === 'void' ? 'Void' :
                     'Work Order';

  const referenceNumber = workOrder?.crinv_number || workOrder?.inv_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.ro_number || '';

  const customerDisplayName = customer?.org_name || customer?.first_name || '';

  useEffect(() => {
    if (open && workOrder && customer) {
      const total = workOrder.total_amount || 0;
      
      let paid = 0;
      try {
        if (workOrder.payments) {
          const paymentsList = typeof workOrder.payments === 'string' ? JSON.parse(workOrder.payments) : workOrder.payments;
          if (Array.isArray(paymentsList)) {
            paid = paymentsList.reduce((sum, p) => {
              const method = p.payment_method || p.method;
              if (method === 'on_account') {
                return sum;
              }
              return sum + (Number(p.amount) || 0);
            }, 0);
          }
        }
      } catch (e) {
        console.error("Error parsing payments for email balance calculation", e);
        paid = workOrder.amount_paid || 0;
      }
      
      const balance = total - paid;
      
      setEmailData({
        to: customer.email || '',
        subject: `${stageTitle} #${referenceNumber} from Ken's Auto & Diesel Repair`,
        body: JSON.stringify({ stageTitle, referenceNumber, customerName: customerDisplayName, total, paid, balance })
      });
      setPhoneNumber(customer.phone_number || customer.phone || customer.cell_phone || '');
      setCustomMessage('');
      setSendMode('email');
      createSnapshot();
    }
  }, [open, workOrder, customer, stageTitle, referenceNumber, customerDisplayName]);

  const createSnapshot = async () => {
    if (!workOrder?.id) return;
    
    setCreatingSnapshot(true);
    setSnapshotError('');
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('autopro-createPortalSnapshot', {
        body: { work_order_id: workOrder.id }
      });

      if (invokeError) throw invokeError;

      if (data?.success) {
        setPortalUrl(`portal.kensauto.ca/WorkOrder?cp_id=${data.cp_id}`);
      } else {
        throw new Error(data?.error || 'Failed to create portal snapshot');
      }
    } catch (error) {
      console.error('Error creating portal snapshot:', error);
      setSnapshotError(error.message || 'Failed to create portal link');
      setPortalUrl('');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      const data = JSON.parse(emailData.body);

      if (sendMode === 'text') {
        const textMessage = `Ken's Auto ${data.stageTitle}# ${data.referenceNumber}:\n\nHello ${data.customerName},\n\n${customMessage || ''}${customMessage ? '\n\n' : ''}Please find your ${data.stageTitle} at https://${portalUrl}\n\nCall or text us at 7808473002 if you have any questions or concerns.\n\nThank you.`;

        const { data: smsData, error: smsError } = await supabase.functions.invoke('autopro-sendSms', {
          body: {
            to: phoneNumber,
            message: textMessage,
            subject: `${data.stageTitle} #${data.referenceNumber} from Ken's Auto & Diesel Repair`,
            customer_id: customer?.id || null,
            work_order_id: workOrder?.id || null,
            portal_url: portalUrl ? `https://${portalUrl}` : null
          }
        });

        if (smsError) throw smsError;

        if (smsData?.success) {
          alert('Text message sent successfully!');
          onClose();
        } else {
          throw new Error(smsData?.error || 'Failed to send text message');
        }

        return;
      }
      
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello ${data.customerName},</p>
          
          ${customMessage ? `<p style="font-size: 16px; margin-bottom: 20px;">${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
          
          <p style="font-size: 16px; margin-bottom: 20px;">Please find your ${data.stageTitle.toLowerCase()} details below:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Total:</td>
                <td style="padding: 8px 0; text-align: right;">$${data.total.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Paid:</td>
                <td style="padding: 8px 0; text-align: right;">$${data.paid.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td style="padding: 8px 0; font-weight: 700; font-size: 18px;">Balance Due:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 18px; color: #2563eb;">$${data.balance.toFixed(2)}</td>
              </tr>
            </table>
          </div>
          
          <p style="font-size: 16px; margin-bottom: 10px;">You can also view it online by following this link:</p>
          <p style="margin-bottom: 30px;"><a href="https://${portalUrl}" style="color: #2563eb; text-decoration: none;">https://${portalUrl}</a></p>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://${portalUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">View Work Order</a>
          </div>
          
          <p style="font-size: 16px; margin-top: 30px;">Thank you,<br>Ken's Auto & Diesel Repair</p>
        </div>
      `;

      const { data: emailResult, error: emailError } = await supabase.functions.invoke('autopro-sendEmailViaSMTP', {
        body: {
          to: emailData.to,
          subject: emailData.subject,
          body: htmlBody,
          from_name: "Ken's Auto & Diesel Repair",
          work_order_id: workOrder?.id || null,
          customer_id: customer?.id || null,
          portal_url: portalUrl ? `https://${portalUrl}` : null
        }
      });

      if (emailError) throw emailError;

      if (emailResult?.status === 'success') {
        alert('Email sent successfully!');
        onClose();
      } else {
        throw new Error(emailResult?.error || 'Failed to send email');
      }
    } catch (error) {
      console.error("Message sending failed:", error);
      alert(`Failed to send message: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (portalUrl) {
      navigator.clipboard.writeText(`https://${portalUrl}`);
      alert("URL copied to clipboard!");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle>Send Work Order</DialogTitle>
            <ToggleGroup type="single" value={sendMode} onValueChange={(value) => value && setSendMode(value)}>
              <ToggleGroupItem value="email">Email</ToggleGroupItem>
              <ToggleGroupItem value="text">Text</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="space-y-4">
            {sendMode === 'email' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={emailData.to}
                    onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                    placeholder="customer@example.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={emailData.subject}
                    onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Work Order Subject"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="phone">Phone #</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="message">Custom Message (Optional)</Label>
              <Textarea
                id="message"
                rows={4}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a custom message here (optional)..."
              />
            </div>
            
            {portalUrl && (
              <div className="space-y-2">
                <Label htmlFor="portalUrl">Customer Portal URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="portalUrl"
                    value={`https://${portalUrl}`}
                    readOnly
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={handleCopyUrl}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            {creatingSnapshot && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-2 dark:bg-blue-950/30 dark:border-blue-800">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin dark:text-blue-400" />
                <span className="text-sm text-blue-800 dark:text-blue-300">Creating customer portal link...</span>
              </div>
            )}

            {snapshotError && !creatingSnapshot && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2 dark:bg-red-950/30 dark:border-red-800">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5 dark:text-red-400" />
                <div className="text-sm text-red-800 dark:text-red-300">
                  <p className="font-semibold">Error Creating Portal Link</p>
                  <p>{snapshotError}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || creatingSnapshot || !portalUrl || (sendMode === 'email' ? (!emailData.to || !emailData.subject) : !phoneNumber)}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}