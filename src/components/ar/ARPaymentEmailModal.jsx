import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import moment from 'moment-timezone';
import { base44 } from "@/api/base44Client";

const formatMountainDate = (value) => {
  if (!value) return '—';

  const isDateOnlyString = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsedDate = isDateOnlyString
    ? moment.tz(value, 'YYYY-MM-DD', true, 'America/Edmonton')
    : moment.tz(value, 'America/Edmonton');

  return parsedDate.isValid() ? parsedDate.format('MMMM D, YYYY') : '—';
};

export default function ARPaymentEmailModal({ open, onClose, paymentRecord, customerEmail, appliedToDetails = [] }) {
  const [emailData, setEmailData] = useState({ to: '', subject: '', body: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && paymentRecord) {
      const paymentDate = formatMountainDate(paymentRecord.payment_date);
      const paymentAmount = `$${paymentRecord.amount.toFixed(2)}`;

      setEmailData({
        to: customerEmail || '',
        subject: `Payment Receipt - ${paymentAmount} - Ken's Auto`,
        body: `Thank you for your recent payment on ${paymentDate}.`
      });
    }
  }, [open, paymentRecord, customerEmail, appliedToDetails]);

  const handleSend = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('sendARReceiptEmail', {
        paymentId: paymentRecord.id,
        toEmail: emailData.to,
        subject: emailData.subject,
        body: emailData.body
      });

      if (response.data?.success) {
        alert('Receipt email sent successfully!');
        onClose();
      } else {
        throw new Error(response.data?.error || 'Failed to send email');
      }
    } catch (error) {
      console.error("Email sending failed:", error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email Payment Receipt</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email Address</Label>
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
                placeholder="Email Subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="message">Message Body</Label>
              <Textarea
                id="message"
                rows={8}
                value={emailData.body}
                onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Enter your message here..."
              />
            </div>

          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !emailData.to || !emailData.subject || !emailData.body}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}