import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function StatementEmailModal({ open, onClose, customer, portalUrl, agedBalances }) {
  const [emailData, setEmailData] = useState({ to: '', subject: '', body: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only set initial email data if customer and portalUrl are available
    if (customer && portalUrl) {
      setEmailData({
        to: customer.email || '',
        subject: `Statement of Account from Ken's Auto & Diesel Repair`,
        // Embed the portalUrl directly into the initial body
        body: `Hello ${customer.first_name || ''},\n\nPlease find your statement of account details by following this link:\n${portalUrl}\n\nThank you,\nKen's Auto & Diesel Repair`
      });
    }
  }, [customer, portalUrl, open]); // Added portalUrl to dependencies

  const handleSend = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('sendStatementEmail', {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body.replace(/\n/g, '<br>'),
        customer_id: customer?.id,
        portal_url: portalUrl,
        aged_balances: agedBalances
      });

      if (response.data?.success) {
        alert('Email sent successfully!');
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
          <DialogTitle>Email Statement</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="space-y-4">
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
                placeholder="Statement Subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={6}
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
          <Button onClick={handleSend} disabled={loading || !emailData.to || !emailData.subject}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}